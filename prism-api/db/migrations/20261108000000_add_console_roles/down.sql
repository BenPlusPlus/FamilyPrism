drop table if exists console_invitations;

delete from messages where sender_user_id is null;
alter table messages
  drop constraint if exists messages_sender_user_id_fkey;
alter table messages
  alter column sender_user_id set not null;
alter table messages
  rename column sender_user_id to sender_admin_user_id;

delete from console_accounts where role <> 'admin';
alter table console_accounts
  drop column role;
alter table console_accounts rename to admin_users;

alter table messages
  add constraint messages_sender_admin_user_id_fkey
  foreign key (sender_admin_user_id) references admin_users (user_id) on delete restrict;
