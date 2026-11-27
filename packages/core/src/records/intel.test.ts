import { describe, expect, test } from "bun:test";
import {
  activityMetaLine,
  bandFor,
  readBriefSections,
  relationship,
  factOutcome,
  needsJudgement,
  sameFactValue,
} from "./intel.ts";

describe("contact intel rules", () => {
  test("bands follow the score", () => {
    expect([bandFor(0.95), bandFor(0.7), bandFor(0.2)]).toEqual([
      "verified",
      "probable",
      "possible",
    ]);
  });

  test("activity meta reads as messages or duration and attendees", () => {
    expect(activityMetaLine("email", { messages: 12 })).toBe("12 messages");
    expect(activityMetaLine("meeting", { durationMinutes: 45, attendees: 4 })).toBe(
      "45 min · 4 attendees",
    );
    expect(activityMetaLine("note", { messages: 3 })).toBeNull();
    expect(activityMetaLine("email", null)).toBeNull();
  });

  test("a malformed brief reads as empty sections", () => {
    expect(readBriefSections({ currentRole: 4 })).toEqual({});
    expect(readBriefSections({ currentRole: "CTO" })).toEqual({ currentRole: "CTO" });
  });

  test("we know them: messages, the latest reply, past meetings and the next one", () => {
    const now = "2026-11-26T12:00:00.000Z";

    const known = relationship(
      [
        {
          type: "email",
          contact_id: "ctc_a",
          subject: "Pricing",
          occurred_at: "2026-11-20T09:00:00.000Z",
          meta: { messages: 5, lastReplyAt: "2026-11-24T09:00:00.000Z" },
        },
        {
          type: "email",
          contact_id: "ctc_a",
          subject: "Intro",
          occurred_at: "2026-10-01T09:00:00.000Z",
          meta: null,
        },
        {
          type: "meeting",
          contact_id: "ctc_a",
          subject: "Kickoff",
          occurred_at: "2026-11-02T15:00:00.000Z",
          meta: null,
        },
        {
          type: "meeting",
          contact_id: "ctc_a",
          subject: "Rollout checkpoint",
          occurred_at: "2026-12-11T15:00:00.000Z",
          meta: null,
        },
        {
          type: "meeting",
          contact_id: "ctc_b",
          subject: "Other",
          occurred_at: "2026-12-01T15:00:00.000Z",
          meta: null,
        },
      ],
      "ctc_a",
      now,
    );

    expect(known).toEqual({
      emails: 6,
      lastEmailAt: "2026-11-24T09:00:00.000Z",
      meetings: 1,
      nextMeeting: { at: "2026-12-11T15:00:00.000Z", subject: "Rollout checkpoint" },
    });
  });
});

describe("factOutcome", () => {
  const fact = { score: 0.8, value: "VP of Engineering", current: null, agentOwned: false };

  test("fills an empty field, confirms the same value, and replaces the agent's own", () => {
    expect(factOutcome(fact)).toBe("applied");
    expect(factOutcome({ ...fact, current: "vp of engineering " })).toBe("applied");
    expect(factOutcome({ ...fact, current: "Engineer", agentOwned: true })).toBe("applied");
  });

  test("stores nothing the agent is unsure of", () => {
    expect(factOutcome({ ...fact, score: 0.4 })).toBe("too_unsure");
  });

  test("keeps a member's value unless Jev reads a real update and the agent is very sure", () => {
    const member = { ...fact, current: "VP Eng" };

    expect(needsJudgement(member)).toBe(true);
    expect(factOutcome({ ...member, judgement: "same", score: 0.95 })).toBe("kept");
    expect(factOutcome({ ...member, judgement: "update" })).toBe("kept");
    expect(factOutcome({ ...member, judgement: "update", score: 0.95 })).toBe("applied");
    expect(factOutcome({ ...member, judgement: "unsure", score: 0.95 })).toBe("proposed");
  });

  test("compares links without scheme, www or a final slash", () => {
    expect(sameFactValue("https://www.linkedin.com/in/ada/", "linkedin.com/in/ada")).toBe(true);
  });
});
