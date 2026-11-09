# Security policy

Report a vulnerability privately through GitHub's "Report a
vulnerability" button on this repository's Security tab. Please do not
open a public issue for it. You will get a reply within 7 days.

Scope: the code in this repository. The study runs fully offline
against local files: no API keys, no network calls, no external data.
The fault harness kills only its own child processes in its own work
directory. No credential is stored in this repository. Dependency
advisories checked at build time are recorded in REPORT.md (Security
audit).
