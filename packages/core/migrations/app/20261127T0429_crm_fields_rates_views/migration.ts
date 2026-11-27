#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1f70eab68bb775696e84810db20db1d9cd43b31df6c05afebd1780d6d6c871ea/contract';
import startContract from '../../snapshots/1f70eab68bb775696e84810db20db1d9cd43b31df6c05afebd1780d6d6c871ea/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d13f42ea5ee2dc032f96ced53de4fde0db26e59a8670bfa04accd8e1aef59bdb/contract';
import endContract from '../../snapshots/d13f42ea5ee2dc032f96ced53de4fde0db26e59a8670bfa04accd8e1aef59bdb/contract.json' with { type: 'json' };
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
        table: 'contact_brief',
        columns: [
          col('contact_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('narrative', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('refreshed_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('sections', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('source_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['contact_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'contact_fact',
        columns: [
          col('band', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('contact_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('decided_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('decided_by_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('evidence', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('field', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('observed_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('score', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('source_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('proposed'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('value', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'exchange_rate',
        columns: [
          col('as_of', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('base', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('quote', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('rate', 'numeric(20,10)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 20, scale: 10 } },
          }),
          col('source', 'text', {
            notNull: true,
            default: lit('fetched'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('workspace_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'field_definition',
        columns: [
          col('agent_brief', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('agent_filled', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('archived_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('entity', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('label', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('position', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('required', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('show_on_filter', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('show_on_sheet', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('show_on_table', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'field_option',
        columns: [
          col('archived_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('field_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('label', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('position', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'field_value',
        columns: [
          col('bool', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('date', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('field_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('number', 'numeric(24,4)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 24, scale: 4 } },
          }),
          col('option_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('record_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('set_by', 'text', {
            notNull: true,
            default: lit('member'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('text', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('user_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'saved_view',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('entity', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('owner_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('position', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('query', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('shared', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'website_visit',
        columns: [
          col('company_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('contact_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('occurred_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('path', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('referrer', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('utm_campaign', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('utm_medium', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('utm_source', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('visitor_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'workspace_setting',
        columns: [
          col('reporting_currency', 'text', {
            notNull: true,
            default: lit('USD'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('tracking_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['workspace_id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'activity',
        column: col('calendar_event_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'activity',
        column: col('email_thread_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'activity',
        column: col('external_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'activity',
        column: col('source', 'text', {
          notNull: true,
          default: lit('manual'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'chat',
        column: col('record_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'chat',
        column: col('record_kind', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'deal',
        column: col('base_amount', 'numeric(24,4)', {
          codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 24, scale: 4 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'deal',
        column: col('base_currency', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'deal',
        column: col('fx_rate', 'numeric(20,10)', {
          codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 20, scale: 10 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'deal',
        column: col('fx_rate_at', 'timestamptz(3)', {
          codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'activity',
        constraint: 'activity_workspace_id_calendar_event_id_key',
        columns: ['workspace_id', 'calendar_event_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'activity',
        constraint: 'activity_workspace_id_email_thread_id_key',
        columns: ['workspace_id', 'email_thread_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'exchange_rate',
        constraint: 'exchange_rate_base_quote_as_of_source_key',
        columns: ['base', 'quote', 'as_of', 'source'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'field_definition',
        constraint: 'field_definition_workspace_id_entity_key_key',
        columns: ['workspace_id', 'entity', 'key'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'field_value',
        constraint: 'field_value_field_id_record_id_key',
        columns: ['field_id', 'record_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'workspace_setting',
        constraint: 'workspace_setting_tracking_key_key',
        columns: ['tracking_key'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'chat',
        index: 'chat_record_id_idx_ab8d411c',
        columns: ['record_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'contact_brief',
        index: 'contact_brief_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'contact_fact',
        index: 'contact_fact_contact_id_idx_f6f6ad79',
        columns: ['contact_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'contact_fact',
        index: 'contact_fact_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'exchange_rate',
        index: 'exchange_rate_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'field_definition',
        index: 'field_definition_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'field_option',
        index: 'field_option_field_id_idx_a58bbd5b',
        columns: ['field_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'field_option',
        index: 'field_option_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'field_value',
        index: 'field_value_field_id_idx_a58bbd5b',
        columns: ['field_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'field_value',
        index: 'field_value_record_id_idx_ab8d411c',
        columns: ['record_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'field_value',
        index: 'field_value_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'saved_view',
        index: 'saved_view_owner_id_idx_ade9f347',
        columns: ['owner_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'saved_view',
        index: 'saved_view_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'website_visit',
        index: 'website_visit_company_id_idx_1303a718',
        columns: ['company_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'website_visit',
        index: 'website_visit_contact_id_idx_f6f6ad79',
        columns: ['contact_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'website_visit',
        index: 'website_visit_visitor_id_idx_f711bdfd',
        columns: ['visitor_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'website_visit',
        index: 'website_visit_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'contact_brief',
        foreignKey: {
          name: 'contact_brief_contact_id_fkey',
          columns: ['contact_id'],
          references: { schema: 'public', table: 'contact', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'contact_brief',
        foreignKey: {
          name: 'contact_brief_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'contact_fact',
        foreignKey: {
          name: 'contact_fact_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'contact_fact',
        foreignKey: {
          name: 'contact_fact_contact_id_fkey',
          columns: ['contact_id'],
          references: { schema: 'public', table: 'contact', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'exchange_rate',
        foreignKey: {
          name: 'exchange_rate_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'field_definition',
        foreignKey: {
          name: 'field_definition_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'field_option',
        foreignKey: {
          name: 'field_option_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'field_option',
        foreignKey: {
          name: 'field_option_field_id_fkey',
          columns: ['field_id'],
          references: { schema: 'public', table: 'field_definition', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'field_value',
        foreignKey: {
          name: 'field_value_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'field_value',
        foreignKey: {
          name: 'field_value_field_id_fkey',
          columns: ['field_id'],
          references: { schema: 'public', table: 'field_definition', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'saved_view',
        foreignKey: {
          name: 'saved_view_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'saved_view',
        foreignKey: {
          name: 'saved_view_owner_id_fkey',
          columns: ['owner_id'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'website_visit',
        foreignKey: {
          name: 'website_visit_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'workspace_setting',
        foreignKey: {
          name: 'workspace_setting_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
