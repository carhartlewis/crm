import { describe, expect, test } from "bun:test";
import { checkImages, MAX_IMAGE_BYTES, messageContent } from "./attachments.ts";

const file = (name: string, type: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type });

const image = {
  id: "1",
  filename: "shot.png",
  mediaType: "image/png",
  dataUrl: "data:image/png;base64,AA==",
};

describe("image attachments", () => {
  test("only small PNG, JPEG, GIF and WebP images, at most four a message", () => {
    const check = checkImages(
      [
        file("a.png", "image/png"),
        file("b.pdf", "application/pdf"),
        file("c.jpg", "image/jpeg", MAX_IMAGE_BYTES + 1),
        file("d.webp", "image/webp"),
        file("e.gif", "image/gif"),
      ],
      2,
    );

    expect(check.accepted.map((accepted) => accepted.name)).toEqual(["a.png", "d.webp"]);
    expect(check.refused).toEqual([
      "b.pdf isn't a PNG, JPEG, GIF or WebP",
      "c.jpg is larger than 3 MB",
      "At most 4 images",
    ]);
  });

  test("text alone stays text; with images, the text comes first", () => {
    expect(messageContent("Hi", [])).toBe("Hi");
    expect(messageContent("What is this?", [image])).toEqual([
      { type: "text", text: "What is this?" },
      { type: "file", mediaType: "image/png", filename: "shot.png", data: image.dataUrl },
    ]);
    expect(messageContent("", [image])).toHaveLength(1);
  });
});
