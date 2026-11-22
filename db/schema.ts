import { sqliteTable, text, integer, primaryKey, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const agencies = sqliteTable('agencies', {
  id: text('id').primaryKey(), name: text('name').notNull(), version: integer('version').notNull().default(0),
  auditHead: text('audit_head').notNull().default('GENESIS'), createdAt: text('created_at').notNull(),
});
export const members = sqliteTable('members', {
  id: text('id').primaryKey(), agencyId: text('agency_id').notNull().references(()=>agencies.id),
  email: text('email').notNull(), userId: text('user_id'), name: text('name').notNull(),
  roles: text('roles').notNull(), patientIds: text('patient_ids').notNull().default('[]'),
  status: text('status').notNull().default('active'), mfaSecret: text('mfa_secret'),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('member_agency_email').on(t.agencyId,t.email), uniqueIndex('member_user').on(t.userId)]);
export const records = sqliteTable('records', {
  agencyId: text('agency_id').notNull().references(()=>agencies.id), kind: text('kind').notNull(),
  id: text('id').notNull(), ciphertext: text('ciphertext').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [primaryKey({columns:[t.agencyId,t.kind,t.id]})]);
export const sessions = sqliteTable('sessions', {
  hash: text('hash').primaryKey(), memberId: text('member_id').notNull().references(()=>members.id),
  userId: text('user_id').notNull(), createdAt: integer('created_at').notNull(),
  lastSeen: integer('last_seen').notNull(), verifiedAt: integer('verified_at'), expiresAt: integer('expires_at').notNull(),
  enrollment: text('enrollment'),
});
export const mfaUses = sqliteTable('mfa_uses', {
  memberId: text('member_id').notNull().references(()=>members.id), counter: integer('counter').notNull(),
}, t=>[primaryKey({columns:[t.memberId,t.counter]})]);
export const recoveryCodes = sqliteTable('recovery_codes', {
  digest: text('digest').primaryKey(), memberId: text('member_id').notNull().references(()=>members.id), usedAt: integer('used_at'),
});
export const authProofs = sqliteTable('auth_proofs', {
  sessionHash: text('session_hash').primaryKey(), proof: text('proof').notNull(), createdAt: integer('created_at').notNull(),
});
export const attempts = sqliteTable('attempts', {
  key: text('key').primaryKey(), count: integer('count').notNull(), window: integer('window').notNull(),
});
export const receipts = sqliteTable('command_receipts', {
  agencyId: text('agency_id').notNull().references(()=>agencies.id), requestId: text('request_id').notNull(),
  memberId: text('member_id').notNull(), version: integer('version').notNull(), commandHash: text('command_hash').notNull(),
  createdAt: text('created_at').notNull(),
},t=>[primaryKey({columns:[t.agencyId,t.requestId]}),uniqueIndex('receipt_agency_version').on(t.agencyId,t.version)]);
export const audit = sqliteTable('audit_events', {
  id: text('id').primaryKey(), agencyId: text('agency_id').notNull().references(()=>agencies.id),
  memberId: text('member_id').notNull(), actor: text('actor').notNull(), action: text('action').notNull(),
  entity: text('entity').notNull(), detail: text('detail').notNull(), at: text('at').notNull(),
  previousHash: text('previous_hash').notNull(), hash: text('hash').notNull(),
},t=>[uniqueIndex('audit_agency_previous_hash').on(t.agencyId,t.previousHash)]);
export const transactionGuards=sqliteTable('transaction_guards',{
  requestId:text('request_id').primaryKey(),allowed:integer('allowed').notNull(),
},t=>[check('guard_must_succeed',sql`${t.allowed} = 1`)]);
