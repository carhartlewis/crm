import close from "@carbon/icons/es/close/16.js";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { carbonIcon, Icon } from "@crm/ui/components/icon";

const CloseIcon = carbonIcon(close);

describe("Carbon icon", () => {
  test("renders the descriptor's paths with currentColor, hidden from assistive tech", () => {
    const html = renderToStaticMarkup(<CloseIcon className="size-4" />);

    expect(html).toContain('viewBox="0 0 32 32"');
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-icon="close"');
    expect(html).toContain("<path d=");
    expect(html).toContain('class="shrink-0 size-4"');
  });

  test("a labelled icon is exposed as an image", () => {
    const html = renderToStaticMarkup(<Icon icon={close} aria-label="Close" />);

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Close"');
    expect(html).not.toContain("aria-hidden");
  });

  test("converts Carbon's dashed attributes to React props", () => {
    const html = renderToStaticMarkup(
      <Icon
        icon={{
          elem: "svg",
          name: "test",
          size: 16,
          attrs: { viewBox: "0 0 16 16" },
          content: [
            {
              elem: "path",
              attrs: {
                d: "M0 0",
                "fill-rule": "evenodd",
                "data-icon-path": "inner-path",
                opacity: 0,
              },
            },
          ],
        }}
      />,
    );

    expect(html).toContain('fill-rule="evenodd"');
    expect(html).toContain('data-icon-path="inner-path"');
  });
});
