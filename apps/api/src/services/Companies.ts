import { Invalid, NoActiveWorkspace, NotFound } from "@crm/core/api";
import { Context, Effect, Layer } from "effect";
import {
  authorizeWorkspace,
  parseCompanyId,
  parseCompanyPatch,
  parseNewCompany,
} from "./companies-rules.ts";
import { Database } from "./Database.ts";
import { Images } from "./Images.ts";
import { Research } from "./Research.ts";
import { Memory } from "./Memory.ts";
import { Postgres } from "./Postgres.ts";
import { prismaRecordStore, type RecordPatch, type RecordStore } from "./record-store.ts";
import {
  type Actor,
  archivedField,
  checkReferences,
  done,
  notFound,
  type PatchInput,
  run,
  splitPatch,
  toFields,
  type TxId,
  writer,
} from "./record-writes.ts";

export type { Actor } from "./record-writes.ts";

export interface CompaniesService {
  /** The verified workspace for the shape proxy; `requested` must equal the active workspace. */
  readonly workspaceFor: (
    actor: Actor,
    requested: string | null,
  ) => Effect.Effect<string, NoActiveWorkspace>;
  readonly create: (
    actor: Actor,
    input: {
      id: string;
      name: string;
      domain: string | null;
      owner_id?: string | null | undefined;
    },
  ) => Effect.Effect<TxId, NoActiveWorkspace | Invalid>;
  readonly update: (
    actor: Actor,
    id: string,
    input: PatchInput,
  ) => Effect.Effect<TxId, NoActiveWorkspace | Invalid | NotFound>;
  readonly remove: (actor: Actor, id: string) => Effect.Effect<TxId, NoActiveWorkspace | NotFound>;
  /** Copies the logo again and refreshes website research; `queued` false without a domain. */
  readonly enrich: (
    actor: Actor,
    id: string,
  ) => Effect.Effect<{ queued: boolean }, NoActiveWorkspace | NotFound>;
}

/** Work that follows a committed write, off the request path. */
export interface CompanyEvents {
  /** A company was added: the agent researches it in the background (ADR 0025). */
  readonly created?: (actor: Actor, companyId: string) => void;
  /** A company was created with a domain, or its domain changed (memory research, ADR 0014). */
  readonly researched?: (workspaceId: string, companyId: string) => void;
  /** Its domain was set or changed: copy its logo (`ImageCache.logo`). `null` clears it. */
  readonly domainChanged?: (workspaceId: string, companyId: string, domain: string | null) => void;
  readonly removed?: (workspaceId: string, companyId: string) => void;
}

/** The companies use cases over an injected store. */
export function makeCompanies(store: RecordStore, events: CompanyEvents = {}): CompaniesService {
  const write = writer(store);

  return {
    workspaceFor: Effect.fn("Companies.workspaceFor")(function* (actor, requested) {
      const isMember =
        actor.activeWorkspaceId !== null && actor.activeWorkspaceId === requested
          ? yield* run("membership", () =>
              store.isMember(actor.activeWorkspaceId ?? "", actor.userId),
            )
          : false;

      const workspace = authorizeWorkspace({
        activeWorkspaceId: actor.activeWorkspaceId,
        requested,
        isMember,
      });

      if (!workspace.ok) return yield* new NoActiveWorkspace({ message: workspace.message });

      return workspace.value;
    }),

    create: (actor, input) => {
      const parsed = parseNewCompany(input);

      if (!parsed.ok) return Effect.fail(new Invalid({ message: parsed.message }));

      const ownerId = input.owner_id === undefined ? actor.userId : input.owner_id;
      const { id, name, domain } = parsed.value;

      return write<Invalid>(actor, "create company", async (workspaceId, tx) => {
        if (await tx.exists("company", id)) {
          return {
            ok: false,
            error: new Invalid({ message: "A company with this id already exists" }),
          };
        }

        const problem = await checkReferences(tx, workspaceId, { ownerId });

        if (problem) return problem;

        await tx.insert("company", {
          id,
          workspaceId,
          name,
          domain,
          website: domain ? `https://${domain}` : null,
          ownerId,
        });

        return done;
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            events.created?.(actor, id);

            if (domain && actor.activeWorkspaceId) {
              events.researched?.(actor.activeWorkspaceId, id);
              events.domainChanged?.(actor.activeWorkspaceId, id, domain);
            }
          }),
        ),
      );
    },

    update: (actor, id, input) => {
      const parsedId = parseCompanyId(id);

      if (!parsedId.ok) return Effect.fail(notFound("Company"));

      const { flag: archived, text } = splitPatch(input, "archived");
      const patch = parseCompanyPatch(text);

      if (!patch.ok) return Effect.fail(new Invalid({ message: patch.message }));

      const domainChanged = patch.value["domain"] !== undefined;

      return write<NotFound | Invalid>(actor, "update company", async (workspaceId, tx) => {
        const current = await tx.get("company", workspaceId, parsedId.value);

        if (!current) return { ok: false, error: notFound("Company") };

        const primary = patch.value["primary_contact_id"];

        const problem = await checkReferences(tx, workspaceId, {
          ownerId: patch.value["owner_id"],
          contactId: primary,
        });

        if (problem) return problem;

        if (primary) {
          const contact = await tx.get("contact", workspaceId, primary);

          if (contact?.["companyId"] !== parsedId.value) {
            return {
              ok: false,
              error: new Invalid({ message: "The primary contact must work at this company" }),
            };
          }
        }

        const sameDomain = current["domain"] === patch.value["domain"];

        const changes: RecordPatch = {
          ...toFields(patch.value),
          ...archivedField(archived),
        };

        // A new domain needs a new logo; the old one would show the wrong company.
        if (domainChanged && !sameDomain) {
          changes["iconUrl"] = null;
          changes["logoUrl"] = null;
        }

        await tx.update("company", workspaceId, parsedId.value, changes);

        return done;
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            const domain = patch.value["domain"];

            if (domainChanged && actor.activeWorkspaceId) {
              if (domain) events.researched?.(actor.activeWorkspaceId, parsedId.value);
              events.domainChanged?.(actor.activeWorkspaceId, parsedId.value, domain ?? null);
            }
          }),
        ),
      );
    },

    remove: (actor, id) => {
      const parsedId = parseCompanyId(id);

      if (!parsedId.ok) return Effect.fail(notFound("Company"));

      return write<NotFound>(actor, "remove company", async (workspaceId, tx) =>
        (await tx.remove("company", workspaceId, parsedId.value))
          ? done
          : { ok: false, error: notFound("Company") },
      ).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            if (actor.activeWorkspaceId) events.removed?.(actor.activeWorkspaceId, parsedId.value);
          }),
        ),
      );
    },
    enrich: (actor, id) =>
      Effect.gen(function* () {
        const parsedId = parseCompanyId(id);

        if (!parsedId.ok) return yield* Effect.fail(notFound("Company"));

        const { result } = yield* domainOf(store, actor, parsedId.value);

        if (!result.member) {
          return yield* new NoActiveWorkspace({
            message: "You are not a member of this workspace",
          });
        }

        if (!result.found) return yield* Effect.fail(notFound("Company"));

        if (!result.domain || !actor.activeWorkspaceId) return { queued: false };

        events.researched?.(actor.activeWorkspaceId, parsedId.value);
        events.domainChanged?.(actor.activeWorkspaceId, parsedId.value, result.domain);

        return { queued: true };
      }),
  };
}

