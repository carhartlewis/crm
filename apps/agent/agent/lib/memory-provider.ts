import { type CrmCaller, crmCaller } from "./crm-caller.ts";
import { companiesForEmails, mentionedCompanies } from "@crm/memory";
import {
  type JevClient,
  type KnownFact,
  type SubjectChoice,
  WORKSPACE_SUBJECT,
  judge,
  noteText,
} from "@crm/memory/jev";
import { formatRecall } from "@crm/memory/recall";
import { defineMemoryProvider, type MemoryOperationContext } from "eve/memory";
import { z } from "zod";
import type { CrmCompany, CrmMemory, MemoryNote, MemorySearch } from "./crm-memory.ts";
import {
  type TurnCandidate,
  type TurnMessage,
  candidatesOf,
  latestTurn,
  messageText,
} from "./turn-memory.ts";

/**
 * CRM memory as an eve memory provider (ADR 0014):
 *
 * - recall: before each turn, the member's own company and the companies the message names.
 * - capture: after each turn, Jev judges the member's messages and sent emails one by one. Jev
 *   alone decides what memory keeps: a kept message is noted in the member's words on the
 *   workspace or the company it is about, replacing a fact it makes out of date. The chat itself
 *   is never saved, so a greeting adds nothing (as in comp-neo).
 * - tools: none here. Search, remember and forget are CRM tools on the MCP gateway
 *   (`crm__search_memory`, `crm__remember`, `crm__forget`; ADR 0018).
 */

export interface CrmMemoryProviderOptions {
  /** The CRM memory client for a signed-in user. */
  readonly memoryFor: (caller: CrmCaller) => CrmMemory;
  /** Jev, or null without an AI Gateway key: then nothing from a chat is kept. */
  readonly jev: JevClient | null;
  readonly now?: () => Date;
  readonly log?: (message: string, cause?: unknown) => void;
}

type Caller = MemoryOperationContext["session"]["auth"]["current"];

const RECALL_ID = "crm-memory";

const KNOWN_PER_SUBJECT = 3;

const MAX_COMPANIES = 4;

/** The member's display name from their session; anything else reads as "The member". */
const MemberName = z.string().min(1).catch("The member");

function userOf(caller: Caller) {
  const crm = crmCaller(caller);

  if (!crm || !caller) return null;

  return { id: crm.userId, crm, name: MemberName.parse(caller.attributes["name"]) };
}

function subjectsFor(turn: TurnCandidate, companies: readonly CrmCompany[], workspace: string) {
  const named = [
    ...companiesForEmails(turn.recipients, companies),
    ...mentionedCompanies(turn.candidate.text, companies),
  ];

  const unique = [...new Map(named.map((company) => [company.id, company])).values()].slice(
    0,
    MAX_COMPANIES,
  );

  return {
    companies: unique,
    choices: [
      {
        id: WORKSPACE_SUBJECT,
        description: `${workspace}, the member's own company: how it works, what it sells, its team and its plans.`,
      },
      ...unique.map((company) => ({
        id: company.id,
        description: `${company.name}${company.domain ? ` (${company.domain})` : ""}, a company in the member's CRM.`,
      })),
    ] satisfies SubjectChoice[],
  };
}

export function crmMemoryProvider(options: CrmMemoryProviderOptions) {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((message, cause) => console.warn(message, cause));

  /** Judges one candidate and writes what Jev keeps. */
  const learn = async (
    memory: CrmMemory,
    turn: TurnCandidate,
    companies: readonly CrmCompany[],
    workspace: string,
    signal: AbortSignal,
  ) => {
    if (!options.jev) return;

    const subjects = subjectsFor(turn, companies, workspace);

    // An email to no CRM company could still be about the member's own company.
    const searches = await Promise.all(
      [null, ...subjects.companies].map(async (company) => {
        const search: MemorySearch = { query: turn.candidate.text };

        if (company) search.companyId = company.id;

        const hits = await memory.search(search).catch(() => []);

        return hits
          .slice(0, KNOWN_PER_SUBJECT)
          .map((hit) => ({ factId: hit.factId, text: hit.text, companyId: company?.id }));
      }),
    );

    const known = searches.flat();
    const byId = new Map(known.map((fact, index) => [`f${index + 1}`, fact]));
    const knownFacts: KnownFact[] = [...byId].map(([id, fact]) => ({ id, text: fact.text }));

    const { decision } = await judge(
      options.jev,
      { workspace, candidate: turn.candidate, subjects: subjects.choices, knownFacts },
      signal,
    );

    if (decision.action === "ignored") return;

    const kind = turn.candidate.what === "sent_email" ? "email" : "agent_fact";
    const text = noteText(turn.candidate);

    if (decision.action === "replaced") {
      const fact = byId.get(decision.factId);

      if (fact) {
        const correction: MemoryNote = { kind, text, replaces: fact.factId };

        if (fact.companyId) correction.companyId = fact.companyId;

        await memory.remember(correction);

        return;
      }
    }

    const note: MemoryNote = { kind, text };

    if (decision.subject !== WORKSPACE_SUBJECT) note.companyId = decision.subject;

    await memory.remember(note);
  };

  return defineMemoryProvider({
    recall: {
      async "turn.started"(ctx) {
        const user = userOf(ctx.session.auth.current);

        if (!user) return null;

        const query = ctx.turn.input.map(messageText).join("\n").slice(0, 1_000);
        const recall = await options.memoryFor(user.crm).recall(query, ctx.abortSignal);

        // A stable id replaces what an earlier turn recalled instead of piling up copies.
        return {
          messages: [
            {
              id: RECALL_ID,
              content:
                formatRecall(recall) ??
                "<crm_memory>Nothing remembered for this turn.</crm_memory>",
            },
          ],
        };
      },
    },

    capture: {
      async "turn.completed"(ctx) {
        const user = userOf(ctx.session.auth.current);

        if (!user) return;

        const messages: readonly TurnMessage[] = ctx.messages;
        const candidates = candidatesOf(latestTurn(messages), user.name, now());

        if (!options.jev || candidates.length === 0) return;

        const memory = options.memoryFor(user.crm);

        try {
          const [companies, recall] = await Promise.all([
            memory.companies(ctx.abortSignal),
            memory.recall("", ctx.abortSignal),
          ]);

          const workspace = recall.workspace.name || "The member's company";

          // One at a time, so a later candidate sees what an earlier one noted.
          for (const candidate of candidates) {
            // oxlint-disable-next-line no-await-in-loop -- a turn has at most four candidates.
            await learn(memory, candidate, companies, workspace, ctx.abortSignal).catch((cause) =>
              log("memory: judging a message failed", cause),
            );
          }
        } catch (cause) {
          log("memory: learning from the turn failed", cause);
        }
      },
    },
  });
}
