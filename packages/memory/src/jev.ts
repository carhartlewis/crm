/**
 * Jev: the judge that decides whether something a member said or sent belongs in memory.
 * Adapted from comp-neo's activity judge. Jev answers fixed questions with probabilities; the
 * thresholds below, not the model, make the decision, and the kept note quotes the source words
 * instead of a model's summary.
 *
 * The client is injected: the agent runs Jev through the Vercel AI Gateway (`apps/agent`), tests
 * pass a fake.
 */

export interface JevBooleanQuestion {
  readonly type: "boolean";
  readonly instructions: string;
  readonly criteria: { readonly true: string; readonly false: string };
}

export interface JevChoiceQuestion {
  readonly type: "choice";
  readonly instructions: string;
  /** Choice id → what it means. */
  readonly criteria: Readonly<Record<string, string>>;
}

export type JevQuestion = JevBooleanQuestion | JevChoiceQuestion;

export type JevAnswer =
  | { readonly type: "boolean"; readonly probability: number }
  | { readonly type: "choice"; readonly choice: string; readonly probability: number };

/** Question id → question. */
export type JevQuestions = Readonly<Record<string, JevQuestion>>;

export interface JevRequest {
  readonly state: unknown;
  readonly questions: JevQuestions;
}

export interface JevResponse {
  readonly model: string;
  readonly answers: Readonly<Record<string, JevAnswer>>;
}

export interface JevClient {
  decide(request: JevRequest, signal?: AbortSignal): Promise<JevResponse>;
}

/** Something a member said in chat or sent by email, to judge. */
export interface Candidate {
  readonly what: "chat_message" | "sent_email";
  readonly who: string;
  /** ISO date. */
  readonly date: string;
  readonly text: string;
}

/** A memory the candidate could belong to. `id` is "workspace" or a company id. */
export interface SubjectChoice {
  readonly id: string;
  readonly description: string;
}

/** A fact already in memory, with an id unique across the subjects offered. */
export interface KnownFact {
  readonly id: string;
  readonly text: string;
}

export const WORKSPACE_SUBJECT = "workspace";

const NONE = "none";

export const JEV_THRESHOLDS = {
  sensitive: 0.5,
  lasting: 0.6,
  subject: 0.5,
  contradicts: 0.7,
  known: 0.8,
} as const;

export function jevQuestions(subjects: readonly SubjectChoice[], knownFacts: readonly KnownFact[]) {
  const questions = {
    sensitive: {
      type: "boolean",
      instructions:
        "`candidate.text` contains a secret, a password, a key, or private personal data about a person.",
      criteria: {
        true: "`candidate.text` includes a password, an API key, a token, a card number, a recovery code, or private data about one person, such as a home address, a health condition, a salary, or a personal phone number.",
        false:
          "`candidate.text` names companies, people's work roles, products, deals, plans, prices, dates or work processes, and holds no credential and no private data about one person.",
      },
    },
    lasting: {
      type: "boolean",
      instructions:
        "`candidate.text` states a lasting fact about a company: the member's own company or a customer, prospect or partner.",
      criteria: {
        true: "`candidate.text` says something that stays true after this conversation, such as what a company does, who works there and in which role, which tools it uses, what it needs, its budget or timeline, a decision, a commitment, a price that was agreed, a preference, or how the member's own company works.",
        false:
          "`candidate.text` is a greeting, a thank-you, a question to the assistant, a request to do a task now, an opinion about the conversation, or a status update with no lasting meaning, such as 'send it' or 'what do we know about Acme?'.",
      },
    },
    subject: {
      type: "choice",
      instructions: "Which company is `candidate.text` about?",
      criteria: {
        ...Object.fromEntries(subjects.map((subject) => [subject.id, subject.description])),
        [NONE]: "`candidate.text` is about none of these companies.",
      },
    },
  } satisfies JevQuestions;

  if (knownFacts.length === 0) return questions;

  return {
    ...questions,
    known: {
      type: "boolean",
      instructions: "A fact in `known_facts` already states the same thing as `candidate.text`.",
      criteria: {
        true: "A fact in `known_facts` gives the same information as `candidate.text`, also in other words.",
        false:
          "No fact in `known_facts` gives this information, or a fact gives a different value, such as another person, another date, another price or another tool.",
      },
    },
    contradicts: {
      type: "choice",
      instructions: "Which fact in `known_facts` does `candidate.text` make out of date?",
      criteria: {
        ...Object.fromEntries(knownFacts.map((fact) => [fact.id, fact.text])),
        [NONE]: "`candidate.text` makes none of the facts in `known_facts` out of date.",
      },
    },
  } satisfies JevQuestions;
}

