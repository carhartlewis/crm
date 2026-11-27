import {
  Invalid,
  NoActiveWorkspace,
  NotFound,
  type SkillDetail,
  type SkillsShResult,
  type SkillSummary,
  UpstreamUnavailable,
} from "@crm/core/api";
import type { Db } from "@crm/core/db";
import { skillDescriptionError, skillInstructionsError, skillNameError } from "@crm/integrations";
import {
  type Fetch,
  fetchSkillsShSkill,
  isSkillsShId,
  type SkillPackage,
  searchSkillsSh,
  type SkillsShResult as SkillsShEntry,
  topSkillsSh,
} from "@crm/integrations/skills-sh";
import { createPreloader, type Kv as KvStore } from "@crm/core/kv";
import { Context, Effect, Layer, Schema } from "effect";
import { Database } from "./Database.ts";
import { Kv } from "./Kv.ts";

type Owner = { readonly workspaceId: string; readonly userId: string };

/** Who is acting: the session user and the session's (unverified) active workspace. */
export interface SkillActor {
  readonly userId: string;
  readonly activeWorkspaceId: string | null;
}

export interface SkillRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly description: string;
  readonly content: string;
  readonly files: Readonly<Record<string, string>>;
  readonly source: "skills.sh" | "custom";
  readonly sourceId: string | null;
  readonly enabled: boolean;
  readonly addedBy: { readonly id: string; readonly name: string } | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Skill rows. Every read and write is scoped to one workspace. */
export interface SkillStore {
  isMember(owner: Owner): Promise<boolean>;
  list(workspaceId: string): Promise<readonly SkillRecord[]>;
  find(workspaceId: string, id: string): Promise<SkillRecord | null>;
  /** The new skill's id; null when the workspace already has a skill with this name. */
  insert(owner: Owner, skill: NewSkill, now: Date): Promise<string | null>;
  setEnabled(workspaceId: string, id: string, enabled: boolean, now: Date): Promise<boolean>;
  remove(workspaceId: string, id: string): Promise<boolean>;
}

export type NewSkill = SkillPackage & {
  readonly source: "skills.sh" | "custom";
  readonly sourceId: string | null;
  readonly enabled: boolean;
};

export class SkillStoreError extends Schema.TaggedError<SkillStoreError>()("SkillStoreError", {
  cause: Schema.Defect(),
}) {}

/** What the agent loads: enabled skills, with everything it needs. */
export interface AgentSkill {
  readonly name: string;
  readonly description: string;
  readonly content: string;
  readonly files: Readonly<Record<string, string>>;
}

export interface SkillsService {
  readonly list: (actor: SkillActor) => Effect.Effect<readonly SkillSummary[], NoActiveWorkspace>;
  readonly discover: (
    actor: SkillActor,
    query: string,
  ) => Effect.Effect<readonly SkillsShResult[], NoActiveWorkspace | UpstreamUnavailable>;
  readonly create: (
    actor: SkillActor,
    input: { name: string; description: string; content: string },
  ) => Effect.Effect<SkillSummary, NoActiveWorkspace | Invalid>;
  readonly install: (
    actor: SkillActor,
    sourceId: string,
  ) => Effect.Effect<SkillSummary, NoActiveWorkspace | Invalid | UpstreamUnavailable>;
  readonly get: (
    actor: SkillActor,
    id: string,
  ) => Effect.Effect<SkillDetail, NoActiveWorkspace | NotFound>;
  readonly setEnabled: (
    actor: SkillActor,
    id: string,
    enabled: boolean,
  ) => Effect.Effect<SkillSummary, NoActiveWorkspace | NotFound>;
  readonly remove: (
    actor: SkillActor,
    id: string,
  ) => Effect.Effect<void, NoActiveWorkspace | NotFound>;
  /** The enabled skills of a workspace, for the agent. Empty for a non-member. */
  readonly forAgent: (owner: Owner) => Promise<readonly AgentSkill[]>;
}

export interface SkillsDependencies {
  readonly store: SkillStore;
  /** Caches the skills.sh leaderboard shown before anyone searches. */
  readonly kv: KvStore;
  readonly fetch?: Fetch;
  readonly now: () => Date;
}

const noWorkspace = () =>
  new NoActiveWorkspace({ message: "Choose a workspace you belong to first" });

const notFound = () => new NotFound({ message: "No such skill in this workspace" });

/** Runs a store call; a failure is logged and becomes a defect (500). */
const run = <A>(label: string, fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new SkillStoreError({ cause }) }).pipe(
    Effect.tapError((error) => Effect.logError(`skills: ${label} failed`, error)),
    Effect.orDie,
  );

