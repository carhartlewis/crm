#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/77636a3385d2099596011941eb6679dfe88cd6d12a8264635fc25f7526badc7f/contract';
import endContract from '../../snapshots/77636a3385d2099596011941eb6679dfe88cd6d12a8264635fc25f7526badc7f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/7ea60824054c143c8373e86d504e4afbaeeb3ba9456bde318c05ec7d95148a58/contract';
import startContract from '../../snapshots/7ea60824054c143c8373e86d504e4afbaeeb3ba9456bde318c05ec7d95148a58/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addUnique({
        schema: 'public',
        table: 'account',
        constraint: 'account_providerId_accountId_key',
        columns: ['providerId', 'accountId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
