---
phase: 05-rendering-audio
fixed_at: 2026-11-21T23:34:00Z
review_path: .planning/phases/05-rendering-audio/05-REVIEW.md
iteration: 1
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-11-21T23:34:00Z
**Source review:** .planning/phases/05-rendering-audio/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 1 (fix_scope `critical_warning`: 0 critical, 1 warning)
- Fixed: 1
- Skipped: 0
- Out of scope, left open in REVIEW.md: IN-01, IN-02, IN-03, IN-04 (info)

## Fixed Issues

### WR-01: [new, WR-02 fix code] Voices queued on a frozen-clock suspended context are never torn down, so the 16-voice bound does not hold for the audio graph

**Files modified:** `src/audio/audio-engine.ts`, `src/audio/voice-pool.ts`, `src/audio/audio-engine.test.ts`, `src/audio/voice-pool.test.ts`
**Commit:** f1b2a1e
**Status:** fixed: requires human verification (lifecycle and state logic)
**Applied fix:**
- **Bounded starting window.** I added `STARTING_WINDOW_MS = 250` and a third, optional `clock: () => number` constructor parameter. It defaults to `performance.now()`, so `main.ts` is unchanged, and tests pass a fake clock. `unlock()` sets the deadline only when no resume is already in flight. A re-gesture while the first `resume()` is still pending, such as every Shift flipper keydown, does not reopen the window. `flush()` now treats a context as playable only if it is running, or suspended with a resume in flight before the deadline (`isStarting()`).
- **Discard when the context is neither running nor starting.** In that state `flush()` calls `pool.discardAll(currentTime)`, which fades, stops, disconnects and forgets every voice the pool still holds, and then drops the cues. Voices built in an expired window therefore cannot all fire at once on a late start. This covers point 2 of the finding as well as the graph bound. A cue sounds at most `STARTING_WINDOW_MS` late. A context that starts inside the window keeps its voices, so the first "start" figure still plays as before.
- **Teardown on steal.** `VoiceHandle` gained a required `teardown()`. The engine supplies it as the shared disconnect body, and `onended` now runs `pool.release` and then `teardown()`. `admit()` and `add()` take `rendering` (default `true`). When it is `false`, `steal()` calls `teardown()` right after fading and stopping the voice, because `onended` will not fire. On a running context, teardown still waits for `onended`, so the 5 ms steal fade is not cut.
- **Doc comments updated** to match the new behaviour: the engine header (lifecycle bullet, the "stale cue is never replayed" contract, and Pattern 6 teardown), the `flush()`/`play()`/`resumePending` docs, and the pool header plus the `admit`/`add`/`steal` docs. I left the `main.ts` header alone because that is IN-01, which is out of scope.
- **Hot path:** no per-frame allocation. The clock is read only while a resume is pending on a suspended context. `discardAll` on an empty pool is an empty loop. The one extra closure per voice is allocated per event, not per frame. Sim and determinism are untouched.
- **Tests added** (6 new; the suite went from 758 to 764):
  - **Engine, never-settling resume:** `resume()` stays pending, the fake clock advances, and every cue kind plus extra bumpers is flushed for 120 frames, with a re-gesture at frame 60. While the window is open, the connected voice nodes stay within `MAX_VOICES * max nodes per voice`, and `fireAllEnded()` is never called, so every disconnection came from the pool's teardown. After the window, flushes build nothing, `activeVoices()` is 0 and no voice node is still connected. `resume()` was called twice, and the window opened only once. After the context runs, fresh cues play.
  - **Engine, start inside the window:** a context that starts within the window keeps the voice scheduled while it was starting.
  - **Engine, running context:** a voice stolen on a running context stays connected until `onended`.
  - **Pool:** a steal on a rendering context does not call teardown. A steal on a non-rendering context calls it, through both the `admit` path and the `add` path. `discardAll` tears down and forgets every voice, and running it on an empty pool does nothing.

## Verification

All gates ran twice: first in the isolated worktree (`.claude/worktrees/rf-05-*`, using the main checkout's `node_modules` via parent-directory resolution), then again in the **main checkout** after the fast-forward to f1b2a1e. The main-checkout results below can be reproduced from the current tree:
- `npx tsc --noEmit`: exit 0
- `npx eslint src`: exit 0
- `npx vitest run`: 52 files, 764 tests passed
- `npm run soak`: 4 files, 4 tests passed

Note: `prettier --check` flags every CRLF working-copy file, including files this fix did not touch, because Git `core.autocrlf=true`. Run on LF copies, the four touched files are clean.

---

_Fixed: 2026-11-21T23:34:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
