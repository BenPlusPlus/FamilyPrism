-- 'block' is the built-in No internet profile: the Client blocks everything except the local
-- network and the FamilyPrism server with Windows Firewall, and leaves DNS alone.
alter table client_dns_states
  drop constraint client_dns_states_directive_kind_check;
alter table client_dns_states
  add constraint client_dns_states_directive_kind_check
  check (directive_kind in ('profile', 'reset', 'block'));

alter table client_dns_states
  drop constraint client_dns_states_standing_kind_check;
alter table client_dns_states
  add constraint client_dns_states_standing_kind_check
  check (standing_kind is null or standing_kind in ('profile', 'reset', 'block'));

alter table pending_dns_directives
  drop constraint pending_dns_directives_directive_kind_check;
alter table pending_dns_directives
  add constraint pending_dns_directives_directive_kind_check
  check (directive_kind in ('profile', 'reset', 'block'));

alter table pending_dns_directives
  drop constraint pending_dns_directives_standing_kind_check;
alter table pending_dns_directives
  add constraint pending_dns_directives_standing_kind_check
  check (standing_kind is null or standing_kind in ('profile', 'reset', 'block'));
