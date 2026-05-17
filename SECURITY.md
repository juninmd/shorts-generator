# Security Policy

## Supported Versions

The default branch is the supported line for security fixes.

## Reporting a Vulnerability

Do not open public issues for suspected vulnerabilities. Report privately through GitHub Security Advisories when available, or contact the repository owner directly through the GitHub profile for juninmd.

Please include:

- A concise description of the issue.
- Reproduction steps or proof of concept.
- Impacted files, endpoints, commands, or environments.
- Any secrets or credentials that may have been exposed.

## Operational Baseline

- Runtime secrets must stay out of git. Commit only examples such as .env.example or .env.template.
- Dependency updates are tracked by Dependabot where the ecosystem is detected.
- The Project Health workflow checks for accidentally tracked runtime secret files on every pull request and default-branch push.