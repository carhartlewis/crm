import type { Db } from "@crm/core/db";

/** One Prisma 8 transaction, as its callback receives it. */
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** A write's result and the Postgres transaction it committed in. */
export interface Written<A> {
  readonly result: A;
  readonly txid: number;
}

/**
 * Runs `fn` in one transaction and reads `pg_current_xact_id()` inside it. Electric reports the
 * same txid when the change reaches a client, which is when the client drops its optimistic
 * copy (ADR 0012). Read outside the transaction, the id would never match.
 */
export function transactWithTxid<A>(db: Db, fn: (tx: DbTx) => Promise<A>): Promise<Written<A>> {
  return db.transaction(async (tx) => {
    const result = await fn(tx);

    const [row] = await tx.query(
      tx.raw.sql`SELECT pg_current_xact_id()::xid::text AS txid`
        .returnsRow({ txid: "pg/text@1" })
        .build(),
    );

    const txid = Number(row?.txid);

    if (!Number.isSafeInteger(txid)) throw new Error(`Unexpected transaction id: ${row?.txid}`);

    return { result, txid };
  });
}
