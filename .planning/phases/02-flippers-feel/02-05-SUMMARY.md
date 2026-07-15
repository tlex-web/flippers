---
phase: 02-flippers-feel
plan: 05
subsystem: harness
tags: [flip-04, flip-02, flip-03, soak, seeded-gate, sub-stepping, feel, v-equals-omega-r, cradle, determinism]

# Dependency graph
requires:
  - phase: 02-flippers-feel
    plan: 01
    provides: Two mirrored capsule feel flippers (tipRadius), feel constants (FLIPPER_UP_SPEED/RETURN_SPEED, angle limits), setFlipperMotor feel-speed remap
  - phase: 02-flippers-feel
    plan: 04
    provides: Adaptive angular sub-stepping in step() + the PlanckWorldOptions.subStepping off-switch (subStepping:false forces N=1), lastSubStepCount
  - phase: 01-physics-core-spike
    provides: PhysicsWorld interface, PlanckWorld.step() + setBullet CCD, the seeded swept-containment soak + flipperSweptTunnel invariant + prng, FixedStepLoop, stability/energy proof idioms
provides:
  - FLIP-04 seeded green gate (flipper-tunnel.gate.test.ts, npm run soak) — the phase's headline proof, a flipper-primary two-flipper swept non-penetration gate driven at peak omega with CCD + sub-stepping ON, >=630s simulated, non-vacuous
  - Sub-stepping teeth control (flipper-tunnel.test.ts, npm test) — isolates the D-01 mechanism (CCD off in BOTH arms) so subStepping ON holds it and OFF goes RED with a replayable seed + full state
  - Feel proofs (flipper-feel.test.ts, npm test) — tip-vs-base v=omega*r launch (FLIP-02) + jitter-free heavy cradle with monotonic energy (FLIP-03/D-09), detectors proven to have teeth
  - soak.ts SoakConfig.subStepping passthrough + flipperSweptTunnel checked over ALL flippers each step
  - containment.ts flipperSweptTunnel tipRadius-aware clearance (same-arity rename)
affects: [03-table-layout, 04-reactive-scoring, 05-render-audio]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flipper-primary swept non-penetration gate: extend the seeded soak to check flipperSweptTunnel over ALL getFlippers() each step, each bat's pre-angle copied out before world.step(), driven at feel peak omega across a dense seeded phase-offset sweep"
    - "Sub-stepping teeth isolation: hold CCD OFF (bullet:false) in BOTH arms of the control so subStepping is the SOLE differentiator (subStepping ON -> green, OFF -> red) — a stricter proof than toggling it with CCD on, which Planck CCD masks entirely in this rig"
    - "v=omega*r launch proof: rest a ball on the bat at contact radius r, raise the bat, measure peak launch within the bat arc; the tip/base RATIO is omega-independent so it pins the geometry regardless of the raise speed"
    - "Jitter-free cradle proof: drop a ball onto a held-up flipper (motor +1 re-asserted every step, D-06(1)), settle-to-rest + monotonic-energy window, with teeth (synthetic speed-up + un-held flipper both trip the detectors)"

key-files:
  created:
    - src/harness/flipper-tunnel.gate.test.ts
    - src/harness/flipper-tunnel.test.ts
    - src/harness/flipper-feel.test.ts
    - .planning/phases/02-flippers-feel/02-05-SUMMARY.md
  modified:
    - src/harness/soak.ts
    - src/harness/containment.ts

key-decisions:
  - "The bullet:true sub-stepping teeth control the plan specified is physically VACUOUS in this rig (Planck CCD catches the fast fling at every speed and peak omega=30 cannot skip the 0.2m ball rotationally): 0 flipper tunnels at bullet:true for all speeds 60-160 m/s, subStepping ON or OFF. Isolated sub-stepping instead with CCD OFF in BOTH arms (bullet:false, speed 96) — subStepping ON=0 tunnels, OFF=3 tunnels — a stricter, honest proof of the D-01 mechanism (deviation, threat T-02-10)"
  - "flipperSweptTunnel geometrically only registers a >~96 m/s ball (chord must span both sides of the radius+tipRadius band), which is why CCD (bullet) masks any sub-stepping effect — sub-stepping's teeth are visible only with CCD off, where N=2's extra mid-step narrow-phase sample closes the tunnel that N=1 leaves open"
  - "FLIP-02 raises the bat with the -1 motor sign: the +1/up sign droops the bat DOWN-slope (this rig's FSM convention) so a +1 flick drops into a falling ball and gravity inverts the scaling (base out-launches tip, ratio 0.55 vs 3.0). The -1 raise gives the correct v=omega*r (2.62 vs 3.0); the ratio is omega-independent so the geometry claim is unaffected by the raise speed"
  - "flipperSweptTunnel's halfWidth->tipRadius rename is a SAME-ARITY in-place rename (positions unchanged): containment.test.ts's 5 positional call sites pass their thin-segment half-width in that slot and stay green unedited; for the capsule tipRadius===halfWidth so the soak call sites are numerically identical"
  - "The FLIP-04 green gate reuses the flipperNegativeControl DRIVE (drop straight through the peak-omega bat, boundary isolated); with CCD + sub-stepping ON it asserts passed===true — the boundary containment is proven separately by soak.gate.test.ts, so this gate isolates the flipper property"

