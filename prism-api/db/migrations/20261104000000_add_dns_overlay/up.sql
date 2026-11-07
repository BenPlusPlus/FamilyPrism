alter table client_dns_states
  add column expires_at varchar(64),
  add column restore_command_id varchar(255),
  add column standing_kind varchar(16),
  add column standing_profile_name varchar(100),
  add column standing_primary_ip varchar(45),
  add column standing_secondary_ip varchar(45),
  add column standing_status varchar(16),
  add column standing_issued_at varchar(64),
  add column standing_completed_at varchar(64);

alter table client_dns_states
  add constraint client_dns_states_standing_kind_check
  check (standing_kind is null or standing_kind in ('profile', 'reset'));

alter table pending_dns_directives
  add column expires_at varchar(64),
  add column restore_command_id varchar(255),
  add column standing_kind varchar(16),
  add column standing_profile_name varchar(100),
  add column standing_primary_ip varchar(45),
  add column standing_secondary_ip varchar(45),
  add column standing_status varchar(16),
  add column standing_issued_at varchar(64),
  add column standing_completed_at varchar(64);

alter table pending_dns_directives
  add constraint pending_dns_directives_standing_kind_check
  check (standing_kind is null or standing_kind in ('profile', 'reset'));
