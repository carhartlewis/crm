import {
  DESKTOP_BRIDGE_KEY,
  DESKTOP_IPC,
  type DesktopBridge,
  type DesktopHandoff,
} from "@crm/core/desktop";
import { contextBridge, ipcRenderer } from "electron";

const platform = (): DesktopBridge["platform"] =>
  process.platform === "darwin" || process.platform === "win32" ? process.platform : "linux";

/** Accepts only the exact shape main sends; anything else is a bug, not data to pass on. */
function isHandoff(value: unknown): value is DesktopHandoff {
  return (
    value instanceof Object &&
    "code" in value &&
    "verifier" in value &&
    String(value.code) === value.code &&
    String(value.verifier) === value.verifier
  );
}

const bridge: DesktopBridge = {
  platform: platform(),
  async signInWithGoogle() {
    const handoff: unknown = await ipcRenderer.invoke(DESKTOP_IPC.signInWithGoogle);

    if (!isHandoff(handoff)) throw new Error("Desktop sign-in returned an invalid result");

    return handoff;
  },
  haptic() {
    ipcRenderer.send(DESKTOP_IPC.haptic);
  },
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, bridge);
