import { describe, expect, test } from "bun:test";
import { rubberBand } from "@crm/ui/lib/rubber-band";

describe("rubberBand", () => {
  test("resists more the further you pull, never reaching the dimension", () => {
    const small = rubberBand(50, 400);
    const large = rubberBand(500, 400);

    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(50);
    expect(large - small).toBeLessThan(450);
    expect(rubberBand(1e9, 400)).toBeLessThan(400);
  });

  test("is symmetric and zero at rest", () => {
    expect(rubberBand(-120, 400)).toBeCloseTo(-rubberBand(120, 400));
    expect(rubberBand(0, 400)).toBe(0);
    expect(rubberBand(10, 0)).toBe(0);
  });
});
