# AGENTS.md

Shorts Generator: automated YouTube Shorts pipeline (download, faster-whisper transcription, LLM clip selection via LiteLLM, FFmpeg vertical cuts, Telegram/YouTube delivery) plus a Hono + React admin panel backed by PostgreSQL.

## Stack

- Bun 1.4.4 (`packageManager`), TypeScript (strict), Hono API, React/Vite admin in `web/`
- FFmpeg and yt-dlp on `PATH`; faster-whisper over HTTP; LiteLLM gateway; PostgreSQL; Redis (BullMQ)
- Optional Python: `opencv-python` (<5) for speaker framing, `edge-tts` for narrated modes
- Vitest for tests, with a 100% coverage gate

## Commands

```bash
bun install --frozen-lockfile   # setup (same as CI)
bun run dev                     # API with hot reload (src/server/index.ts)
bun run cli generate            # run the pipeline for configured channels
bun run web:dev                 # admin UI (Vite)
bun run build                   # typecheck (scripts/typecheck.cjs)
bun run test                    # Vitest, single run
bun run test tests/core/pipeline.test.ts   # single file
bun run test:coverage           # Vitest with the 100% gate
bun run smoke-test              # run when the pipeline changes (not in CI)
```

## Structure

- Architecture, pipeline flow, and the full env reference: `CLAUDE.md`.
- `src/cli.ts`, `src/cli-commands/`: CLI entrypoints, one file per command group
- `src/core/`: pipeline (analyzer, audio, loudness, delivery-check, publishers, quiz, comic, faceless)
- `src/server/`: Hono admin API, including the YouTube OAuth routes
- `web/`: React/Vite admin panel
- `db/migrations/`: SQL migrations
- `tests/`: Vitest suites; `scripts/`: ops and diagnostic scripts; `k8s/`: cron and job manifests
- `prototypes/`: standalone prototypes with their own `package.json`

## Conventions

- Max 150 lines per file; split by responsibility when a file approaches the limit.
- Strict TypeScript; shared types live in `src/types.ts`.
- Process videos sequentially (no parallelism across videos).
- Work in Plan, Act, Validate order.
- Done means `bun run build` and `bun run test:coverage` pass; `bun run smoke-test` too when the pipeline changes.
- Keep secrets and sensitive data out of context, logs, and commits.
- Every video generated from another video MUST include the original link in the YouTube description.
- Commits: conventional style (`type(scope): subject`), as in `git log`.
- PRs: follow `.github/pull_request_template.md`.
- Dependencies: `bun.lock` is the lockfile; install with `--frozen-lockfile`. Dependabot opens weekly grouped PRs.

## Gotchas

- Env var names are in `.env.example`; values never go in the repo. The control plane needs `PORT`, `DATABASE_URL`, `ADMIN_API_TOKEN`, `ADMIN_ALLOWED_ORIGINS`, `CONTROL_PLANE_ENCRYPTION_KEY` (base64 of 32 bytes), and `CONTROL_PLANE_ENCRYPTION_KEY_VERSION`.
- Migrations run automatically when `ADMIN_API_TOKEN`, `DATABASE_URL`, and `CONTROL_PLANE_ENCRYPTION_KEY` are set.
- `CHANNEL_FLOW_MODE=cuts` and `VITE_CHANNEL_FLOW_MODE=cuts` block quiz runs and creation (cluster mode).
- Per-channel YouTube tokens live encrypted in `publishing_accounts`. Never call `saveBundle` with only some providers: it deletes the accounts missing from the bundle. Use `upsertPublishingAccount` (`src/core/publishing-accounts.ts`).
- `/api/youtube/callback` must stay public. It is reached by a browser redirect with no `Authorization` header, so a 401 means auth middleware is intercepting it.

### YouTube token renewal

Symptom: upload fails with `invalid_grant`. This cancels only that upload, not the pod.

1. Preferred: the pipeline sends a "Autorizar YouTube" button to the channel's Telegram. The owner picks the channel's Google account and the callback saves the new token. Resend manually with `npx tsx scripts/send-reauth-button.ts <channelId>`.
2. Local token: `scripts/get-youtube-token.ts` (serves `localhost:3000/callback`). Use `prompt=consent`. If Google returns no `refresh_token`, revoke the app's access on the account and retry.
3. Write to the cluster: `scripts/update-cluster-tokens.ts` takes one token per channel from env vars and changes only the channels that have one set. Set `DATABASE_URL`, `ADMIN_API_TOKEN`, `CONTROL_PLANE_ENCRYPTION_KEY`, `YOUTUBE_CLIENT_ID`, and `YOUTUBE_CLIENT_SECRET` from the k8s secret `shorts-generator-secret`, through a port-forward to postgres. Never paste the values into the repo or a PR.
4. Validate (read-only): `npx tsx scripts/check-youtube-identity.ts`.

Managed channels: `santidade-catolica` (cuts), `quiz-channel` (quiz), `akitemquiz` (cuts).

<!-- base-actions-main-policy -->
## GitHub Actions — padrão obrigatório (@main)

- Referencie as actions internas sempre pelo branch, nunca por SHA:
  - `uses: juninmd/base-actions/<action>@main`
  - `uses: juninmd/base-actions/.github/workflows/<arquivo>.yml@main`
- Não fixe `@<sha>` em `juninmd/base-actions`: a atualização é centralizada no
  `main` e passa a valer no próximo run.
- PRs cujos checks não iniciam por billing/spending limit são mesclados pelo bot central
  `juninmd/base-actions/.github/workflows/auto-merge-billing-blocked.yml`.
  Para impedir o merge automático de um PR, aplique a label `do-not-merge`.
