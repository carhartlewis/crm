import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { preloadable } from "@crm/ui/lib/preloadable";

function Greeting({ name }: { name: string }) {
  return <p>{`Hello ${name}`}</p>;
}

describe("preloadable", () => {
  test("loads the module once, however often it is preloaded", async () => {
    let loads = 0;

    const Lazy = preloadable(async () => {
      loads += 1;

      return { default: Greeting };
    });

    await Promise.all([Lazy.preload(), Lazy.preload()]);
    await Lazy.preload();

    expect(loads).toBe(1);
  });

  test("renders synchronously once preloaded", async () => {
    const Lazy = preloadable(async () => ({ default: Greeting }));

    await Lazy.preload();

    expect(renderToString(<Lazy name="Ada" />)).toContain("Hello Ada");
  });
});
