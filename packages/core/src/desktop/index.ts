/**
 * Contract between the Electron preload script and the renderer. Client-safe: types and
 * constants only. The preload exposes `window.crmDesktop`; it is absent in a normal browser.
 */
export interface DesktopHandoff {
  readonly code: string;
  readonly verifier: string;
}

export interface DesktopBridge {
  readonly platform: "darwin" | "win32" | "linux";
  /**
   * Runs Google sign-in in the system browser. Resolves with a single-use code and the PKCE
   * verifier; the renderer redeems both at `/api/auth/desktop/redeem` for its own session.
   */
  signInWithGoogle(): Promise<DesktopHandoff>;
}

export const DESKTOP_BRIDGE_KEY = "crmDesktop";

export const DESKTOP_IPC = { signInWithGoogle: "auth:google" } as const;

/** The preload bridge in the Electron app, `undefined` in a normal browser. */
export function desktopBridge(): DesktopBridge | undefined {
  return window.crmDesktop;
}

declare global {
  interface Window {
    readonly crmDesktop?: DesktopBridge;
  }
}
