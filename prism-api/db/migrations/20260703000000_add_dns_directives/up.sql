create table dns_profiles (
  id varchar(255) primary key,
  name varchar(100) not null unique,
  primary_ip varchar(45) not null,
  secondary_ip varchar(45),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table client_dns_states (
  client_id varchar(255) primary key references clients (id) on delete cascade,
  command_id varchar(255) not null,
  directive_kind varchar(16) not null check (directive_kind in ('profile', 'reset')),
  profile_name varchar(100),
  primary_ip varchar(45),
  secondary_ip varchar(45),
  status varchar(16) not null check (status in ('pending', 'delivered', 'applied', 'failed')),
  error text,
  issued_at varchar(64) not null,
  completed_at varchar(64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pending_dns_directives (
  client_id varchar(255) primary key references clients (id) on delete cascade,
  command_id varchar(255) not null,
  directive_kind varchar(16) not null check (directive_kind in ('profile', 'reset')),
  profile_name varchar(100),
  primary_ip varchar(45),
  secondary_ip varchar(45),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
