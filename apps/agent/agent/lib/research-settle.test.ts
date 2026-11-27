import { describe, expect, test } from "bun:test";
import type { CrmCaller } from "./crm-caller.ts";
import { settlement } from "./research-settle.ts";

const research: CrmCaller = {
  userId: "user_1",
  workspaceId: "ws_1",
  permissionMode: "auto",
  record: { kind: "contact", id: "ctc_1" },
  origin: "research",
  researchJob: "research-ctc_1",
};

describe("settlement", () => {
  test("background research frees its queue slot and settles its record", () => {
    expect(settlement(research, "failed")).toEqual({
      job: "research-ctc_1",
      record: { kind: "contact", id: "ctc_1" },
      outcome: "failed",
    });
  });

  test("deals and fills free their slot; they have no status to settle", () => {
    expect(
      settlement(
        { ...research, record: { kind: "deal", id: "del_1" }, researchJob: "research-del_1" },
        "completed",
      ),
    ).toEqual({ job: "research-del_1", record: null, outcome: "completed" });
    expect(
      settlement({ ...research, record: null, researchJob: "fill-fld_1-42" }, "completed"),
    ).toEqual({ job: "fill-fld_1-42", record: null, outcome: "completed" });
  });

  test("a session started before the queue still settles by its record", () => {
    expect(settlement({ ...research, researchJob: null }, "completed")?.job).toBe("research-ctc_1");
  });

  test("chats and callers without a workspace leave research alone", () => {
    expect(settlement({ ...research, origin: "sheet" }, "completed")).toBeNull();
    expect(settlement({ ...research, workspaceId: null }, "completed")).toBeNull();
    expect(settlement(null, "completed")).toBeNull();
  });
});
