# No internet is a built-in Internet profile, not a stored row

Parents pick No internet from the same list as the DNS profiles a Console admin creates, with the same time limits. It is not a row in `dns_profiles`. The picker lists a fixed entry (`builtin:no-internet`) first, and the apply handler turns it into a DNS directive of kind `block`. Every other screen and query works only with real profiles. An admin can't create a profile with the same name.

A `kind` column on `dns_profiles` would make every reader of that table (settings CRUD, picker labels, apply, name uniqueness) branch on it and handle missing IP addresses, and the row would need a seed and protection from edits and deletes. The directive still needs its own kind, because the Service does something different (firewall, not DNS) and Clients older than 0.1.10 must not receive it. Coding No internet as a fake DNS address would hide that difference from old Clients instead of gating it. Because `block` is an ordinary directive kind, it can be standing DNS or a DNS overlay. A timed profile over standing No internet ("30 minutes for homework") goes back to No internet when it ends.

## Considered Options

- A separate No internet control beside the profile picker (two sets of controls for one question)
- A `kind` column and seeded row in `dns_profiles`
- A DNS profile pointing at a dead or loopback resolver (cuts off the server too, and leaks; see ADR 0006)
