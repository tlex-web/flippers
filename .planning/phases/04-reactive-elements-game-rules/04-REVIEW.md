---
phase: 04-reactive-elements-game-rules
reviewed: 2026-11-20T20:18:18Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - index.html
  - src/control/flipper-controller.test.ts
  - src/control/flipper-controller.ts
  - src/harness/flipper-feel.test.ts
  - src/physics/flipper-response.test.ts
  - src/physics/planck-world.ts
  - src/physics/types.ts
  - src/sandbox/debug-draw.ts
  - src/sandbox/flipper-e2e.test.ts
  - src/sandbox/main.ts
  - src/ui/hud.test.ts
  - src/ui/hud.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
  necessity: 0
status: issues_found
---

# Phase 04: Code Review Report (gap closure 04-09 / 04-10)

**Reviewed:** 2026-11-20T20:18:18Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

This is an incremental re-review of the two gap-closure plans, scoped to `git diff 6590dce..HEAD`:

- **04-09 (G-04-10):** limit-impulse reset in `PlanckWorld.setFlipperMotor`, `FlipperState.restLimitAngle`, and the FSM rest guard.
- **04-10 (G-04-6):** `DiagView` DOM readout, canvas text removed, and the controls hint rewritten as a `<dl>`.

Earlier findings WR-01, WR-02 and IN-01..IN-05 stay tracked in `04-REVIEW-DISPOSITION.md`, so the numbering here continues after them.

**Verified correct:**

- **The limit-impulse reset works on planck 1.5.0.** In `node_modules/planck/dist/planck.mjs:8128-8135`, `RevoluteJoint.enableLimit(flag)` zeroes `m_impulse.z` when the flag changes. The 2.3-style limit row (`:8262-8292`) only clamps the accumulated sign, so a stale positive reserve does hold a reversing bat until it is used up. The comment block's root-cause analysis is accurate. Resets fire only when the commanded sign changes, so a held cradle keeps its impulse.
- **The FSM guard holds.** In a scratch sweep of taps (holds 1-12 steps, both bats, three pre-rests), the worst angle at `resting` was 0.0350 rad from `restLimitAngle`, inside `REST_ANGLE_TOL`.
- **`restLimitAngle` matches the geometry.** It is computed from the same `droop` that poses the bat, so left is π/8 and right is π − π/8.
- **The 04-10 changes are clean.** `debug-draw.ts` no longer references `HudData` anywhere, `main.ts` calls the new `draw(...)` signature, and the `DiagView` write-on-change logic is correct. `tsc --noEmit` and ESLint are clean on the changed files.
- **The `<dl>` lists the right keys.** They match `flipper-input.ts:65-70` and `game-input.ts:55-59`.

**Concerns:**

- **Pinch ejection (WR-03).** The faster response exposed a ball-pinch over-speed. The fix took the wall out of the FLIP-02 rig and relaxed the assertion, but the same pinch geometry exists on `TABLE_SPEC` and nothing covers it.
- **Flaky new test (WR-04).** The new 192-rig quick-tap sweep runs in one `it` under the default 5 s timeout, and it timed out in both full-suite runs on this machine.

## Narrative Findings (AI reviewer)

## Warnings

### WR-03: 04-09 hid a bat-to-wall pinch ejection by changing the test rig; the same pinch exists on TABLE_SPEC and got worse

**File:** `src/harness/flipper-feel.test.ts:16-27, 238-243` (behavior from `src/physics/planck-world.ts:878-895`)

**Issue:**

The 04-09 summary and the new comment at `flipper-feel.test.ts:16-27` both say what happened. Once the dead time was gone, a rising bat squeezed the ball against the proof box's interior wall and ejected it at about 16 m/s, a 256% v = ω·r mismatch. The response was to filter that wall out (`OPEN_PROOF_BOX`) and lower the FLIP-02 floor from 1.5x to 1.3x. The comment calls this a "rig artifact, not flipper physics". The real table has the same geometry:

- **The gap is smaller than the ball.** The left sling's lower edge, `LEFT_SLING` (0.86, 4.95) to (1.16, 5.1) at `src/table/spec.ts:268-272`, sits about 0.29 m above the raised bat's top face near x ≈ 0.94. The bat pivot is `LEFT_PIVOT` (0.69, 5.45). The ball is 0.40 m across, so this breaks the spec's own clearance rule: a gap the ball must pass needs to be at least 2·r + 0.05.
- **Measured on `TABLE_SPEC` with no reactive layer.** The rig matches `launchAtRadius`: the bat is drooped with −1 for 30 steps, the ball starts 0.01 m off the bat face, and the bat is raised with +1. Base-position (rFrac 0.3) flips gave these speeds:
  - **HEAD, left bat:** peaked at 19.4 m/s, then held 16.4 m/s for 9 steps.
  - **HEAD, right bat:** 16.8 m/s.
  - **6590dce (before 04-09):** 15.0 / 12.6 m/s on the left and 15.4 m/s on the right.
  - **Control:** the same placement under −1 never exceeded 0.34 m/s. The ball was not resting on a collider; the speed comes from the raise.
- **What that means for feel:**
  - A base hit now launches faster than a tip hit on the real table (rFrac 0.7 held about 8.7 m/s after its transient). That reverses the FLIP-02 Core Value property.
  - The soak's 15 m/s ceiling only exercises dead flippers, so it would not catch this.

The underlying geometry predates this phase. The defect in this change set is the response: 04-09 made the pinch harder and then took it out of the only test that would have seen it, rather than adding coverage on the table the player actually plays.

