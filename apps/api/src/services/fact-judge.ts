import type { JevClient } from "@crm/memory/jev";
import type { FactJudge } from "./Intel.ts";

/** How sure Jev must be before its reading counts; below it the fact is `unsure`. */
export const JUDGEMENT_THRESHOLD = 0.8;

/** How long a fact waits for Jev; past it, the fact is `unsure`. */
export const JUDGEMENT_WAIT_MS = 4000;

/**
 * Jev (a decision model) reads a value the agent found against the one a member typed: the same
 * thing in other words, or a real change such as a new job. Unsure, slow or unavailable reads as
 * `unsure`, and the shared rules then keep the member's value or ask (ADR 0025).
 */
export function jevFactJudge(jev: JevClient): FactJudge {
  return async ({ field, current, proposed, evidence }) => {
    const result = await jev
      .decide(
        {
          state: { field, memberValue: current, foundValue: proposed, evidence: [...evidence] },
          questions: {
            reading: {
              type: "choice",
              instructions:
                "A CRM member typed memberValue for a contact's field. Research found foundValue, with evidence. Decide how foundValue relates to memberValue.",
              criteria: {
                same: "They say the same thing in different words, abbreviations or formats.",
                update:
                  "foundValue is newer or more correct, and the evidence shows it (such as a new job or a corrected profile link).",
                unsure: "They differ and the evidence does not show which is right.",
              },
            },
          },
        },
        AbortSignal.timeout(JUDGEMENT_WAIT_MS),
      )
      .catch(() => null);

    const answer = result?.answers["reading"];

    if (answer?.type !== "choice" || answer.probability < JUDGEMENT_THRESHOLD) return "unsure";

    const choice: string = answer.choice;

    return choice === "same" || choice === "update" ? choice : "unsure";
  };
}
