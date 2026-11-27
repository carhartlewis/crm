#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5ea5fef9ea970c91636ba1d04c1368544dae0f97758c9c2f1bf4ec5d68ee3057/contract';
import startContract from '../../snapshots/5ea5fef9ea970c91636ba1d04c1368544dae0f97758c9c2f1bf4ec5d68ee3057/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/8f095540a6efe28d5ee6b4b746fc95c14fb8ecd5f4163649b47db0060510b8c0/contract';
import endContract from '../../snapshots/8f095540a6efe28d5ee6b4b746fc95c14fb8ecd5f4163649b47db0060510b8c0/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'chat',
        column: col('permission_mode', 'text', {
          notNull: true,
          default: lit('manual'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
