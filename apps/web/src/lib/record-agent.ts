import { useSyncExternalStore } from "react";
import type { RecordKind } from "./records.ts";

/**
 * A record sheet's Agent tab (ADR 0024): chats about one company, contact or deal. The agent
 * reads the record before each turn; this module holds the tab's words, the fixed prompts the
 * sheet's buttons send, and which conversation each record's tab shows.
 */

export interface AgentTabCopy {
  readonly title: string;
  readonly description: string;
  readonly suggestions: readonly [string, string, string];
  readonly placeholder: string;
}

/** The empty tab, as in the Paper designs ("Company agent tab" and friends). */
export const AGENT_TAB_COPY: Record<RecordKind, AgentTabCopy> = {
  company: {
    title: "Ask about this company",
    description: "It reads their site and our own history with them, and shows its working.",
    suggestions: ["What do they do?", "Who do we know here?", "What has changed recently?"],
    placeholder: "What do they sell?",
  },
  contact: {
    title: "Ask about this person",
    description: "Every step is shown as it happens, including the leads it throws away.",
    suggestions: [
      "Who is this person?",
      "Are they still there?",
      "What should I know before a call?",
    ],
    placeholder: "Are they still there?",
  },
  deal: {
    title: "Ask about this deal",
    description: "It can read the thread, the meetings and the people on both sides of it.",
    suggestions: [
      "Where does this stand?",
      "Who else should be involved?",
      "What is the risk here?",
    ],
    placeholder: "Where has this stalled?",
  },
};

/** A message a sheet button sends, and the title of the chat it starts. */
export interface AgentPrompt {
  readonly title: string;
  readonly text: string;
}

/** Research on the company sheet: the agent fills the profile and adds its key people. */
export const researchCompanyPrompt = (name: string): AgentPrompt => ({
  title: `Research ${name}`,
  text: "Research this company and fill in its profile: description, industry, headcount, founded year, city, country, phone, email and social links, plus any custom fields that have agent briefs. Then add its key people as contacts, following your research-company skill. Mark the research as running while you work, then complete.",
});

/** Re-enrich on the contact sheet: the agent fills their details and writes their background. */
export const enrichContactPrompt = (name: string): AgentPrompt => ({
  title: `Re-enrich ${name}`,
  text: "Re-enrich this contact: find their work email, phone number, title, seniority, function, LinkedIn, X and GitHub, photo, where they are based and their career so far. Save each value you are sure of and write their background. Mark the research as running while you work, then complete.",
});

/** Record actions (ADR 0027): one lookup on this record, saved when it checks out. */
export const findEmailPrompt = (name: string): AgentPrompt => ({
  title: `Find email: ${name}`,
  text: "Find this contact's work email with crm__find_email and record it as an email fact. Tell me the address and whether it is verified.",
});

export const verifyEmailPrompt = (name: string): AgentPrompt => ({
  title: `Verify email: ${name}`,
  text: "Check this contact's email address with crm__verify_email and record it again as an email fact so the CRM keeps its status. Tell me the result in one sentence.",
});

export const findPhonePrompt = (name: string): AgentPrompt => ({
  title: `Find phone: ${name}`,
  text: "Find this contact's phone number with crm__find_phone and record it as a phone fact with its line type. Tell me the number and whether the line is live.",
});

export const findPeoplePrompt = (name: string): AgentPrompt => ({
  title: `Find people at ${name}`,
  text: "Find the key people at this company with crm__find_people by its domain: founders, executives and heads of department who work there now. Show me who you found; don't add them until I pick.",
});

/** Sync email & calendar from a record's Activity tab. */
export const syncActivityPrompt = (kind: RecordKind, name: string): AgentPrompt => ({
  title: `Sync email & calendar: ${name}`,
  text: `Sync email & calendar for this ${kind}: find my threads and meetings with ${kind === "contact" ? "them" : "its contacts"} in my connected mail and calendar, and log each one.`,
});

/** Each record's open conversation: a chat id, or absent for New conversation. */
const selected = new Map<string, string>();
const listeners = new Set<() => void>();

const keyOf = (kind: RecordKind, id: string) => `${kind}:${id}`;

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

/** Shows `chatId` in the record's Agent tab; null goes back to New conversation. */
export function selectRecordChat(kind: RecordKind, id: string, chatId: string | null) {
  const key = keyOf(kind, id);

  if (chatId === null) selected.delete(key);
  else selected.set(key, chatId);

  for (const listener of listeners) listener();
}

/** The conversation the record's Agent tab shows; null for New conversation. */
export function useSelectedRecordChat(kind: RecordKind, id: string) {
  return useSyncExternalStore(
    subscribe,
    () => selected.get(keyOf(kind, id)) ?? null,
    () => null,
  );
}
