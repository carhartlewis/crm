#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/b37cc24233474209c56905e969c451d70ea2ae97144a8a1ef5b1594f8cd0ddfe/contract';
import startContract from '../../snapshots/b37cc24233474209c56905e969c451d70ea2ae97144a8a1ef5b1594f8cd0ddfe/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d73e359f58e0badf7e6ba5e0890a299ef5cd529bcf8e0697fc5671ce2e891b0c/contract';
import endContract from '../../snapshots/d73e359f58e0badf7e6ba5e0890a299ef5cd529bcf8e0697fc5671ce2e891b0c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'sidebar',
        column: col('recent_order', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
