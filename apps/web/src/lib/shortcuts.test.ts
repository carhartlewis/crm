import { describe, expect, test } from "bun:test";
import { pinnedShortcut, shortcutKeys, shortcuts, toHotkey } from "./shortcuts.ts";

describe("toHotkey", () => {
  test("spells shortcuts the way react-hotkeys-hook matches event.code", () => {
    expect(toHotkey(shortcuts.palette)).toBe("mod+k");
    expect(toHotkey(shortcuts.back)).toBe("mod+bracketleft");
    expect(toHotkey(pinnedShortcut(0)!)).toBe("alt+1");
    expect(toHotkey({ code: "KeyP", mod: true, shift: true })).toBe("mod+shift+p");
  });
});

describe("shortcutKeys", () => {
  test("labels keys for the platform", () => {
    expect(shortcutKeys(shortcuts.back, true)).toEqual(["⌘", "["]);
    expect(shortcutKeys(pinnedShortcut(2)!, false)).toEqual(["Alt", "3"]);
  });

  test("only the first nine pinned pages get a shortcut", () => {
    expect(pinnedShortcut(8)?.code).toBe("Digit9");
    expect(pinnedShortcut(9)).toBeUndefined();
  });
});
