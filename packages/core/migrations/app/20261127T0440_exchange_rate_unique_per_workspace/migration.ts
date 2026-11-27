#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/951bea6c47ed60d207f3991527996b51a0a3efad21d8b69cfffd5eb45f865d9f/contract';
import endContract from '../../snapshots/951bea6c47ed60d207f3991527996b51a0a3efad21d8b69cfffd5eb45f865d9f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d13f42ea5ee2dc032f96ced53de4fde0db26e59a8670bfa04accd8e1aef59bdb/contract';
import startContract from '../../snapshots/d13f42ea5ee2dc032f96ced53de4fde0db26e59a8670bfa04accd8e1aef59bdb/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'exchange_rate',
        constraint: 'exchange_rate_base_quote_as_of_source_key',
      }),
      this.addUnique({
        schema: 'public',
        table: 'exchange_rate',
        constraint: 'exchange_rate_workspace_id_base_quote_as_of_source_key',
        columns: ['workspace_id', 'base', 'quote', 'as_of', 'source'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'exchange_rate',
        index: 'exchange_rate_base_quote_as_of_idx_694b42d8',
        columns: ['base', 'quote', 'as_of'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
