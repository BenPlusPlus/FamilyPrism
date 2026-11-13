alter table admin_users rename to console_accounts;

alter table console_accounts
  add column role varchar(16) not null default 'admin'
  check (role in ('admin', 'parent'));
alter table console_accounts
  alter column role drop default;

alter table messages
  drop constraint if exists messages_sender_admin_user_id_fkey;
alter table messages
  rename column sender_admin_user_id to sender_user_id;
alter table messages
  alter column sender_user_id drop not null;
alter table messages
  add constraint messages_sender_user_id_fkey
  foreign key (sender_user_id) references console_accounts (user_id) on delete set null;

create table console_invitations (
  id varchar(255) primary key,
  token_hash varchar(64) not null unique,
  email varchar(255) not null unique,
  name varchar(100) not null,
  role varchar(16) not null check (role in ('admin', 'parent')),
  invited_by_user_id varchar(255) references console_accounts (user_id) on delete set null,
  expires_at varchar(64) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
