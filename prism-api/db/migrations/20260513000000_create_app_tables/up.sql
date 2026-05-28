create table admin_users (
  user_id varchar(255) primary key references "user" (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table clients (
  id varchar(255) primary key,
  name varchar(255) not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table client_credentials (
  client_id varchar(255) primary key references clients (id) on delete cascade,
  credential_hash text not null,
  credential_salt varchar(255) not null,
  last_used_at varchar(64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table client_groups (
  id varchar(255) primary key,
  name varchar(255) not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table client_group_memberships (
  client_id varchar(255) not null references clients (id) on delete cascade,
  group_id varchar(255) not null references client_groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, client_id)
);

create table messages (
  id varchar(255) primary key,
  sender_admin_user_id varchar(255) not null references admin_users (user_id) on delete restrict,
  target_type varchar(16) not null check (target_type in ('client', 'group')),
  target_id varchar(255) not null,
  content text not null,
  delivered_live_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table message_deliveries (
  id varchar(255) primary key,
  message_id varchar(255) not null references messages (id) on delete cascade,
  client_id varchar(255) not null references clients (id) on delete cascade,
  status varchar(16) not null check (status in ('delivered', 'offline')),
  delivered_at varchar(64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);