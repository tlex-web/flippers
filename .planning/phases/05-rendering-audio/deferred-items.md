## Deferred Items

- src/sandbox/main.ts is not Prettier-clean (pre-existing since df0afc5, 05-02)
  status: open
  **What:** `npx prettier --check src/sandbox/main.ts` warns: the `tr.resize(computeView(...))` call (around line 302) exceeds the print width and Prettier wants it wrapped. ESLint and tsc are clean. Found during 05-04 Task 2; out of scope for that plan, left untouched.

- src/control/flipper-controller.test.ts is not Prettier-clean (pre-existing)
  status: open
  **What:** `npx prettier --check src/control/flipper-controller.test.ts` warns on the existing `SpyWorld` constructor signature (around line 35) and the `hold(...)` helper signature (around line 99). Both predate 05-05; the cases 05-05 Task 2 appended are formatted. ESLint and tsc are clean. Found during 05-05 Task 2; left untouched.
