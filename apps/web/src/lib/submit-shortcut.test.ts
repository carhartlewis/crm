import { describe, expect, test } from "bun:test";
import { formToSubmit } from "./submit-shortcut.ts";

const key = (overrides: Partial<Parameters<typeof formToSubmit>[0]> = {}) => ({
  key: "Enter",
  metaKey: true,
  ctrlKey: false,
  repeat: false,
  isComposing: false,
  ...overrides,
});

const inForm = { closest: () => "the form" };
const outside = { closest: () => null };

describe("⌘Enter submits the focused form", () => {
  test("⌘Enter on a Mac and Ctrl+Enter elsewhere pick the form around the focus", () => {
    expect(formToSubmit(key(), inForm, true)).toBe("the form");
    expect(formToSubmit(key({ metaKey: false, ctrlKey: true }), inForm, false)).toBe("the form");
  });

  test("plain Enter, the other modifier, held keys, composing text and no form do nothing", () => {
    expect(formToSubmit(key({ metaKey: false }), inForm, true)).toBeNull();
    expect(formToSubmit(key({ metaKey: false, ctrlKey: true }), inForm, true)).toBeNull();
    expect(formToSubmit(key({ repeat: true }), inForm, true)).toBeNull();
    expect(formToSubmit(key({ isComposing: true }), inForm, true)).toBeNull();
    expect(formToSubmit(key(), outside, true)).toBeNull();
    expect(formToSubmit(key(), null, true)).toBeNull();
  });
});
