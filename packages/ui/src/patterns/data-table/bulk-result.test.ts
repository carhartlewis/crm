import { describe, expect, it } from "bun:test";

import { bulkToast } from "./bulk-result";

const copy = {
  done: (count: number) => `${count} deleted.`,
  someFailed: (count: number) => `${count} did not change.`,
  nothingChanged: "Nothing changed.",
};

describe("bulkToast", () => {
  it("gives a success when each row changed", () => {
    expect(bulkToast({ succeeded: 3, failed: 0, message: null }, copy)).toEqual({
      type: "success",
      title: "3 deleted.",
    });
  });

  it("gives a warning with the cause when some rows did not change", () => {
    expect(
      bulkToast({ succeeded: 2, failed: 1, message: "The policy does not exist." }, copy),
    ).toEqual({
      type: "warning",
      title: "2 deleted. 1 did not change. The policy does not exist.",
    });
  });

  it("gives an error with the cause when no row changed", () => {
    expect(
      bulkToast({ succeeded: 0, failed: 2, message: "The owner must be a member." }, copy),
    ).toEqual({ type: "error", title: "The owner must be a member." });
  });

  it("gives an error without a cause when no row changed", () => {
    expect(bulkToast({ succeeded: 0, failed: 0, message: null }, copy)).toEqual({
      type: "error",
      title: "Nothing changed.",
    });
  });
});
