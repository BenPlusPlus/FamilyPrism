# DNS overlay remaining never increases except by Console admin extend

Issue-time start makes a DNS overlay a UTC deadline, but the Service must restore standing DNS while disconnected and must ignore a Windows clock set backward. Remaining time is the minimum of monotonic remaining and UTC-deadline remaining, and must not increase except when a Console admin extends the overlay.

Wall clock alone would let a Standard user add overlay time by setting the clock back. Monotonic time alone would pause through sleep and reboot and miss the issue-time deadline. Server-only restore would fail when the Client is offline at expiry. Service tamper (killing the Service or deleting its state) stays out of scope.
