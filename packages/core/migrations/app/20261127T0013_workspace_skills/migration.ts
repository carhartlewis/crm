#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/7c12d7e477cbdf8a3f620e7bc39f72e624ea6dd13790befa61a5a81b4ceab854/contract';
import startContract from '../../snapshots/7c12d7e477cbdf8a3f620e7bc39f72e624ea6dd13790befa61a5a81b4ceab854/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c05e9d2feb8084e9753562aa965efc96db2fef284064a54bbc9efecb8de0177d/contract';
import endContract from '../../snapshots/c05e9d2feb8084e9753562aa965efc96db2fef284064a54bbc9efecb8de0177d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'skill',
        columns: [
          col('added_by_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('description', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('enabled', 'bool', { notNull: true, codecRef: { codecId: 'pg/bool@1' } }),
          col('files', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('source', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('source_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'skill',
        constraint: 'skill_workspace_id_name_key',
        columns: ['workspace_id', 'name'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'skill',
        index: 'skill_added_by_id_idx_3003bad1',
        columns: ['added_by_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'skill',
        index: 'skill_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'skill',
        foreignKey: {
          name: 'skill_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'skill',
        foreignKey: {
          name: 'skill_added_by_id_fkey',
          columns: ['added_by_id'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
