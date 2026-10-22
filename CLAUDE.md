# neuromap — working rules

NeuroPy's rules apply here too (`NeuroPy/CLAUDE.md`): one-line comments carrying only *why*, one source of truth,
no defensive guards around our own code, root cause over band-aid.

## Keep it clean, early

Watching for clutter is part of every change, not a later cleanup: the same concept handled in several places,
fixes stacking on fixes, a bug that comes back, a file or function that keeps growing. When you see it, rewrite
that part around one model before adding more, and delete what the rewrite replaces.

## Verify before pushing

`npm run typecheck` and `npm run test:e2e` (Playwright on surrogate data, `web/e2e/`) must pass. A change to a
flow the harness does not cover gets a test there first. The harness drives Chromium through `playwright-core`:
set `BROWSER` to a Chrome/Chromium binary if `npx playwright install chromium` has not been run.

## Spelling

American spelling in code, comments and UI text: normalize, not normalise.
