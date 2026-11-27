#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/7c12d7e477cbdf8a3f620e7bc39f72e624ea6dd13790befa61a5a81b4ceab854/contract';
import endContract from '../../snapshots/7c12d7e477cbdf8a3f620e7bc39f72e624ea6dd13790befa61a5a81b4ceab854/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/bf7c84ffe31a2bd0038746da6dabb667f6c084e645cce158f562d198e499c7e1/contract';
import startContract from '../../snapshots/bf7c84ffe31a2bd0038746da6dabb667f6c084e645cce158f562d198e499c7e1/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'connection',
        columns: [
          col('access', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('credentials', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('integration', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('workspace_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'jwks',
        columns: [
          col('alg', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('crv', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('expiresAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('privateKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('publicKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'oauthAccessToken',
        columns: [
          col('authorizationCodeId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('clientId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('confirmation', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('expiresAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('referenceId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('refreshId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('requestedUserInfoClaims', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('resources', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('revoked', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('scopes', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('sessionId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('token', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'oauthClient',
        columns: [
          col('applicationType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('backchannelLogoutSessionRequired', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('backchannelLogoutUri', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('clientCredentialsScopes', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('clientDiscoveryId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('clientId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('clientSecret', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('contacts', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('createdAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('disabled', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('dpopBoundAccessTokens', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('enableEndSession', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('grantTypes', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('icon', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('jwks', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('jwksUri', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('metadata', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('policy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('postLogoutRedirectUris', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('redirectUris', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('referenceId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('requirePKCE', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('responseTypes', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('scopes', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('skipConsent', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('softwareId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('softwareStatement', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('softwareVersion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('subjectType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('tokenEndpointAuthMethod', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('tos', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('uri', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'oauthClientAssertion',
        columns: [
          col('expiresAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'oauthClientResource',
        columns: [
          col('clientId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('metadata', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('resourceId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'oauthConsent',
        columns: [
          col('clientId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('referenceId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('requestedUserInfoClaims', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('resources', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('scopes', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('userId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'oauthRefreshToken',
        columns: [
          col('authTime', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('authorizationCodeId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('clientId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('confirmation', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('expiresAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('referenceId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('requestedUserInfoClaims', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('resources', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('revoked', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('rotatedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('rotationReplayExpiresAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('rotationReplayResponse', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('scopes', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('sessionId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('token', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'oauthResource',
        columns: [
          col('accessTokenTtl', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('allowedScopes', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('createdAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('customClaims', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('disabled', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('dpopBoundAccessTokensRequired', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('identifier', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('metadata', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('policyVersion', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('refreshTokenTtl', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('signingAlgorithm', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('signingKeyId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'connection',
        constraint: 'connection_workspace_id_user_id_integration_key',
        columns: ['workspace_id', 'user_id', 'integration'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'oauthAccessToken',
        constraint: 'oauthAccessToken_token_key',
        columns: ['token'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'oauthClient',
        constraint: 'oauthClient_clientId_key',
        columns: ['clientId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'oauthClientResource',
        constraint: 'oauthClientResource_clientId_resourceId_key',
        columns: ['clientId', 'resourceId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'oauthRefreshToken',
        constraint: 'oauthRefreshToken_token_key',
        columns: ['token'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'oauthResource',
        constraint: 'oauthResource_identifier_key',
        columns: ['identifier'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'connection',
        index: 'connection_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'connection',
        index: 'connection_workspace_id_idx_90a9f461',
        columns: ['workspace_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthAccessToken',
        index: 'oauthAccessToken_authorizationCodeId_idx_9f43c228',
        columns: ['authorizationCodeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthAccessToken',
        index: 'oauthAccessToken_clientId_idx_153a9a49',
        columns: ['clientId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthAccessToken',
        index: 'oauthAccessToken_refreshId_idx_baab7735',
        columns: ['refreshId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthAccessToken',
        index: 'oauthAccessToken_sessionId_idx_29f415d4',
        columns: ['sessionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthAccessToken',
        index: 'oauthAccessToken_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthClient',
        index: 'oauthClient_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthClientResource',
        index: 'oauthClientResource_clientId_idx_153a9a49',
        columns: ['clientId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthClientResource',
        index: 'oauthClientResource_resourceId_idx_72964925',
        columns: ['resourceId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthConsent',
        index: 'oauthConsent_clientId_idx_153a9a49',
        columns: ['clientId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthConsent',
        index: 'oauthConsent_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthRefreshToken',
        index: 'oauthRefreshToken_authorizationCodeId_idx_9f43c228',
        columns: ['authorizationCodeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthRefreshToken',
        index: 'oauthRefreshToken_clientId_idx_153a9a49',
        columns: ['clientId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthRefreshToken',
        index: 'oauthRefreshToken_sessionId_idx_29f415d4',
        columns: ['sessionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauthRefreshToken',
        index: 'oauthRefreshToken_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'connection',
        foreignKey: {
          name: 'connection_workspace_id_fkey',
          columns: ['workspace_id'],
          references: { schema: 'public', table: 'workspace', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'connection',
        foreignKey: {
          name: 'connection_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauthAccessToken',
        foreignKey: {
          name: 'oauthAccessToken_clientId_fkey',
          columns: ['clientId'],
          references: { schema: 'public', table: 'oauthClient', columns: ['clientId'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauthAccessToken',
        foreignKey: {
          name: 'oauthAccessToken_sessionId_fkey',
          columns: ['sessionId'],
          references: { schema: 'public', table: 'session', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauthAccessToken',
        foreignKey: {
          name: 'oauthAccessToken_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauthAccessToken',
        foreignKey: {
          name: 'oauthAccessToken_refreshId_fkey',
          columns: ['refreshId'],
          references: { schema: 'public', table: 'oauthRefreshToken', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauthClient',
        foreignKey: {
          name: 'oauthClient_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauthClientResource',
        foreignKey: {
          name: 'oauthClientResource_clientId_fkey',
          columns: ['clientId'],
          references: { schema: 'public', table: 'oauthClient', columns: ['clientId'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauthClientResource',
        foreignKey: {
          name: 'oauthClientResource_resourceId_fkey',
          columns: ['resourceId'],
          references: { schema: 'public', table: 'oauthResource', columns: ['identifier'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauthConsent',
        foreignKey: {
          name: 'oauthConsent_clientId_fkey',
          columns: ['clientId'],
          references: { schema: 'public', table: 'oauthClient', columns: ['clientId'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauthConsent',
        foreignKey: {
          name: 'oauthConsent_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauthRefreshToken',
        foreignKey: {
          name: 'oauthRefreshToken_clientId_fkey',
          columns: ['clientId'],
          references: { schema: 'public', table: 'oauthClient', columns: ['clientId'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauthRefreshToken',
        foreignKey: {
          name: 'oauthRefreshToken_sessionId_fkey',
          columns: ['sessionId'],
          references: { schema: 'public', table: 'session', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauthRefreshToken',
        foreignKey: {
          name: 'oauthRefreshToken_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
