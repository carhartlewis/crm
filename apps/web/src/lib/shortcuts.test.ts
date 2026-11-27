import { describe, expect, test } from "bun:test";
import {
  ariaKeyShortcuts,
  pinnedShortcut,
  shortcutKeys,
  shortcuts,
  toHotkey,
} from "./shortcuts.ts";

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

describe("create shortcuts", () => {
  test("each record kind has its own, all distinct and free of ⌘", () => {
    const keys = [shortcuts.newCompany, shortcuts.newContact, shortcuts.newDeal].map(toHotkey);

    expect(keys).toEqual(["alt+shift+c", "alt+shift+p", "alt+shift+d"]);
    expect(shortcutKeys(shortcuts.newDeal, true)).toEqual(["⌥", "⇧", "D"]);
  });
});

describe("ariaKeyShortcuts", () => {
  test("names keys the way aria-keyshortcuts expects", () => {
    expect(ariaKeyShortcuts(shortcuts.newCompany, true)).toBe("Alt+Shift+C");
    expect(ariaKeyShortcuts(shortcuts.back, false)).toBe("Control+[");
    expect(ariaKeyShortcuts(pinnedShortcut(0)!, true)).toBe("Alt+1");
  });
});
