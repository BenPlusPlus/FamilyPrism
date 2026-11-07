# DNS overlays require a Client that can restore standing DNS

A time limit is only offered when the Client's last seen version understands DNS overlays. Older or unknown versions keep indefinite apply and reset.

An old Service ignores unknown `apply-dns` fields, so it would leave the overlay profile in place forever. Server-pushed restore at expiry fails if that Client is offline at the deadline, which is when restore matters most. Blocking all DNS changes on old Clients is unnecessary; only the overlay is withheld.