patterns-established:
  - "Sub-stepping teeth isolation via CCD-off-in-both-arms (see tech-stack patterns)"
  - "Feel-as-numbers: v=omega*r ratio test + jitter-free monotonic-energy cradle test with proof-of-teeth"

requirements-completed: [FLIP-02, FLIP-03, FLIP-04]

# Metrics
duration: 31min
completed: 2026-07-15
---

# Phase 2 Plan 05: FLIP-04 Gate + Feel Proofs Summary

**The phase's two Core-Value properties are now PROVEN, not demonstrated: a seeded green FLIP-04 flipper-primary swept non-penetration gate (CCD + sub-stepping ON, dense peak-omega sweep, >=630s simulated) with a replayable RED teeth control that isolates the D-01 sub-stepping mechanism, plus deterministic feel proofs — a tip hit out-launches a base hit per v=omega*r, and a caught ball cradles jitter-free with energy trending down.**

## Performance

- **Duration:** ~31 min
- **Started:** 2026-07-15T17:28:26Z
- **Completed:** 2026-07-15T17:59:41Z
- **Tasks:** 3 (Task 3 test-only TDD verifying existing physics)
- **Files:** 3 created (tests), 2 modified (soak + containment)

## Accomplishments
- **Task 1 — soak extended to a flipper-primary two-flipper gate.** Added `SoakConfig.subStepping` threaded into the default Planck adapter (orthogonal to `bullet`, omitted when unset so the adapter default applies under `exactOptionalPropertyTypes`). Extended `runCase` to check `flipperSweptTunnel` over ALL `getFlippers()` each step (a reusable pre-angle buffer copies EVERY bat's start angle out before `world.step()`), recording the flipper that actually tripped. Renamed `flipperSweptTunnel`'s 6th positional param `halfWidth`->`tipRadius` in place (same arity) so `clearance = radius + tipRadius` reflects the capsule's fat tip; `containment.test.ts`'s 5 positional call sites stay green unedited.
- **Task 2 — the FLIP-04 gate + sub-stepping teeth.** `flipper-tunnel.gate.test.ts` (npm run soak only) drives the flipper at peak omega across a dense seeded phase sweep with CCD + sub-stepping ON and asserts `passed===true`, empty failures, and `casesRun===210` (non-vacuous, 630s simulated). `flipper-tunnel.test.ts` (npm test) has the bounded green + the sub-stepping teeth control (isolated with CCD off in both arms — subStepping ON holds it, OFF goes RED with a replayable seed + full ball/flipper state) + deterministic replay.
- **Task 3 — feel proofs (FLIP-02 + FLIP-03/D-09).** `flipper-feel.test.ts` drives the real `PlanckWorld` through the interface + `FixedStepLoop` only: a tip hit (r=0.45) launches at 7.7 m/s vs a base hit (r=0.15) at 2.9 m/s (ratio 2.62 vs the 3.0 contact-radius ratio, within 13%); a ball dropped onto a held-up flipper settles jitter-free (speed 0, drift 0) with monotonically non-increasing kinetic energy. Both detectors are shown to have teeth.
- Full suite green **71/71** (+8), `npx eslint .` + `npx tsc --noEmit` clean, `npm run soak` green (2 gates: the existing boundary gate + the new FLIP-04 gate). Engine isolation preserved (no `planck` import outside `planck-world.ts`).

## Task Commits

1. **Task 1: extend soak into a flipper-primary two-flipper peak-omega gate** - `1c1fa20` (feat) — `src/harness/soak.ts`, `src/harness/containment.ts`
2. **Task 2: FLIP-04 seeded green gate + sub-stepping teeth control** - `dff6e62` (test) — `src/harness/flipper-tunnel.gate.test.ts`, `src/harness/flipper-tunnel.test.ts`
3. **Task 3: feel proofs — tip-vs-base v=omega*r + jitter-free heavy cradle** - `bf75a24` (test) — `src/harness/flipper-feel.test.ts`

## Files Created/Modified
- `src/harness/soak.ts` - `SoakConfig.subStepping` + adapter passthrough; `runCase` checks all flippers (pre-angle copy-out per bat) and records the tripped flipper; call sites pass `tipRadius`.
- `src/harness/containment.ts` - `flipperSweptTunnel` 6th param `halfWidth`->`tipRadius` (same-arity in-place rename), `clearance = radius + tipRadius`, doc updated.
- `src/harness/flipper-tunnel.gate.test.ts` - NEW FLIP-04 green gate (`*.gate.test.ts`, npm run soak): dense seeded peak-omega flipper-primary sweep, CCD + sub-stepping ON, >=600s floor, env-tunable, non-vacuous `casesRun`.
- `src/harness/flipper-tunnel.test.ts` - NEW (npm test): bounded green + sub-stepping teeth isolation (CCD off in both arms) + deterministic replay.
- `src/harness/flipper-feel.test.ts` - NEW (npm test): tip-vs-base v=omega*r launch + jitter-free heavy cradle, driven through the interface + FixedStepLoop, with proof-of-teeth.

## Peak-omega / seed used (the teeth control)
- **Green FLIP-04 gate:** peak omega = FLIPPER_UP_SPEED (30 rad/s, N=2), maxLaunchSpeed 105 m/s, seed `0x5eed`, 210 cases x 3s = 630s simulated, CCD + sub-stepping ON -> `passed===true`.
- **Sub-stepping teeth control:** peak omega = 30 rad/s (N=2), maxLaunchSpeed **96 m/s** (the tunnel onset), seed `0xf11`, 32 cases, CCD OFF (bullet:false) in both arms. subStepping ON -> 0 flipper tunnels (green); subStepping OFF -> 3 flipper tunnels (RED). First RED case seed `524254362` at step 2; deterministic replay reproduces byte-identical ball + flipper state.

## Decisions Made
- **Sub-stepping teeth isolation (the material deviation, below).** A `bullet:true` teeth control is vacuous here, so sub-stepping is isolated with CCD off in both arms.
- **FLIP-02 raise direction.** The `-1` raise gives the correct v=omega*r scaling; the `+1`/up sign droops down-slope and gravity inverts it. The ratio is omega-independent so the geometry claim holds regardless.
- **Same-arity rename** keeps `containment.test.ts` green unedited (not in files_modified).
- **Green gate isolates the flipper** (boundary containment proven separately by `soak.gate.test.ts`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug: plan premise physically incorrect] Sub-stepping teeth control isolated with CCD off in both arms, not bullet:true**
- **Found during:** Task 2 calibration
- **Issue:** The plan's acceptance criterion required the teeth control to use `subStepping:false` with `bullet` LEFT TRUE ("NOT a CCD-off control"). Calibration proved this is VACUOUS in this rig: `flipperSweptTunnel` only registers a pass-through for a ball moving faster than ~96 m/s (its chord must span both sides of the radius+tipRadius band), and Planck's translational CCD (`bullet:true`) catches EVERY such ball regardless of sub-stepping — measured 0 flipper tunnels at `bullet:true` for all speeds 60-160 m/s with subStepping ON *and* OFF. A direct rotational scenario (near-stationary ball, bat driven at peak omega) never trips either, because at omega=30 the bat tip travels only 0.125 m/step and physically cannot skip the 0.2 m ball. So a `bullet:true` teeth control would be a false green (it would prove CCD, not the D-01 sub-stepping mechanism the gate exists to validate — exactly threat T-02-10).
- **Fix:** Isolated sub-stepping by holding CCD OFF (`bullet:false`) in BOTH arms of the control at the tunnel onset (96 m/s): subStepping ON -> 0 flipper tunnels (green), OFF -> 3 (red, replayable). With CCD off in both arms the SOLE differentiator is sub-stepping, so this proves the mechanism has teeth MORE strictly than the plan's design (it shows sub-stepping ALONE, without CCD's help, holds the property). The test also asserts `bullet:true + subStepping:false` stays green, documenting exactly why CCD must be off to see the mechanism. The plan explicitly delegated this: "If the executor finds peak feel omega does not reliably tunnel with sub-stepping OFF, ... document it (the point is to prove the mechanism has teeth)." Raising omega was not an option (the interface caps drive omega at FLIPPER_UP_SPEED=30, and even at the N-cap omega=96 the bat cannot skip the ball, and CCD still masks it).
- **Files modified:** src/harness/flipper-tunnel.test.ts (header + isolation test document the reasoning at length)
- **Verification:** `npm test` green (subStepping ON asserted green, OFF asserted RED with replay); `npm run soak` green.
- **Committed in:** `dff6e62`

