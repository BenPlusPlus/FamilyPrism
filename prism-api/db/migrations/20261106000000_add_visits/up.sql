create table visits (
  id varchar(255) primary key,
  client_id varchar(255) not null references clients (id) on delete cascade,
  windows_user varchar(255) not null,
  browser varchar(16) not null check (browser in ('Chrome', 'Edge', 'Firefox')),
  browser_profile varchar(255) not null,
  url text not null,
  url_hash varchar(64) not null,
  title text not null,
  visited_at varchar(64) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index visits_duplicate_idx
  on visits (client_id, windows_user, browser, browser_profile, visited_at, url_hash);

create index visits_visited_at_idx on visits (visited_at desc);
