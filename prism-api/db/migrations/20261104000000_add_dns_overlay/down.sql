alter table pending_dns_directives
  drop constraint pending_dns_directives_standing_kind_check;

alter table pending_dns_directives
  drop column expires_at,
  drop column restore_command_id,
  drop column standing_kind,
  drop column standing_profile_name,
  drop column standing_primary_ip,
  drop column standing_secondary_ip,
  drop column standing_status,
  drop column standing_issued_at,
  drop column standing_completed_at;

alter table client_dns_states
  drop constraint client_dns_states_standing_kind_check;

alter table client_dns_states
  drop column expires_at,
  drop column restore_command_id,
  drop column standing_kind,
  drop column standing_profile_name,
  drop column standing_primary_ip,
  drop column standing_secondary_ip,
  drop column standing_status,
  drop column standing_issued_at,
  drop column standing_completed_at;
