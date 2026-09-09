1.  **Add tests for `src/core/youtube-download.ts`**
    *   Create `tests/core/youtube-download.test.ts`.
    *   Use `write_file` to write the test code covering the `downloadAudioOnly` function specifically lines 44-65, 74, 93-107 by mocking `execYtDlp`, `fs`, and `withCookies`.
    *   Run `pnpm exec vitest run tests/core/youtube-download.test.ts` to verify the tests pass.
2.  **Add tests for `src/core/youtube-info.ts`**
    *   Create `tests/core/youtube-info.test.ts`
    *   Use `write_file` to write tests covering lines 53, 95, 143-144, by mocking `execYtDlp` to test errors like 'no video formats found' or invalid `url`, and `filesize_approx` returning 'NA'.
    *   Run `pnpm exec vitest run tests/core/youtube-info.test.ts` to verify the tests pass.
3.  **Add tests for `src/core/youtube-metadata.service.ts`**
    *   Create `tests/core/youtube-metadata.service.test.ts`.
    *   Use `write_file` to write the test code covering all lines, branches, and functions (15-82).
    *   Run `pnpm exec vitest run tests/core/youtube-metadata.service.test.ts` to verify the tests pass.
4.  **Run full coverage validation**
    *   Run `pnpm run test:coverage` to ensure no regressions were introduced and coverage goals are met (100%).
5.  **Pre-commit checks**
    *   Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