/** What Jev reads: the candidate, plus the known facts when there are some. */
interface JevState {
  readonly workspace: string;
  readonly candidate: Candidate;
  known_facts?: readonly KnownFact[];
}

export type JevDecision =
  | {
      readonly action: "ignored";
      readonly reason: "sensitive" | "not_lasting" | "no_subject" | "known";
    }
  | { readonly action: "noted"; readonly subject: string }
  | { readonly action: "replaced"; readonly subject: string; readonly factId: string };

function probability(response: JevResponse, id: string) {
  const answer = response.answers[id];

  if (answer?.type !== "boolean") throw new Error(`Jev did not answer "${id}" with yes or no.`);

  return answer.probability;
}

function choice(response: JevResponse, id: string) {
  const answer = response.answers[id];

  if (answer?.type !== "choice") throw new Error(`Jev did not choose an answer for "${id}".`);

  return { id: answer.choice === NONE ? null : answer.choice, probability: answer.probability };
}

/** Applies the thresholds. Pure, so the rules are tested without a model. */
export function decide(response: JevResponse, hasKnownFacts: boolean): JevDecision {
  if (probability(response, "sensitive") >= JEV_THRESHOLDS.sensitive) {
    return { action: "ignored", reason: "sensitive" };
  }

  if (probability(response, "lasting") < JEV_THRESHOLDS.lasting) {
    return { action: "ignored", reason: "not_lasting" };
  }

  const subject = choice(response, "subject");

  if (!subject.id || subject.probability < JEV_THRESHOLDS.subject) {
    return { action: "ignored", reason: "no_subject" };
  }

  if (!hasKnownFacts) return { action: "noted", subject: subject.id };

  const contradicted = choice(response, "contradicts");

  if (contradicted.id && contradicted.probability >= JEV_THRESHOLDS.contradicts) {
    return { action: "replaced", subject: subject.id, factId: contradicted.id };
  }

  if (probability(response, "known") >= JEV_THRESHOLDS.known) {
    return { action: "ignored", reason: "known" };
  }

  return { action: "noted", subject: subject.id };
}

export interface Judgment {
  readonly decision: JevDecision;
  readonly model: string;
}

export async function judge(
  client: JevClient,
  input: {
    readonly workspace: string;
    readonly candidate: Candidate;
    readonly subjects: readonly SubjectChoice[];
    readonly knownFacts: readonly KnownFact[];
  },
  signal?: AbortSignal,
): Promise<Judgment> {
  const state: JevState = { workspace: input.workspace, candidate: input.candidate };

  if (input.knownFacts.length > 0) state.known_facts = input.knownFacts;

  const response = await client.decide(
    {
      state,
      questions: jevQuestions(input.subjects, input.knownFacts),
    },
    signal,
  );

  return { decision: decide(response, input.knownFacts.length > 0), model: response.model };
}

/** The note Jev keeps: the member's own words, dated, never a summary. */
export function noteText(candidate: Candidate) {
  const day = candidate.date.slice(0, 10);
  const how = candidate.what === "sent_email" ? "wrote in an email" : "said in a CRM chat";

  return `On ${day}, ${candidate.who} ${how}: "${candidate.text.trim()}"`;
}
