create table household_settings (
  id varchar(255) primary key,
  visit_retention_days integer not null check (visit_retention_days >= 1 and visit_retention_days <= 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into household_settings (id, visit_retention_days) values ('household', 30);