**Fix:** Add a `TABLE_SPEC` launch case for both bats at rFrac 0.3 / 0.5 / 0.7, with a sustained-speed ceiling (for example ≤ 1.35 × ω_peak·r_contact) and the tip > base ordering. Then fix whichever side fails: either move or reshape the sling's lower edge so the raised-bat-to-sling gap is at least 2·`BALL_RADIUS_M` + 0.05, or accept the tolerance and record it in the disposition ledger. Do not just keep the rig filtered.

```ts
for (const id of [0, 1]) for (const rFrac of [0.3, 0.5, 0.7]) {
  it(`TABLE_SPEC flipper ${id} rFrac ${rFrac}: no pinch over-speed`, () => {
    const r = launchOnTable(id, rFrac); // launchAtRadius twin on new PlanckWorld()
    expect(r.launch).toBeLessThanOrEqual(r.peakOmega * r.contactRadius * 1.35);
  });
}
```

### WR-04: The new quick-tap sweep exceeds Vitest's default 5 s timeout under full-suite load

**File:** `src/sandbox/flipper-e2e.test.ts:299`

**Issue:** The test builds 192 rigs (6 bindings × 8 holds × 4 pre-rests), each a full `PlanckWorld` stepped about 115-230 times, inside a single `it` with no timeout. `vitest.config.ts` sets no `testTimeout`, so the default of 5000 ms applies.

- **Alone:** about 0.8 s.
- **In `npx vitest run`:** 6427 ms and 6666 ms in two consecutive runs, failing with "Test timed out in 5000ms".

The pre-existing soak tests (`soak.test.ts`, `table-soak.test.ts`, `reactive-soak.test.ts`, `game.determinism.test.ts`) timed out in the same runs, so the machine was contended. Even so, this plan added one more heavy single-`it` test without a budget. As written, `npm test` passing depends on host load. The 04-09 summary's "385 tests" pass was observed in a quieter environment.

**Fix:** Give the test an explicit budget, or split it so each case stays small. Separately, consider a suite-wide `testTimeout` in `vitest.config.ts` for the soak-class tests.

```ts
it("no quick tap (3-10 steps, any rest, all six bindings) leaves a bat raised", () => {
  ...
}, 30_000);
// or: it.each(ALL_BINDINGS)("no quick tap on %s leaves a bat raised", ...)
```

## Info

### IN-06: `resting` has no position guard, and the entry tolerance allows about 3x the measured slop

**File:** `src/control/flipper-controller.ts:75, 217-229`

**Issue:**

- **Entry tolerance is loose.** `REST_ANGLE_TOL = 0.1` rad, while the measured worst resting offset is about 0.035 rad (confirmed: 0.0350 in a scratch tap sweep). A bat that stalls inside the 0.035-0.1 band can therefore enter `resting`. That takes two consecutive sub-1e-3 deltas, for example a ball wedged under the bat. The bat then gets motor 0 up to about 5 cm off its rest pose at the tip (0.1 rad × 0.5 m).
- **Nothing corrects it once resting.** The `resting` case issues no command, and a motor 0 with `FLIPPER_MAX_MOTOR_TORQUE = 500` brake-locks the bat at whatever angle it is at. Nothing drives it home until the next press.
- **The original reason for motor 0 at rest is gone.** The constructor comment explains it: the Phase-2 limit jam on startup. The 04-09 limit-impulse reset removes that jam.

**Fix:** Tighten `REST_ANGLE_TOL` to about 0.05. In `case "resting"`, drop back to `returning` with −1 if `|angle - restLimitAngle| > REST_ANGLE_TOL`.

### IN-07: Dead `moved` writes on the returning path

**File:** `src/control/flipper-controller.ts:219, 243`

**Issue:** Since G-04-10, `returning` never reads `fsm.moved`; only `flipping-up` does, at line 203. `onPressEdge` (line 173) already resets `moved = false` on entry to `flipping-up`. The writes in `drop()` (line 243) and in the returning-to-resting transition (line 219) are dead stores that suggest a dependency that no longer exists. The field doc at line 90 already says "held-up detector".

**Fix:** Remove both writes.

### IN-08: Stale "upper/lower limit" wording contradicts the mirrored-limit model

**File:** `src/control/flipper-controller.ts:5, 227-228`

**Issue:** The header says "+1 = toward the upper limit, -1 = toward the lower", and the `resting` comment says "the lower limit holds the bat". For the left bat (`raiseSign = -1`), the rest limit is the joint's UPPER limit (`droop = FLIPPER_UPPER_ANGLE`, `planck-world.ts:608`). The rewritten paragraph at lines 19-31 is correct, so the file now contradicts itself.

**Fix:** Say "raise / up limit" and "return / rest limit" throughout, matching `planck-world.ts`.

### IN-09: The controls list does not say which nudge key goes which way, and key alternatives have no separator

**File:** `index.html:122-133`

**Issue:**

- **Nudge directions are missing.** The "Nudge" row lists `X . ↑`, but `game-input.ts:57-59` binds them to left, right and up respectively. A player cannot tell which is which.
- **Alternatives run together for assistive tech.** Adjacent `<kbd>` elements have no separator text, so a screen reader reads "Z leftwards arrow Left Shift" with no "or". The panel is not `aria-hidden`.

**Fix:** Label the nudge keys, for example `<kbd>X</kbd> left <kbd>.</kbd> right <kbd>↑</kbd> up`. Put a visually hidden " or " between alternatives, or give each `<dd>` an `aria-label`.

---

_Reviewed: 2026-11-20T20:18:18Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
