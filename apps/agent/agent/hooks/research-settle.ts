import { defineHook } from "eve/hooks";
import { crmCaller } from "../lib/crm-caller.ts";
import { crmToken } from "../lib/crm-token.ts";
import { apiUrl } from "../lib/gateway.ts";
import { settlement } from "../lib/research-settle.ts";

const SETTLE_TIMEOUT_MS = 10_000;

/** Tells the API how a research turn ended; the API changes only a record still left open. */
async function report(auth: Parameters<typeof crmCaller>[0], outcome: string) {
  const caller = crmCaller(auth);
  const body = settlement(caller, outcome);

  if (!caller || !body) return;

  const token = await crmToken(caller);

  if (!token) return;

  const response = await fetch(new URL("/api/agent/research/settle", apiUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SETTLE_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`The CRM refused the research outcome (${response.status})`);
}

const warn = (cause: unknown) => console.warn("research: settling the record failed", cause);

/**
 * Background research (ADR 0025) ends with its turn. If the agent never marked the record, the
 * record would show "Researching" until the API's sweep. When the turn settles, or pauses for an
 * approval that nobody in a background session can give, the API closes the record's research.
 */
export default defineHook({
  events: {
    async "turn.settled"(event, ctx) {
      await report(ctx.session.auth.current, event.data.outcome).catch(warn);
    },
    async "turn.paused"(_event, ctx) {
      await report(ctx.session.auth.current, "paused").catch(warn);
    },
  },
});
