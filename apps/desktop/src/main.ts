import { DESKTOP_IPC, type DesktopHandoff } from "@crm/core/desktop";
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  session,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createHaptics, nativeHaptics } from "./haptics.ts";
import { startLoopback } from "./loopback.ts";
import { contentSecurityPolicy, isAllowedExternal, isAppUrl } from "./security.ts";

const WEB_URL = new URL(process.env["CRM_WEB_URL"] ?? "http://localhost:3000");
const API_URL = new URL(process.env["CRM_API_URL"] ?? "http://localhost:3001");
const CSP = contentSecurityPolicy(!app.isPackaged);

// Chromium net errors worth retrying while the dev server starts: refused, reset, not reachable.
const RETRYABLE_LOAD_ERRORS = new Set([-102, -101, -105, -106, -109, -118]);

let window: BrowserWindow | null = null;
let inFlightSignIn: Promise<DesktopHandoff> | null = null;

// Every renderer is sandboxed, including any created by a dependency.
app.enableSandbox();

// Guards for every web contents, not only the main window.
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) void shell.openExternal(url);

    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (isAppUrl(url, WEB_URL.origin)) return;

    event.preventDefault();

    if (isAllowedExternal(url)) void shell.openExternal(url);
  });
  contents.on("will-redirect", (event, url) => {
    if (!isAppUrl(url, WEB_URL.origin)) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

function hardenSession() {
  const ses = session.defaultSession;

  // Deny by default; copy buttons need clipboard writes from the app itself.
  ses.setPermissionRequestHandler((contents, permission, callback) =>
    callback(
      permission === "clipboard-sanitized-write" && isAppUrl(contents.getURL(), WEB_URL.origin),
    ),
  );
  ses.setPermissionCheckHandler(
    (_contents, permission, origin) =>
      permission === "clipboard-sanitized-write" && isAppUrl(origin, WEB_URL.origin),
  );

  ses.webRequest.onHeadersReceived({ urls: [`${WEB_URL.origin}/*`] }, (details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CSP] },
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // Matches the theme `--background` token so the first paint does not flash the wrong mode.
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#000000" : "#fcfcfc",
    titleBarStyle: "hiddenInset",
    // Centered (y ≈ 30px) on the web app's title-bar rows: the sidebar's top row and the page
    // panel's bar (components/shell). Move them together.
    trafficLightPosition: { x: 16, y: 23 },
    webPreferences: {
      // Not __dirname: Bun inlines it as the source directory at build time.
      preload: join(app.getAppPath(), "dist", "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Dev only: the web server may still be starting. Retry connection errors with backoff, and
  // show the window after a few tries so a dead server is visible, not an app that never opens.
  let attempt = 0;

  win.webContents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    const retryable =
      !app.isPackaged &&
      isMainFrame &&
      RETRYABLE_LOAD_ERRORS.has(code) &&
      isAppUrl(url, WEB_URL.origin);

    if (!retryable) return;

    attempt += 1;

    if (attempt === 4) win.show();

    setTimeout(
      () => {
        if (!win.isDestroyed()) void win.loadURL(WEB_URL.href);
      },
      Math.min(250 * 2 ** attempt, 5000),
    );
  });
  win.webContents.on("did-finish-load", () => {
    attempt = 0;
  });

  void win.loadURL(WEB_URL.href);
  win.on("closed", () => {
    window = null;
  });

  return win;
}

function focusWindow() {
  window ??= createWindow();

  if (window.isMinimized()) window.restore();

  window.show();
  window.focus();
}

/** IPC is accepted only from the app's own top-level frame. */
function assertTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent) {
  const frame = event.senderFrame;

  if (!frame || frame !== event.sender.mainFrame || !isAppUrl(frame.url, WEB_URL.origin)) {
    throw new Error("IPC from an untrusted frame");
  }
}

/**
 * Google sign-in in the system browser (RFC 8252): loopback listener + state + PKCE. Resolves
 * with a single-use code and the verifier; the renderer redeems both for its own session.
 */
async function signInWithGoogle(): Promise<DesktopHandoff> {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const loop = await startLoopback();

  try {
    const start = new URL("/api/desktop/google", API_URL);

    start.searchParams.set("port", String(loop.port));
    start.searchParams.set("state", loop.state);
    start.searchParams.set("challenge", challenge);
    await shell.openExternal(start.href);

    return { code: await loop.code, verifier };
  } finally {
    loop.close();
    focusWindow();
  }
}

ipcMain.handle(DESKTOP_IPC.signInWithGoogle, (event) => {
  assertTrustedSender(event);
  // One attempt at a time: a second click joins the attempt already open in the browser.
  inFlightSignIn ??= signInWithGoogle().finally(() => {
    inFlightSignIn = null;
  });

  return inFlightSignIn;
});

const haptics = createHaptics({
  platform: process.platform,
  now: () => performance.now(),
  load: () => nativeHaptics(createRequire(join(app.getAppPath(), "package.json"))),
});

ipcMain.on(DESKTOP_IPC.haptic, (event) => {
  assertTrustedSender(event);
  haptics.perform();
});

async function launch() {
  await app.whenReady();
  hardenSession();
  // Open the connection to the app origin (it also serves /api) before the window exists, so
  // the first document request skips DNS, TCP and TLS setup.
  session.defaultSession.preconnect({ url: WEB_URL.origin, numSockets: 2 });
  window = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) window = createWindow();
  });
}

// One app instance: a second launch focuses the existing window and exits immediately.
if (app.requestSingleInstanceLock()) {
  app.on("second-instance", focusWindow);
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  void launch();
} else {
  app.exit(0);
}
