import { describe, expect, it } from "bun:test";

import { parseStoredColumns, resolveHiddenColumns } from "./stored-columns";

describe("resolveHiddenColumns", () => {
  it("uses the columns in the URL, so a link shows its own view", () => {
    expect(
      resolveHiddenColumns({
        fromUrl: ["owner"],
        stored: ["risk"],
        defaults: ["status"],
      }),
    ).toEqual(["owner"]);
  });

  it("uses the columns that this device keeps when the URL has none", () => {
    expect(
      resolveHiddenColumns({
        fromUrl: null,
        stored: ["risk"],
        defaults: ["status"],
      }),
    ).toEqual(["risk"]);
  });

  it("uses the default columns when the URL and the device have none", () => {
    expect(
      resolveHiddenColumns({
        fromUrl: null,
        stored: null,
        defaults: ["status"],
      }),
    ).toEqual(["status"]);
  });

  it("keeps an empty list in the URL: the person shows every column", () => {
    expect(resolveHiddenColumns({ fromUrl: [], stored: ["risk"], defaults: [] })).toEqual([]);
  });
});

describe("parseStoredColumns", () => {
  it("reads a list of column IDs", () => {
    expect(parseStoredColumns('["owner","risk"]')).toEqual(["owner", "risk"]);
  });

  it("reads an empty list: the person shows every column", () => {
    expect(parseStoredColumns("[]")).toEqual([]);
  });

  it("gives null when the device keeps nothing", () => {
    expect(parseStoredColumns(null)).toBeNull();
  });

  it("gives null for text that is not JSON", () => {
    expect(parseStoredColumns("owner,risk")).toBeNull();
  });

  it("gives null for JSON that is not a list of strings", () => {
    expect(parseStoredColumns('{"owner":true}')).toBeNull();
    expect(parseStoredColumns('["owner",3]')).toBeNull();
  });
});