**2. [Rule 1 - Bug: gravity-confounded strike direction] FLIP-02 raises the bat with the -1 sign, not the +1/FLIPPER_UP_SPEED sign**
- **Found during:** Task 3 calibration
- **Issue:** The behavior spec says "a flip at FLIPPER_UP_SPEED". In this rig's FSM convention `+1`/"up" sweeps the bat toward the +pi/8 limit, which is geometrically DOWN-slope, so a `+1` "flip" drops the bat into a falling ball; gravity confounds the strike and the launch does NOT scale with contact radius — a base hit out-launched a tip hit (ratio 0.55 vs the 3.0 radius ratio, the WRONG direction), with jam bursts (omega spiking to 60) from parking at a limit.
- **Fix:** Raise the bat with the `-1` sign (the resting-ball side sweeps UP), a clean jam-free strike giving the correct v=omega*r (tip 7.7 vs base 2.9, ratio 2.62 vs 3.0). The tip/base RATIO is omega-independent, so the FLIP-02 geometry claim is unaffected by which motor speed drives the raise. Documented in the test header; the `+1`/`-1` "up"/"down" naming quirk originates in the 02-02 controller and is out of scope for this proof plan.
- **Files modified:** src/harness/flipper-feel.test.ts (header + inline comments)
- **Verification:** `npx vitest run src/harness/flipper-feel.test.ts` green (3/3).
- **Committed in:** `bf75a24`

