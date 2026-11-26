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
    dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    // React `style` props and Base UI positioning set inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    dev ? "connect-src 'self' ws://localhost:*" : "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
