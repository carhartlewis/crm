#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/58615015a98ba2dff7fa67630c2be4dc05d6a23f536852b755e93e8708c7f734/contract';
import endContract from '../../snapshots/58615015a98ba2dff7fa67630c2be4dc05d6a23f536852b755e93e8708c7f734/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/951bea6c47ed60d207f3991527996b51a0a3efad21d8b69cfffd5eb45f865d9f/contract';
import startContract from '../../snapshots/951bea6c47ed60d207f3991527996b51a0a3efad21d8b69cfffd5eb45f865d9f/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'usage_event',
        columns: [
          col('contract', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('cost_micro', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('kind', 'text', {
            notNull: true,
            default: lit('enrichment'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('origin', 'text', {
            notNull: true,
            default: lit('chat'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('outcome', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('price_micro', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('provider_call_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('record_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('record_kind', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('served_by', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'company',
        column: col('employee_count', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'company',
        column: col('founded_year', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'contact',
        column: col('email_status', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'contact',
        column: col('email_verified_at', 'timestamptz(3)', {
          codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'contact',
        column: col('phone_status', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'contact',
        column: col('phone_type', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'workspace_setting',
        column: col('usage_markup_bps', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'usage_event',
        constraint: 'usage_event_provider_call_id_key',
        columns: ['provider_call_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'usage_event',
        index: 'usage_event_record_id_idx_ab8d411c',
        columns: ['record_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'usage_event',
        index: 'usage_event_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'usage_event',
        index: 'usage_event_workspace_id_created_at_idx_3f0db799',
        columns: ['workspace_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'usage_event',
        index: 'usage_event_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'usage_event',
        foreignKey: {
          name: 'usage_event_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'usage_event',
        foreignKey: {
          name: 'usage_event_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
