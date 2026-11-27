#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/6cf217e5f10326624439bdfcc4a496bc8a4b1582e38e22e244b300d0a66b388c/contract';
import endContract from '../../snapshots/6cf217e5f10326624439bdfcc4a496bc8a4b1582e38e22e244b300d0a66b388c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d6c39da990bb867a04040e296a01f04ece80ed79d37f0bd71f57bc34458a63ee/contract';
import startContract from '../../snapshots/d6c39da990bb867a04040e296a01f04ece80ed79d37f0bd71f57bc34458a63ee/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'chat_space',
        column: col('description', 'text', {
          notNull: true,
          default: lit(''),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
