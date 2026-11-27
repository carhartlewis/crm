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
import { always } from "eve/tools/approval";
import { defineTool } from "eve/tools";
import { z } from "zod";
import type {
  CrmCompany,
  CrmMemory,
  MemoryForget,
  MemoryNote,
  MemorySearch,
} from "./crm-memory.ts";
import {
  type TurnCandidate,
  type TurnMessage,
  candidatesOf,
  latestTurn,
  messageText,
  transcriptOf,
} from "./turn-memory.ts";

/**
 * CRM memory as an eve memory provider (ADR 0014):
 *
 * - recall: before each turn, the member's own company and the companies the message names.
 * - capture: after each turn, the whole chat is saved to workspace memory, and Jev judges the
 *   member's messages and sent emails one by one; what it keeps is noted in their words on the
 *   workspace or the company it is about, replacing a fact it makes out of date.
 * - tools: search, remember and forget, scoped to the caller's workspace by their CRM token.
 */

export interface CrmMemoryProviderOptions {
  /** The CRM memory client for a signed-in user. */
  readonly memoryFor: (userId: string) => CrmMemory;
  /** Jev, or null without an AI Gateway key: chats are still saved, no facts are judged. */
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
  if (caller?.principalType !== "user") return null;

  return { id: caller.principalId, name: MemberName.parse(caller.attributes["name"]) };
}

/** The CRM keeps one chat source per session; its id allows letters, digits and hyphens. */
export function chatId(sessionId: string) {
  return sessionId.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 64);
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
        const recall = await options.memoryFor(user.id).recall(query, ctx.abortSignal);

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

        const memory = options.memoryFor(user.id);
        const messages: readonly TurnMessage[] = ctx.messages;

        try {
          await memory.saveChat(
            { sessionId: chatId(ctx.session.id), transcript: transcriptOf(messages, user.name) },
            ctx.abortSignal,
          );
        } catch (cause) {
          log("memory: saving the chat failed", cause);
        }

        const candidates = candidatesOf(latestTurn(messages), user.name, now());

        if (!options.jev || candidates.length === 0) return;

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

    async tools(ctx) {
      const user = userOf(ctx.session.auth.current);

      if (!user) return null;

      const memory = options.memoryFor(user.id);

      const companyId = z
        .string()
        .optional()
        .describe(
          "The CRM company id the fact is about (from the recalled memory or the CRM). Leave it out for the member's own company.",
        );

      return {
        search: defineTool({
          description:
            "Search what the CRM remembers: website research, members' notes, past chats and sent emails. Search one company, or the member's own company.",
          inputSchema: z.object({ query: z.string().min(1).max(500), companyId }),
          execute: async (input) => {
            const search: MemorySearch = { query: input.query };

            if (input.companyId) search.companyId = input.companyId;

            return { facts: await memory.search(search) };
          },
        }),
        remember: defineTool({
          description:
            "Save one lasting fact the member told you or asked you to remember, in their words. Pass `replaces` with a fact id when it corrects that fact. Never save secrets or private personal data.",
          inputSchema: z.object({
            text: z.string().min(1).max(4_000),
            companyId,
            replaces: z
              .string()
              .optional()
              .describe("The id of a fact this one makes out of date."),
          }),
          execute: async (input) => {
            const note: MemoryNote = { kind: "agent_fact", text: input.text };

            if (input.companyId) note.companyId = input.companyId;

            if (input.replaces) note.replaces = input.replaces;

            await memory.remember(note);

            return { saved: true, note: "Facts appear in memory a few seconds after saving." };
          },
        }),
        forget: defineTool({
          description: "Forget one remembered fact by its id, when the member says it is wrong.",
          inputSchema: z.object({ factId: z.string().min(1), companyId }),
          approval: always(),
          execute: async (input) => {
            const request: MemoryForget = { factId: input.factId };

            if (input.companyId) request.companyId = input.companyId;

            await memory.forget(request);

            return { forgotten: true };
          },
        }),
      };
    },
  });
}
