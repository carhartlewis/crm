#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/18682aa2d79bb82fa133363231cdd4880f953f7a02f2bba4d26e9eace753f775/contract';
import endContract from '../../snapshots/18682aa2d79bb82fa133363231cdd4880f953f7a02f2bba4d26e9eace753f775/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/235cb9f74bdb9ea4a51e2bcdcc9fb60b42e4a79fcb1aca5da591f9f12c7c874f/contract';
import startContract from '../../snapshots/235cb9f74bdb9ea4a51e2bcdcc9fb60b42e4a79fcb1aca5da591f9f12c7c874f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'memory_fact',
        columns: [
          col('company_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('is_static', 'bool', { notNull: true, codecRef: { codecId: 'pg/bool@1' } }),
          col('synced_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('text', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'memory_fact',
        index: 'memory_fact_company_id_idx_1303a718',
        columns: ['company_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'memory_fact',
        index: 'memory_fact_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'memory_fact',
        foreignKey: {
          name: 'memory_fact_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'memory_fact',
        foreignKey: {
          name: 'memory_fact_company_id_fkey',
          columns: ['company_id'],
          references: { schema: 'public', table: 'company', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
