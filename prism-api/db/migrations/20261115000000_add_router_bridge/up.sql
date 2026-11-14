-- The optional Router bridge (ADR 0007) and the Network devices it blocks at the router (ADR 0008).
-- At most one Router bridge is registered; the app enforces that on registration.
create table router_bridges (
  id varchar(255) primary key,
  name varchar(100) not null,
  credential_hash text not null,
  credential_salt varchar(255) not null,
  last_used_at varchar(64),
  last_seen_version varchar(64),
  router_model varchar(100),
  -- last_report_at: when the latest reconcile report arrived. last_reconciled_at: when the latest
  -- report that included the router's table arrived. router_entries is that whole MAC filter table
  -- as JSON [{name, mac}]; device_errors is JSON [{deviceId, code, message}]. last_error_code and
  -- last_error come from the latest report and are null when it succeeded.
  last_report_at varchar(64),
  last_reconciled_at varchar(64),
  last_error_code varchar(32),
  last_error text,
  router_entries text,
  device_errors text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table network_devices (
  id varchar(255) primary key,
  name varchar(100) not null unique,
  standing_access varchar(16) not null check (standing_access in ('blocked', 'allowed')),
  timed_access varchar(16) check (timed_access is null or timed_access in ('blocked', 'allowed')),
  timed_expires_at varchar(64),
  -- Last change to what the router should do for this device (access or MAC addresses).
  access_changed_at varchar(64) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table network_device_macs (
  mac varchar(17) primary key,
  device_id varchar(255) not null references network_devices (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index network_device_macs_device_idx on network_device_macs (device_id);
