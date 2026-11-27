#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/235cb9f74bdb9ea4a51e2bcdcc9fb60b42e4a79fcb1aca5da591f9f12c7c874f/contract';
import endContract from '../../snapshots/235cb9f74bdb9ea4a51e2bcdcc9fb60b42e4a79fcb1aca5da591f9f12c7c874f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c05e9d2feb8084e9753562aa965efc96db2fef284064a54bbc9efecb8de0177d/contract';
import startContract from '../../snapshots/c05e9d2feb8084e9753562aa965efc96db2fef284064a54bbc9efecb8de0177d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'custom_connector',
        columns: [
          col('added_by_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('mcp_url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'custom_connector',
        constraint: 'custom_connector_workspace_id_key_key',
        columns: ['workspace_id', 'key'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'custom_connector',
        index: 'custom_connector_added_by_id_idx_3003bad1',
        columns: ['added_by_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'custom_connector',
        index: 'custom_connector_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'custom_connector',
        foreignKey: {
          name: 'custom_connector_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'custom_connector',
        foreignKey: {
          name: 'custom_connector_added_by_id_fkey',
          columns: ['added_by_id'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
