import { describe, expect, test } from "bun:test";
import { checkFiles, FILE_ACCEPT, MAX_FILES, messageContent } from "./attachments.ts";

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name);

const pdf = {
  url: "https://x.public.blob.vercel-storage.com/chat-files/cht_1/a.pdf",
  mediaType: "application/pdf",
  filename: "Diligence.pdf",
};

describe("attachments", () => {
  test("documents, sheets, images and text up to 30 MB; not pages or programs", () => {
    const check = checkFiles(
      [
        file("Diligence.pdf"),
        file("SAFE Amendment.docx"),
        file("Plan.xlsx"),
        file("page.html"),
        file("huge.pdf", 30 * 1024 * 1024 + 1),
        file("empty.csv", 0),
      ],
      0,
    );

    expect(check.accepted.map((accepted) => accepted.name)).toEqual([
      "Diligence.pdf",
      "SAFE Amendment.docx",
      "Plan.xlsx",
    ]);
    expect(check.refused).toEqual([
      "page.html isn't a file chats take",
      "huge.pdf is larger than 30 MB",
      "empty.csv is empty",
    ]);
    expect(checkFiles([file("a.png")], MAX_FILES).refused).toEqual([`At most ${MAX_FILES} files`]);
    expect(FILE_ACCEPT).toContain(".xlsx");
  });

  test("text alone stays text; with files, the text comes first and files go by URL", () => {
    expect(messageContent("Hi", [])).toBe("Hi");
    expect(messageContent("Summarize this", [pdf])).toEqual([
      { type: "text", text: "Summarize this" },
      { type: "file", mediaType: "application/pdf", filename: "Diligence.pdf", data: pdf.url },
    ]);
    expect(messageContent("", [pdf])).toHaveLength(1);
  });
});
