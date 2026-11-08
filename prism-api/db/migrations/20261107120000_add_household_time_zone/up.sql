alter table household_settings
  add column time_zone varchar(64) not null default 'UTC';
