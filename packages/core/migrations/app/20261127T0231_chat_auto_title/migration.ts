#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/6cf217e5f10326624439bdfcc4a496bc8a4b1582e38e22e244b300d0a66b388c/contract';
import startContract from '../../snapshots/6cf217e5f10326624439bdfcc4a496bc8a4b1582e38e22e244b300d0a66b388c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b37cc24233474209c56905e969c451d70ea2ae97144a8a1ef5b1594f8cd0ddfe/contract';
import endContract from '../../snapshots/b37cc24233474209c56905e969c451d70ea2ae97144a8a1ef5b1594f8cd0ddfe/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'chat',
        column: col('auto_title', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
