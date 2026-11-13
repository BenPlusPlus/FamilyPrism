-- No internet directives have no 'profile' or 'reset' equivalent, so they are dropped. A Client
-- with No internet on keeps it until it is sent another profile.
delete from pending_dns_directives
  where directive_kind = 'block' or standing_kind = 'block';
delete from client_dns_states
  where directive_kind = 'block' or standing_kind = 'block';

alter table pending_dns_directives
  drop constraint pending_dns_directives_standing_kind_check;
alter table pending_dns_directives
  add constraint pending_dns_directives_standing_kind_check
  check (standing_kind is null or standing_kind in ('profile', 'reset'));

alter table pending_dns_directives
  drop constraint pending_dns_directives_directive_kind_check;
alter table pending_dns_directives
  add constraint pending_dns_directives_directive_kind_check
  check (directive_kind in ('profile', 'reset'));

alter table client_dns_states
  drop constraint client_dns_states_standing_kind_check;
alter table client_dns_states
  add constraint client_dns_states_standing_kind_check
  check (standing_kind is null or standing_kind in ('profile', 'reset'));

alter table client_dns_states
  drop constraint client_dns_states_directive_kind_check;
alter table client_dns_states
  add constraint client_dns_states_directive_kind_check
  check (directive_kind in ('profile', 'reset'));
