import { column as c, table } from 'remix/data-table'

export const adminUsers = table({
  name: 'admin_users',
  columns: {
    user_id: c.varchar(255).notNull().references('user', 'id').onDelete('cascade'),
  },
  primaryKey: 'user_id',
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
})

export const clients = table({
  name: 'clients',
  columns: {
    id: c.varchar(255).notNull().primaryKey(),
    name: c.varchar(255).notNull().unique(),
  },
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
})

export const clientCredentials = table({
  name: 'client_credentials',
  columns: {
    client_id: c.varchar(255).notNull().references('clients', 'id').onDelete('cascade'),
    credential_hash: c.text().notNull(),
    credential_salt: c.varchar(255).notNull(),
    last_used_at: c.varchar(64).nullable(),
  },
  primaryKey: 'client_id',
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
})

export const clientGroups = table({
  name: 'client_groups',
  columns: {
    id: c.varchar(255).notNull().primaryKey(),
    name: c.varchar(255).notNull().unique(),
    description: c.text().nullable(),
  },
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
})

export const clientGroupMemberships = table({
  name: 'client_group_memberships',
  columns: {
    client_id: c.varchar(255).notNull().references('clients', 'id').onDelete('cascade'),
    group_id: c.varchar(255).notNull().references('client_groups', 'id').onDelete('cascade'),
  },
  primaryKey: ['group_id', 'client_id'],
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
})

export const messages = table({
  name: 'messages',
  columns: {
    id: c.varchar(255).notNull().primaryKey(),
    sender_admin_user_id: c.varchar(255).notNull().references('admin_users', 'user_id').onDelete('restrict'),
    target_type: c.enum(['client', 'group']).notNull(),
    target_id: c.varchar(255).notNull(),
    content: c.text().notNull(),
    delivered_live_count: c.integer().notNull().default(0),
  },
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
})

export const messageDeliveries = table({
  name: 'message_deliveries',
  columns: {
    id: c.varchar(255).notNull().primaryKey(),
    message_id: c.varchar(255).notNull().references('messages', 'id').onDelete('cascade'),
    client_id: c.varchar(255).notNull().references('clients', 'id').onDelete('cascade'),
    status: c.enum(['delivered', 'offline']).notNull(),
    delivered_at: c.varchar(64).nullable(),
  },
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
})

