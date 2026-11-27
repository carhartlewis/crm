import { describe, expect, test } from "bun:test";
import {
  ariaKeyShortcuts,
  claimsCopyShortcut,
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

const selected = (text: string) => ({ isCollapsed: text === "", toString: () => text });

describe("claimsCopyShortcut", () => {
  test("creates when nothing is selected and focus is on the page", () => {
    expect(claimsCopyShortcut(selected(""), null)).toBe(true);
    expect(claimsCopyShortcut(null, null)).toBe(true);
  });

  test("leaves ⌘C as copy when text is selected", () => {
    expect(claimsCopyShortcut(selected("Acme Inc."), null)).toBe(false);
  });

  test("leaves ⌘C alone while typing in a field", () => {
    expect(claimsCopyShortcut(selected(""), { tagName: "INPUT" })).toBe(false);
    expect(claimsCopyShortcut(selected(""), { tagName: "DIV", isContentEditable: true })).toBe(
      false,
    );
  });
});

describe("ariaKeyShortcuts", () => {
  test("names keys the way aria-keyshortcuts expects", () => {
    expect(ariaKeyShortcuts(shortcuts.create, true)).toBe("Meta+C");
    expect(ariaKeyShortcuts(shortcuts.back, false)).toBe("Control+[");
    expect(ariaKeyShortcuts(pinnedShortcut(0)!, true)).toBe("Alt+1");
  });
});
