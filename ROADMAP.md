# ROADMAP

## Done
- Core pipeline (download → transcribe → analyze → render → deliver)
- Queue worker, quiz and narrated-story pipelines, admin dashboard
- 100% coverage gate in CI; automated dependency updates (Dependabot)

## Next
- [ ] Split files over the 150-line limit (`channel-bundle-repository.ts`, `demo-books.ts`, `job-store.ts`, `types.ts`)
- [ ] Pin and test Python scripts (`scripts/*.py`)
- [ ] Replace `fluent-ffmpeg` (deprecated upstream)
- [ ] Consolidate docs (`README`, `QUICKSTART`, `docs/`)
