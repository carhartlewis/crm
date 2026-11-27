import type {
  FactPage,
  GraphSource,
  MemoryProfile,
  MemorySource,
  SearchHit,
  SourceDetail,
  SourceSummary,
} from "./types.ts";

export interface SearchRequest {
  readonly query: string;
  readonly limit: number;
  /** 0–1; hits below it are dropped. */
  readonly threshold?: number;
}

/**
 * A memory service partitioned by namespace (one per workspace, one per company). Supermemory
 * in deployed environments; `createInMemoryStore` in tests.
 */
export interface MemoryStore {
  readonly name: string;
  /** Background the store uses when it extracts facts for this namespace. */
  describeNamespace(namespace: string, supportingContext: string): Promise<void>;
  /** Adds the source, or replaces the one with the same id. Safe to retry. */
  putSource(namespace: string, source: MemorySource): Promise<void>;
  deleteSource(namespace: string, sourceId: string): Promise<void>;
  listSources(namespace: string, limit: number): Promise<readonly SourceSummary[]>;
  /** One source with its text, or null when there is none. */
  getSource(namespace: string, sourceId: string): Promise<SourceDetail | null>;
  listFacts(namespace: string, page: { cursor: string | null; limit: number }): Promise<FactPage>;
  search(namespace: string, request: SearchRequest): Promise<readonly SearchHit[]>;
  profile(namespace: string): Promise<MemoryProfile>;
  /** Marks facts as forgotten; recall and search skip them. Returns how many changed. */
  forgetFacts(namespace: string, factIds: readonly string[]): Promise<number>;
  /** The newest sources with their facts, for the memory graph. */
  graph(namespace: string, limit: number): Promise<readonly GraphSource[]>;
  /** Deletes every source and fact in the namespace, such as a deleted company's. */
  deleteNamespace(namespace: string): Promise<void>;
}

export type MemoryStoreErrorKind =
  | "rate_limited"
  | "unavailable"
  | "rejected"
  | "not_found"
  | "out_of_credits";

export class MemoryStoreError extends Error {
  constructor(
    readonly kind: MemoryStoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "MemoryStoreError";
  }
}

export const EMPTY_PROFILE: MemoryProfile = { static: [], dynamic: [] };
