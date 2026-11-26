import { desktopBridge } from "@crm/core/desktop";

/** A trackpad tap in the desktop app (macOS); nothing in a browser, which has no trackpad API. */
export function haptic() {
  desktopBridge()?.haptic();
}
