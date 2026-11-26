import { describe, expect, test } from "bun:test";
import { matchesShortcut, pinnedShortcut, shortcutKeys, shortcuts } from "./shortcuts.ts";

const key = (
  code: string,
  mods: Partial<Record<"meta" | "ctrl" | "alt" | "shift", boolean>> = {},
) => ({
  code,
  metaKey: mods.meta ?? false,
  ctrlKey: mods.ctrl ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
});

describe("matchesShortcut", () => {
  test("mod is ⌘ on Apple platforms and Ctrl elsewhere", () => {
    expect(matchesShortcut(key("KeyK", { meta: true }), shortcuts.palette, true)).toBe(true);
    expect(matchesShortcut(key("KeyK", { ctrl: true }), shortcuts.palette, true)).toBe(false);
    expect(matchesShortcut(key("KeyK", { ctrl: true }), shortcuts.palette, false)).toBe(true);
  });

  test("extra modifiers don't match, so ⌘⇧K isn't ⌘K", () => {
    expect(matchesShortcut(key("KeyK", { meta: true, shift: true }), shortcuts.palette, true)).toBe(
      false,
    );
  });

  test("matches on the physical key, so ⌥1 works although it types ¡", () => {
    expect(matchesShortcut(key("Digit1", { alt: true }), pinnedShortcut(0)!, true)).toBe(true);
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