function toSummary(record: SkillRecord): SkillSummary {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    source: record.source,
    sourceId: record.sourceId,
    enabled: record.enabled,
    addedBy: record.addedBy,
    fileCount: Object.keys(record.files).length,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toDetail(record: SkillRecord): SkillDetail {
  return {
    ...toSummary(record),
    content: record.content,
    files: Object.entries(record.files).map(([path, text]) => ({ path, size: text.length })),
  };
}

export function makeSkills(deps: SkillsDependencies): SkillsService {
  const { store } = deps;
  const upstream = deps.fetch ? { fetch: deps.fetch } : {};
  const preload = createPreloader(deps.kv);

  /** The skills.sh leaderboard, read at most once an hour. */
  const top = async (): Promise<readonly SkillsShEntry[]> => {
    const cached = await preload("skills:top", 60 * 60, async () =>
      JSON.stringify(await topSkillsSh(upstream)),
    );

    // SAFETY: only `top` writes this key, with `topSkillsSh`'s validated result.
    return JSON.parse(cached) as readonly SkillsShEntry[];
  };

  const owner = Effect.fn("Skills.owner")(function* (actor: SkillActor) {
    const workspaceId = actor.activeWorkspaceId;

    if (!workspaceId) return yield* noWorkspace();

    const member = yield* run("membership", () =>
      store.isMember({ workspaceId, userId: actor.userId }),
    );

    if (!member) return yield* noWorkspace();

    return { workspaceId, userId: actor.userId };
  });

  const found = Effect.fn("Skills.found")(function* (workspaceId: string, id: string) {
    const record = yield* run("find", () => store.find(workspaceId, id));

    if (!record) return yield* notFound();

    return record;
  });

  return {
    list: Effect.fn("Skills.list")(function* (actor) {
      const scope = yield* owner(actor);

      return (yield* run("list", () => store.list(scope.workspaceId))).map(toSummary);
    }),

    discover: Effect.fn("Skills.discover")(function* (actor, query) {
      const scope = yield* owner(actor);
      const text = query.trim();

      const [results, installed] = yield* Effect.all([
        Effect.tryPromise({
          // Before a real search (it needs 2 characters), show the most installed skills.
          try: () => (text.length < 2 ? top() : searchSkillsSh(text, upstream)),
          catch: (cause) => cause,
        }).pipe(
          Effect.tapError((cause) => Effect.logWarning("skills: skills.sh search failed", cause)),
          Effect.mapError(
            () => new UpstreamUnavailable({ message: "Skills could not be loaded. Try again." }),
          ),
        ),
        run("list", () => store.list(scope.workspaceId)),
      ]);

      const have = new Set(installed.map((skill) => skill.sourceId));

      return results.map(({ id, name, source, installs }) => ({
        id,
        name,
        source,
        installs,
        installed: have.has(id),
      }));
    }),

    create: Effect.fn("Skills.create")(function* (actor, input) {
      const scope = yield* owner(actor);

      const error =
        skillNameError(input.name) ??
        skillDescriptionError(input.description) ??
        skillInstructionsError(input.content);

      if (error) return yield* new Invalid({ message: error });

      const name = input.name.trim();

      const id = yield* run("insert", () =>
        store.insert(
          scope,
          {
            name,
            description: input.description.trim(),
            content: input.content.trim(),
            files: {},
            source: "custom",
            sourceId: null,
            enabled: true,
          },
          deps.now(),
        ),
      );

      if (!id)
        return yield* new Invalid({ message: `This workspace already has a skill named ${name}` });

      return toSummary(yield* found(scope.workspaceId, id).pipe(Effect.orDie));
    }),

    install: Effect.fn("Skills.install")(function* (actor, sourceId) {
      const scope = yield* owner(actor);

      if (!isSkillsShId(sourceId))
        return yield* new Invalid({ message: "That is not a skills.sh skill" });

      const skill = yield* Effect.tryPromise({
        try: () => fetchSkillsShSkill(sourceId, upstream),
        catch: (cause) => cause,
      }).pipe(
        Effect.tapError((cause) => Effect.logWarning(`skills: fetching ${sourceId} failed`, cause)),
        Effect.mapError((cause) =>
          cause instanceof Error && cause.name === "SkillsShError"
            ? new Invalid({ message: cause.message })
            : new UpstreamUnavailable({ message: "Skills could not be loaded. Try again." }),
        ),
      );

      const id = yield* run("insert", () =>
        store.insert(
          scope,
          { ...skill, source: "skills.sh", sourceId, enabled: false },
          deps.now(),
        ),
      );

      if (!id) {
        return yield* new Invalid({
          message: `This workspace already has a skill named ${skill.name}`,
        });
      }

      return toSummary(yield* found(scope.workspaceId, id).pipe(Effect.orDie));
    }),

    get: Effect.fn("Skills.get")(function* (actor, id) {
      const scope = yield* owner(actor);

      return toDetail(yield* found(scope.workspaceId, id));
    }),

    setEnabled: Effect.fn("Skills.setEnabled")(function* (actor, id, enabled) {
      const scope = yield* owner(actor);

      const changed = yield* run("update", () =>
        store.setEnabled(scope.workspaceId, id, enabled, deps.now()),
      );

      if (!changed) return yield* notFound();

      return toSummary(yield* found(scope.workspaceId, id));
    }),

    remove: Effect.fn("Skills.remove")(function* (actor, id) {
      const scope = yield* owner(actor);
      const removed = yield* run("remove", () => store.remove(scope.workspaceId, id));

      if (!removed) return yield* notFound();
    }),

    forAgent: async (scope) => {
      if (!(await store.isMember(scope))) return [];

      return (await store.list(scope.workspaceId))
        .filter((skill) => skill.enabled)
        .map(({ name, description, content, files }) => ({ name, description, content, files }));
    },
  };
}

const StoredFiles = Schema.Record(Schema.String, Schema.String);
const decodeFiles = Schema.decodeUnknownSync(StoredFiles);

/** The Prisma 8 store. */
export function prismaSkillStore(db: Db): SkillStore {
  const skills = db.orm.public.Skill;

  const withAuthor = async (rows: readonly Awaited<ReturnType<typeof skills.first>>[]) => {
    const authorIds = [...new Set(rows.flatMap((row) => (row?.addedById ? [row.addedById] : [])))];
    const authors = new Map<string, string>();

    for (const id of authorIds) {
      // oxlint-disable-next-line no-await-in-loop -- a workspace has a handful of authors.
      const user = await db.orm.public.User.where({ id }).first();

      if (user) authors.set(id, user.name);
    }

    return rows.flatMap((row): SkillRecord[] => {
      if (!row) return [];

      const author = row.addedById ? authors.get(row.addedById) : undefined;

      return [
        {
          id: row.id,
          workspaceId: row.workspaceId,
          name: row.name,
          description: row.description,
          content: row.content,
          files: decodeFiles(row.files),
          source: row.source === "custom" ? "custom" : "skills.sh",
          sourceId: row.sourceId,
          enabled: row.enabled,
          addedBy: row.addedById && author ? { id: row.addedById, name: author } : null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      ];
    });
  };

  return {
    isMember: async ({ workspaceId, userId }) =>
      (await db.orm.public.Member.where({ organizationId: workspaceId, userId }).first()) !== null,
    list: async (workspaceId) =>
      withAuthor(
        await skills
          .where({ workspaceId })
          .orderBy((skill) => skill.name.asc())
          .all(),
      ),
    find: async (workspaceId, id) =>
      (await withAuthor([await skills.where({ workspaceId, id }).first()]))[0] ?? null,
    insert: async ({ workspaceId, userId }, skill, now) => {
      if (await skills.where({ workspaceId, name: skill.name }).first()) return null;

      const id = crypto.randomUUID();

      await skills.create({
        id,
        workspaceId,
        name: skill.name,
        description: skill.description,
        content: skill.content,
        files: skill.files,
        source: skill.source,
        sourceId: skill.sourceId,
        enabled: skill.enabled,
        addedById: userId,
        createdAt: now,
        updatedAt: now,
      });

      return id;
    },
    setEnabled: async (workspaceId, id, enabled, now) =>
      (await skills.where({ workspaceId, id }).update({ enabled, updatedAt: now })) !== null,
    remove: async (workspaceId, id) => (await skills.where({ workspaceId, id }).delete()) !== null,
  };
}

export class Skills extends Context.Service<Skills, SkillsService>()("@crm/api/services/Skills") {
  static readonly layer = Layer.effect(
    Skills,
    Effect.gen(function* () {
      return makeSkills({
        store: prismaSkillStore(yield* Database),
        kv: yield* Kv,
        now: () => new Date(),
      });
    }),
  ).pipe(Layer.provide([Database.layer, Kv.layer]));
}
