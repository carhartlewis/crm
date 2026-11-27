import type { Db } from "@crm/core/db";

/** One fact as the copy keeps it. */
export interface MirroredFact {
  readonly id: string;
  readonly text: string;
  readonly isStatic: boolean;
  /** ISO time Supermemory read it. */
  readonly createdAt: string;
}

/**
 * The copy of each memory's facts that ⌘K searches locally (ADR 0017), keyed by Supermemory's
 * fact ids. The Memory service is its only writer. Prisma in production, a fake in tests.
 */
export interface FactMirror {
  /** Makes the copy of one memory (a company's, or the workspace's when null) equal `facts`. */
  replace(
    workspaceId: string,
    companyId: string | null,
    facts: readonly MirroredFact[],
    now: Date,
  ): Promise<void>;
  /** Drops facts from the copy at once, such as a fact a member forgot. */
  remove(workspaceId: string, factIds: readonly string[]): Promise<void>;
}

export function prismaFactMirror(db: Db): FactMirror {
  return {
    replace: (workspaceId, companyId, facts, now) =>
      db.transaction(async (tx) => {
        const rows = tx.orm.public.MemoryFact;
        const keep = new Set(facts.map((fact) => fact.id));

        // Chained clauses AND together.
        const inWorkspace = rows.where({ workspaceId });

        const existing = await (companyId === null
          ? inWorkspace.where((row) => row.companyId.isNull())
          : inWorkspace.where({ companyId })
        )
          .select("id")
          .all();

        const gone = existing.map((row) => row.id).filter((id) => !keep.has(id));

        if (gone.length > 0) {
          await inWorkspace.where((row) => row.id.in(gone)).deleteAll();
        }

        await Promise.all(
          facts.map((fact) => {
            const values = {
              text: fact.text,
              isStatic: fact.isStatic,
              createdAt: new Date(fact.createdAt),
              syncedAt: now,
            };

            return rows.upsert({
              create: { id: fact.id, workspaceId, companyId, ...values },
              update: values,
            });
          }),
        );
      }),
    remove: async (workspaceId, factIds) => {
      if (factIds.length === 0) return;

      await db.orm.public.MemoryFact.where({ workspaceId })
        .where((row) => row.id.in([...factIds]))
        .deleteAll();
    },
  };
}
