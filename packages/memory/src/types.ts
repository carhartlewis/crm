/**
 * What a memory is about. A workspace remembers its own company; each CRM company has its own
 * memory. People join when contacts are stored records.
 */
export type MemorySubject =
  | { readonly type: "workspace" }
  | { readonly type: "company"; readonly companyId: string };

/** Where a source's text came from. */
export const MEMORY_SOURCE_KINDS = [
  /** context.dev brand data and the website's home page. */
  "website_research",
  /** A note a member wrote on the Workspace knowledge page or a company. */
  "member_note",
  /** A fact the agent saved with its `remember` tool, or that Jev kept from a chat. */
  "agent_fact",
  /** A whole in-app conversation with the agent. */
  "chat",
  /** An email a member sent through a connected app. */
  "email",
] as const;

export type MemorySourceKind = (typeof MEMORY_SOURCE_KINDS)[number];

/**
 * A document sent to the memory store. Its id is stable, so sending it again replaces it
 * instead of adding a copy. Supermemory extracts facts from `content` in the background.
 */
export interface MemorySource {
  readonly sourceId: string;
  readonly workspaceId: string;
  readonly kind: MemorySourceKind;
  readonly title: string;
  readonly content: string;
  /** Background for extraction: who the memory is about. Not stored as a fact. */
  readonly supportingContext: string;
}

export interface MemoryFact {
  readonly id: string;
  readonly text: string;
  readonly version: number;
  readonly isLatest: boolean;
  readonly isStatic: boolean;
  readonly isInference: boolean;
  readonly createdAt: string;
}

export interface SearchHit {
  readonly factId: string;
  readonly text: string;
  readonly similarity: number;
  readonly createdAt: string;
}

/** Supermemory's maintained summary: lasting facts, and what is true now. */
export interface MemoryProfile {
  readonly static: readonly { readonly factId: string; readonly text: string }[];
  readonly dynamic: readonly { readonly factId: string; readonly text: string }[];
}

export interface FactPage {
  readonly facts: readonly MemoryFact[];
  readonly nextCursor: string | null;
}

export interface SourceSummary {
  readonly sourceId: string;
  readonly kind: MemorySourceKind | null;
  readonly title: string;
  readonly status: "processing" | "done" | "failed";
  readonly updatedAt: string;
}
