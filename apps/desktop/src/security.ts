/**
 * Electron security policy (https://www.electronjs.org/docs/latest/tutorial/security), kept
 * free of Electron imports so it is unit-tested. `main.ts` applies it to every web contents.
 */

/** Only these leave the app, and only through the OS (`shell.openExternal`). */
const EXTERNAL_PROTOCOLS = new Set(["https:", "mailto:"]);

export function isAllowedExternal(url: string) {
  return URL.canParse(url) && EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
}

/** The renderer may only ever show the app's own origin. */
export function isAppUrl(url: string, appOrigin: string) {
  return URL.canParse(url) && new URL(url).origin === appOrigin;
}

/**
 * CSP for the app origin. Dev allows inline scripts for the Bun dev server's injected
 * bootstrap; packaged builds load only same-origin scripts.
 */
export function contentSecurityPolicy(dev: boolean) {
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets the Markdown renderer (@pierre/words) compile its WebAssembly. It
    // allows WebAssembly compilation only, not eval() or new Function().
    dev
      ? "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'"
      : "script-src 'self' 'wasm-unsafe-eval'",
    // React `style` props and Base UI positioning set inline styles.
    "style-src 'self' 'unsafe-inline'",
    // Stored images (avatars, workspace logos): Vercel Blob, or the local RustFS container in dev.
    dev
      ? "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com http://127.0.0.1:59000"
      : "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
    "font-src 'self'",
    dev ? "connect-src 'self' ws://localhost:*" : "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
