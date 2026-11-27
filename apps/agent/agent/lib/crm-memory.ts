import { EMPTY_RECALL, type Recall } from "@crm/memory/recall";
import { Option, Schema } from "effect";

/**
 * The CRM's memory endpoints (`/api/agent/memory/*`), with the user's gateway token. The token
 * names the workspace; the memory store's key never reaches the agent (ADR 0014).
 */

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface CrmMemoryOptions {
  readonly apiUrl: string;
  /** The user's gateway token, or null when there is none. Must never start a sign-in. */
  readonly token: () => Promise<string | null>;
  readonly fetch?: Fetch;
}

const Strings = Schema.Array(Schema.String);

const RecallBody = Schema.Struct({
  workspace: Schema.Struct({ name: Schema.String, profile: Strings, relevant: Strings }),
  companies: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      domain: Schema.NullOr(Schema.String),
      profile: Strings,
      relevant: Strings,
    }),
  ),
});

const Companies = Schema.Array(
  Schema.Struct({ id: Schema.String, name: Schema.String, domain: Schema.NullOr(Schema.String) }),
);

const Hits = Schema.Array(
  Schema.Struct({
    factId: Schema.String,
    text: Schema.String,
    companyId: Schema.NullOr(Schema.String),
  }),
);

export type CrmCompany = (typeof Companies.Type)[number];

export type MemoryHit = (typeof Hits.Type)[number];

export class CrmMemoryError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CrmMemoryError";
  }
}

/** Without `companyId`, the member's own company. */
export type MemorySearch = { query: string; companyId?: string };

export type MemoryNote = {
  text: string;
  kind: "agent_fact" | "email";
  companyId?: string;
  replaces?: string;
};

export type MemoryForget = { factId: string; companyId?: string };

export interface CrmMemory {
  /** Never throws: no token, an unreachable CRM or a bad answer recall nothing. */
  recall(query: string, signal?: AbortSignal): Promise<Recall>;
  companies(signal?: AbortSignal): Promise<readonly CrmCompany[]>;
  search(input: MemorySearch): Promise<readonly MemoryHit[]>;
  remember(input: MemoryNote): Promise<void>;
  forget(input: MemoryForget): Promise<void>;
}

/** What the CRM sends with a refusal. */
const Failure = Schema.Struct({ message: Schema.String });

/** A request body: the memory endpoints take flat objects of strings. */
type RequestBody = Readonly<Record<string, string | undefined>>;

async function decoded<T>(schema: Schema.Codec<T>, response: Response) {
  const body = response.status === 204 ? null : await response.json();

  return Option.getOrElse(Schema.decodeUnknownOption(schema)(body), () => {
    throw new CrmMemoryError(502, "The CRM sent an answer memory can't read.");
  });
}

export function crmMemory(options: CrmMemoryOptions): CrmMemory {
  const fetchImpl = options.fetch ?? fetch;

  const call = async (
    method: "GET" | "POST",
    path: string,
    body?: RequestBody,
    signal?: AbortSignal,
  ) => {
    const token = await options.token();

    if (!token) throw new CrmMemoryError(401, "Sign the assistant in to the CRM first.");

    const headers = new Headers({ authorization: `Bearer ${token}`, accept: "application/json" });

    const init: RequestInit = {
      method,
      headers,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000),
      redirect: "error",
    };

    if (body !== undefined) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(body);
    }

    const response = await fetchImpl(new URL(path, options.apiUrl).href, init);

    if (!response.ok) {
      const failure = Schema.decodeUnknownOption(Failure)(await response.json().catch(() => ({})));

      const message = Option.match(failure, {
        onSome: (parsed) => parsed.message,
        onNone: () => `The CRM answered ${response.status}.`,
      });

      throw new CrmMemoryError(response.status, message);
    }

    return response;
  };

  return {
    async recall(query, signal) {
      try {
        return await decoded(
          RecallBody,
          await call("POST", "/api/agent/memory/recall", { query }, signal),
        );
      } catch {
        return EMPTY_RECALL;
      }
    },
    companies: async (signal) =>
      decoded(Companies, await call("GET", "/api/agent/memory/companies", undefined, signal)),
    search: async (input) => decoded(Hits, await call("POST", "/api/agent/memory/search", input)),
    remember: async (input) => {
      await call("POST", "/api/agent/memory/remember", input);
    },
    forget: async (input) => {
      await call("POST", "/api/agent/memory/forget", input);
    },
  };
}
