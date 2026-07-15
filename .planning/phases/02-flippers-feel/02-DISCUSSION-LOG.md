# Phase 2: Flippers & Feel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-15
**Phase:** 2-Flippers & Feel
**Mode:** advisor (research-backed comparison tables; calibration tier = standard)
**Areas discussed:** Rotational anti-tunnel, Actuation & cradle, Contact geometry, Control scheme

---

## Rotational anti-tunnel (FLIP-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Adaptive sub-stepping + cap | Adaptive angular sub-stepping as the hard guarantee (N derived from live ω), with a small speed cap only to bound N. Zero feel cost, deterministic, adapter-only. Proof = extended soak gate + negative control. | ✓ |
| Tip-speed cap only | Clamp flipper angular velocity so per-step tip travel stays safe. Trivial, but caps snap (fights Core Value) and isn't a hard guarantee alone. | |
| Capsule thickness reliance | Lean on a thick/rounded bat so a swept gap can't clear the ball. Raises threshold, never a proof; better as a hardener. | |
| Manual swept TOI resolve | Custom segment/capsule-vs-circle TOI + impulse resolution. Strongest but CLAUDE.md's highest-risk custom-physics path; last-resort fallback. | |

**User's choice:** Adaptive sub-stepping + cap
**Notes:** Research confirmed Box2D/Planck TOI sweeps translation (ball `setBullet` handled) but "can miss rotational collisions" for a fast large rotation (Catto GDC 2013). N≈2 at ω=40. FLIP-04 gate = extend `soak.ts` with `flipperSweptTunnel` invariant at feel-tuned peak ω + a teeth-bearing negative control (sub-stepping OFF → RED).

---

## Actuation & cradle (FLIP-01 / FLIP-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Bang-bang, hold-into-limit | Motor-speed bang-bang; cradle = hard revolute-limit constraint. Extends existing setFlipperMotor(sign) hook. FSM in a new engine-agnostic FlipperController above the interface. | ✓ |
| PD / torque position control | Torque toward a target angle. Tunable ramp, but hold becomes a spring (sag/jitter) unless stiff, and leaks control policy into the adapter. | |
| Hybrid sweep-then-hold | Fast sweep then a separate hold mode. Mostly redundant (limit already holds); adopt later only if full-speed hold feels twitchy. | |

**User's choice:** Bang-bang, hold-into-limit
**Notes:** Only candidate delivering both sub-frame snap AND a rigid, jitter-free cradle from one mechanism. FSM lives above the interface (pure TS, unit-testable, D-05). Cradle jitter fixes recorded (keep asserting +1 during held-up; torque > tip gravity torque; flipper restitution 0; no angular damping on the bat).

---

## Contact geometry (FLIP-02 / FLIP-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-fixture capsule | Box core + tip circle (+ optional base circle). Rounded tip = no snag, clean catch, consistent contact radius, fat CCD target on the fastest point. Pivot unchanged; adds tipRadius to FlipperState. | ✓ |
| Thicker single box | One-constant bump to ~0.07m half-width. Fast, low-risk floor, but keeps 4 sharp corners. | |
| Tapered polygon + tip circle | Wide base → narrow rounded tip; faithful silhouette, whippy tip. More shape params to tune. | |
| Thin box (keep current) | Phase-1 stress shape. Ball rides a sliver, worst tunnel target — not for productized feel. | |

**User's choice:** Multi-fixture capsule
**Notes:** Planck 1.5 = Box2D 2.4 → no native capsule, polygon radius is CCD skin only; must compose fixtures. Ball is huge (0.2m) vs current 0.04m half-width. Concrete build: Box(0.18, 0.07, x=0.25) + Circle(0.07) at x≈0.43 + optional base Circle(0.07) at x≈0.07. `FlipperState` gains `tipRadius`.

---

## Control scheme (FLIP-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-binding set | Left = Z / ShiftLeft / ArrowLeft, Right = / / ShiftRight / ArrowRight. Keeps original Z + / for fidelity AND far-edge Shift keys for the both-flipper cradle. No keybind UI. | ✓ |
| Faithful only (Z + /) | Exact original defaults. Maximally faithful, but keys sit close together — awkward for the both-flipper cradle. | |
| Cabinet Shift only | Left = ShiftLeft, Right = ShiftRight. Ergonomically ideal, but departs from documented original defaults. | |

**User's choice:** Multi-binding set
**Notes:** Original defaults confirmed (Z / /, Space plunger, X/./Up nudge — reserved for later phases). Handling architecture is settled best-practice, not a fork: engine-agnostic `src/input/` module, held Set keyed on `event.code`, ignore `event.repeat`, `preventDefault`, force-release on blur/visibilitychange, latch edges onto the fixed step for sub-frame response.

---

## Claude's Discretion

- Feel-tuned values (`FLIPPER_UP_SPEED`, `FLIPPER_RETURN_SPEED`, re-tuned `FLIPPER_MAX_MOTOR_TORQUE`, angle limits, capsule dimensions, secondary speed-cap sized so N ≤ ~4).
- Empirical safe tip-speed ceiling (optional soak calibration sweep).
- Test-rig placement of the two flippers, the ball-feed mechanism, module/file naming, inclusion of the base-end rounding circle.
- FSM implementation details and input-latching mechanics, provided the observable state sequence and the engine-agnostic interface contract hold.

## Deferred Ideas

None — discussion stayed within phase scope. (Manual swept-TOI resolver is an in-phase fallback, not a deferral; real flipper placement is Phase 3; slingshots/kickers Phase 4; flipper sound/rendering Phase 5; sweep-then-hold hold-mode is an in-phase playtest option.)