/** The company's domain, after the same workspace check as a write. */
function domainOf(store: RecordStore, actor: Actor, id: string) {
  return run("read company", () =>
    store.transact(async (tx) => {
      const workspaceId = actor.activeWorkspaceId;

      if (!workspaceId || !(await tx.isMember(workspaceId, actor.userId)))
        return { member: false } as const;

      const row = await tx.get("company", workspaceId, id);

      return {
        member: true,
        found: row !== null,
        domain:
          row?.["domain"] === undefined || row["domain"] === null ? null : String(row["domain"]),
      } as const;
    }),
  );
}

/**
 * Copies a company's logo into storage and saves it on the row, if the domain is still the
 * same by then. Never throws: a company without a logo shows its initials.
 */
export async function copyCompanyLogo(
  store: RecordStore,
  logo: (website: string) => Promise<string | null>,
  workspaceId: string,
  companyId: string,
  domain: string | null,
) {
  if (!domain) return;

  const url = await logo(`https://${domain}`).catch(() => null);

  if (!url) return;

  await store
    .transact(async (tx) => {
      const current = await tx.get("company", workspaceId, companyId);

      if (current?.["domain"] === domain) {
        await tx.update("company", workspaceId, companyId, { iconUrl: url });
      }
    })
    .catch(() => undefined);
}

/**
 * Gives companies that have a domain but no logo theirs, one at a time, when the API starts
 * (companies made before logos were copied). Never throws.
 */
export async function backfillCompanyLogos(
  rows: () => Promise<readonly { id: string; workspace_id: string; domain: string }[]>,
  copy: (workspaceId: string, companyId: string, domain: string) => Promise<void>,
) {
  for (const row of await rows().catch(() => [])) {
    // oxlint-disable-next-line no-await-in-loop -- one at a time, to go easy on the logo sources.
    await copy(row.workspace_id, row.id, row.domain);
  }
}

export class Companies extends Context.Service<Companies, CompaniesService>()(
  "@crm/api/services/Companies",
) {
  static readonly layer = Layer.effect(
    Companies,
    Effect.gen(function* () {
      const memory = yield* Memory;
      const images = yield* Images;
      const research = yield* Research;
      const store = prismaRecordStore(yield* Database);
      const pool = yield* Postgres;

      void backfillCompanyLogos(
        async () =>
          (
            await pool.query<{ id: string; workspace_id: string; domain: string }>(
              "SELECT id, workspace_id, domain FROM company WHERE domain IS NOT NULL AND icon_url IS NULL AND archived_at IS NULL ORDER BY created_at DESC LIMIT 500",
            )
          ).rows,
        (workspaceId, id, domain) => copyCompanyLogo(store, images.logo, workspaceId, id, domain),
      );

      return makeCompanies(store, {
        created: (actor, id) => research.start(actor, "company", id),
        researched: (workspaceId, id) => void memory.researchCompany(workspaceId, id),
        domainChanged: (workspaceId, id, domain) =>
          void copyCompanyLogo(store, images.logo, workspaceId, id, domain),
        removed: (workspaceId, id) => void memory.companyRemoved(workspaceId, id),
      });
    }),
  ).pipe(
    Layer.provide([Database.layer, Memory.layer, Images.layer, Postgres.layer, Research.layer]),
  );
}
