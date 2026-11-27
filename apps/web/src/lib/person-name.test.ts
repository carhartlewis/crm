import { expect, test } from "bun:test";
import { fullName, nameParts } from "./person-name.ts";

test("the first word is the first name, the rest the last name", () => {
  expect(nameParts("  Mary Ann  van Dyke ")).toEqual({
    firstName: "Mary",
    lastName: "Ann van Dyke",
  });
  expect(nameParts("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  expect(fullName({ firstName: " Mary ", lastName: "" })).toBe("Mary");
  expect(fullName(nameParts("Mary Ann van Dyke"))).toBe("Mary Ann van Dyke");
});
