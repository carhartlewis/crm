import type { JevAnswer, JevClient } from "./jev.ts";
import { experimental_decide } from "ai";

/**
 * Jev on the Vercel AI Gateway (`typesafe-ai/jev`, reached with `AI_GATEWAY_API_KEY`). Jev is a
 * decision model: it answers boolean and choice questions with calibrated probabilities, so
 * memory's thresholds decide, not free text.
 */
export function gatewayJev(model = process.env["JEV_MODEL"] ?? "typesafe-ai/jev"): JevClient {
  return {
    async decide(request, signal) {
      const result = await experimental_decide({
        model,
        // An object state is one JSON part.
        state: JSON.parse(JSON.stringify(request.state)),
        questions: Object.fromEntries(
          Object.entries(request.questions).map(([id, question]) => [
            id,
            question.type === "boolean"
              ? {
                  type: "boolean" as const,
                  instructions: question.instructions,
                  criteria: { ...question.criteria },
                }
              : {
                  type: "choice" as const,
                  instructions: question.instructions,
                  criteria: { ...question.criteria },
                },
          ]),
        ),
        abortSignal: signal,
      });

      const answers: Record<string, JevAnswer> = {};

      for (const [id, answer] of Object.entries(result.answers)) {
        if (answer.type === "boolean") {
          answers[id] = { type: "boolean", probability: answer.probability };
        } else if (answer.type === "choice") {
          const choice = String(answer.choice);

          answers[id] = {
            type: "choice",
            choice,
            probability: answer.probabilities?.[choice] ?? 1,
          };
        }
      }

      return { model: result.response.modelId, answers };
    },
  };
}
