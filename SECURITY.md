# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately to the repository owner through GitHub (private vulnerability reporting, or a direct message to the maintainer while the repository is private). Do not open a public issue for a security problem.

Include the affected version or commit, the steps to reproduce and the impact you observed. I will acknowledge the report, confirm whether it reproduces and publish a fix when it is resolved.

## Supported versions

Only the latest version on `main` receives security fixes.

## Scope

The application code, the SQL migrations and the scripts in this repository. The configuration of a particular hosted Supabase project or deployment is the responsibility of whoever runs it.

The controls in place are described in [docs/security.md](docs/security.md).
