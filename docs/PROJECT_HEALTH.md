# Project Health

This document records the repository improvement pass applied on 2026-05-17.

## Detected Surface

- Node.js / TypeScript / JavaScript
- Docker
- GitHub Actions

## Automation Added Or Confirmed

- Security policy: Added in this pass.
- Dependabot: Added in this pass with detected ecosystems.
- EditorConfig: Added in this pass.
- Project Health workflow: Existing workflows were present; added a dedicated Project Health workflow.

## Available Root Commands

- package script: build
- package script: cli
- package script: dev
- package script: generate
- package script: generate:top
- package script: generate:url
- package script: smoke-test
- package script: start
- package script: test
- package script: test:coverage
- package script: test:watch
- package script: typecheck
- package script: web:build
- package script: web:dev
- package script: web:preview

## Improvement Plan

1. Keep dependency drift visible through weekly Dependabot pull requests.
2. Keep runtime secrets out of git through the Project Health guardrail.
3. Use .editorconfig to reduce formatting churn across agents and local editors.
4. Treat this file as the lightweight audit entry for future improvements.

## Suggested Next Improvements

- Add project-specific tests to the Project Health workflow once the default branch is stable.
- Add CodeQL or language-native security scanning where the repository has a supported build path.
- Convert manual setup notes into reproducible scripts when setup steps are repeated.
- Add structured logging and health endpoints to service repositories that expose long-running APIs.