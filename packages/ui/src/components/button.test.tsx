import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@crm/ui/components/button";

describe("Button loading state", () => {
  test("is busy, disabled, and shows a labelled spinner while keeping its label in layout", () => {
    const html = renderToStaticMarkup(<Button loading>Create workspace</Button>);

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(' disabled=""');
    expect(html).toContain('data-loading="true"');
    expect(html).toContain('aria-label="Loading"');
    expect(html).toContain(">Create workspace<");
  });

  test("idle buttons have no spinner and stay enabled", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);

    expect(html).not.toContain("aria-busy");
    // Match the attribute, not the `disabled:` Tailwind variants in the class list.
    expect(html).not.toContain(' disabled=""');
    expect(html).not.toContain('data-slot="spinner"');
  });
});
