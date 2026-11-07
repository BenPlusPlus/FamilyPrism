import { createSqliteDatabase, type SqliteDatabase } from 'remix/data-table/sqlite'

import { createPrismAuth, replacePrismAuth } from '../app/data/auth.ts'
import { replaceDatabase } from '../app/data/database.ts'

const TEST_TABLES = [
  `create table admin_users (
    user_id text primary key,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  )`,
  `create table clients (
    id text primary key,
    name text not null unique,
    last_user text,
    last_screenshot_at text,
    last_seen_version text,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  )`,
  `create table client_credentials (
    client_id text primary key,
    credential_hash text not null,
    credential_salt text not null,
    last_used_at text,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  )`,
  `create table client_groups (
    id text primary key,
    name text not null unique,
    description text,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  )`,
  `create table client_group_memberships (
    client_id text not null,
    group_id text not null,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now')),
    primary key (group_id, client_id)
  )`,
  `create table dns_profiles (
    id text primary key,
    name text not null unique,
    primary_ip text not null,
    secondary_ip text,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  )`,
  `create table client_dns_states (
    client_id text primary key,
    command_id text not null,
    directive_kind text not null,
    profile_name text,
    primary_ip text,
    secondary_ip text,
    status text not null,
    error text,
    issued_at text not null,
    completed_at text,
    expires_at text,
    restore_command_id text,
    standing_kind text,
    standing_profile_name text,
    standing_primary_ip text,
    standing_secondary_ip text,
    standing_status text,
    standing_issued_at text,
    standing_completed_at text,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  )`,
  `create table pending_dns_directives (
    client_id text primary key,
    command_id text not null,
    directive_kind text not null,
    profile_name text,
    primary_ip text,
    secondary_ip text,
    expires_at text,
    restore_command_id text,
    standing_kind text,
    standing_profile_name text,
    standing_primary_ip text,
    standing_secondary_ip text,
    standing_status text,
    standing_issued_at text,
    standing_completed_at text,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  )`,
  `create table messages (
    id text primary key,
    sender_admin_user_id text not null,
    target_type text not null,
    target_id text not null,
    content text not null,
    delivered_live_count integer not null default 0,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  )`,
  `create table message_deliveries (
    id text primary key,
    message_id text not null,
    client_id text not null,
    status text not null,
    delivered_at text,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  )`,
]

let current: SqliteDatabase | undefined

export async function closeTestPersistence() {
  await current?.close()
  current = undefined
}

export async function installTestPersistence() {
  await closeTestPersistence()

  current = createSqliteDatabase(
    {
      filename: ':memory:',
      foreignKeys: false,
    },
    {
      now: () => new Date(),
    },
  )

  for (let statement of TEST_TABLES) {
    await current.exec(statement)
  }

  replaceDatabase(current)
  replacePrismAuth(createPrismAuth())

  return current
}
