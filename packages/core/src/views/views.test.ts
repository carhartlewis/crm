import { describe, expect, test } from "bun:test";
import { canEditView, canSeeView, isSavedViewEntity, viewName, viewQuery } from "./index.ts";

describe("saved views", () => {
  test("names are trimmed and short", () => {
    expect(viewName("  My   open deals ")).toEqual({ ok: true, value: "My open deals" });
    expect(viewName("  ").ok).toBe(false);
    expect(viewName("x".repeat(61)).ok).toBe(false);
  });

  test("a query drops the page and sorts its keys", () => {
    expect(viewQuery("?stage=closed_won&page=3&owner=u1")).toEqual({
      ok: true,
      value: "owner=u1&stage=closed_won",
    });
    expect(viewQuery(`q=${"x".repeat(4001)}`).ok).toBe(false);
  });

  test("personal views are the owner's; shared ones every member's", () => {
    expect(canSeeView({ shared: false, ownerId: "a" }, "a")).toBe(true);
    expect(canSeeView({ shared: false, ownerId: "a" }, "b")).toBe(false);
    expect(canEditView({ shared: true, ownerId: "a" }, "b")).toBe(true);
  });

  test("only companies, contacts and deals have views", () => {
    expect(isSavedViewEntity("deal")).toBe(true);
    expect(isSavedViewEntity("activity")).toBe(false);
  });
});