**Total deviations:** 2 auto-fixed, both correcting physically-incorrect plan premises while preserving the plan's intent (prove the sub-stepping mechanism has teeth; prove the v=omega*r geometry). No product behavior was weakened and no ON-gate was loosened to pass; the changes are confined to test construction. `.planning/config.json` left untouched.

## Authentication Gates
None.

## Issues Encountered
- **CCD masks sub-stepping on this check (root cause of deviation 1).** `flipperSweptTunnel` is fundamentally a fast-ball (>~96 m/s) translational-pass-through detector, and translational CCD (`bullet`) is the lever that flips its outcome — sub-stepping's contribution is only visible with CCD off. Documented at length in `flipper-tunnel.test.ts` so a future reader does not "fix" the teeth control back to `bullet:true` and re-introduce a false green.
- **Box2D motor+limit jam (carried over from 02-01).** Parking a bat at a joint limit then reversing produces a non-physical omega burst; the feel proofs avoid it by only driving AWAY from a held limit (the `-1` raise after a `+1` droop-hold is jam-free).
- **Thin interior wall in the drop column.** The cradle drop had to be placed BELOW the y=2.0 thin wall (which spans x in [0.2,0.8], over the flipper) or the ball rests on the wall instead of the flipper.

## Known Stubs
None. This plan is seeded/deterministic headless proof code on in-memory physics state; no placeholder data flows to any UI, and no feature was deferred behind a stub.

## Threat Flags
None. No new network endpoints, auth paths, file access, or trust-boundary schema — offline seeded test code on in-memory state. The teeth control directly discharges T-02-10 (false-green FLIP-04 gate) and T-02-11 (feel detectors that never fire); the mulberry32 PRNG remains deterministic-by-design and non-cryptographic (T-02-12, accept).

## Next Phase Readiness
- The phase's two Core-Value properties are now regression-guarded proofs: FLIP-04 (green with CCD + sub-stepping ON across a dense peak-omega sweep; replayable RED when sub-stepping is forced off) and the feel verdict Phase 1 deferred (tip out-launches base per v=omega*r; caught ball cradles jitter-free with energy trending down).
- Phase 3 (table layout) inherits: `SoakConfig.subStepping` + the two-flipper swept gate, the tipRadius-aware clearance, and the feel-proof idioms. When real flipper placement lands, the FLIP-04 gate + feel proofs re-run against the new geometry unchanged (they read the interface).
- No interface, adapter, or constants change in this plan — pure harness/proof work; Phase 3 builds on it without rework.

---
*Phase: 02-flippers-feel*
*Completed: 2026-07-15*

## Self-Check: PASSED
- All modified/created files present (soak.ts, containment.ts, flipper-tunnel.gate.test.ts, flipper-tunnel.test.ts, flipper-feel.test.ts) + SUMMARY.md.
- All task commits present: `1c1fa20`, `dff6e62`, `bf75a24`.
- Full suite green (71/71); `npx eslint .` + `npx tsc --noEmit` clean; `npm run soak` green (2 gates); no `planck` import in the new test files.
