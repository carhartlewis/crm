#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/8f095540a6efe28d5ee6b4b746fc95c14fb8ecd5f4163649b47db0060510b8c0/contract';
import startContract from '../../snapshots/8f095540a6efe28d5ee6b4b746fc95c14fb8ecd5f4163649b47db0060510b8c0/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d6c39da990bb867a04040e296a01f04ece80ed79d37f0bd71f57bc34458a63ee/contract';
import endContract from '../../snapshots/d6c39da990bb867a04040e296a01f04ece80ed79d37f0bd71f57bc34458a63ee/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'chat_space_member',
        columns: [
          col('joined_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('space_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['space_id', 'user_id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'chat_space_member',
        index: 'chat_space_member_space_id_idx_5ce13788',
        columns: ['space_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'chat_space_member',
        index: 'chat_space_member_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'chat_space_member',
        index: 'chat_space_member_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'chat_space_member',
        foreignKey: {
          name: 'chat_space_member_space_id_fkey',
          columns: ['space_id'],
          references: { schema: 'public', table: 'chat_space', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'chat_space_member',
        foreignKey: {
          name: 'chat_space_member_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'chat_space_member',
        foreignKey: {
          name: 'chat_space_member_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
