---
status: diagnosed
trigger: "left-shift-sticky-keys-flipper-stuck: Each bat snaps up the instant its key goes down and starts falling the instant it comes up, on all six bindings. No tap leaves a bat hanging raised. (UAT 04 test 11, gap G-04-11)"
created: 2026-11-20T22:00:00Z
updated: 2026-11-20T22:57:00Z
audit_acknowledged:
  milestone: v1.0
  at: 2026-11-25
  status: diagnosed
---

## Current Focus

bug_class: Bohrbug at the app layer (deterministic for a given event sequence: S2/S3 reproduce 100%). The OS trigger is environment-dependent.
hypothesis: CONFIRMED (diagnosis only). A Shift keydown whose keyup the page never receives, with no later blur, leaves a stale code in FlipperInput.held. Nothing reconciles that set, so the side stays held, pinning the bat up and masking that side's other bindings.
test: done (headless S1-S7 event-order experiment)
expecting: n/a
next_action: return ROOT CAUSE FOUND to the orchestrator. Fix direction and the Shift-binding design question go to plan-phase --gaps.
reasoning_checkpoint:
  hypothesis: "The bat hangs raised because FlipperInput.held keeps ShiftLeft after its keyup is lost (Sticky Keys ON withholds it, or a keydown lands after the dialog's blur), and nothing re-checks held, so the left side stays held"
  confirming_evidence:
    - "S2/S3 headless: a keydown with no keyup leaves held-up offRest 0.820 rad for >= 2 s; Z/ArrowLeft taps do not release it; only a ShiftLeft keyup does"
    - "S1/S4/S5/S7: with paired events, blur, or repeat, the bat always returns. Matches UAT: arrows (never hit by Sticky Keys) were not reported faulty"
    - "No shiftKey/getModifierState/focus-regain handling anywhere in src"
  falsification_test: "A DevTools keylog during the real 5x-Shift prompt showing keyup for every ShiftLeft keydown, or blur after the last keydown, while the bat still hangs raised, would refute this and point to the FSM/physics"
  fix_rationale: "n/a (diagnose only). Direction: reconcile or clear held on focus regain, and decide on the Shift default binding (no JS check can see a Sticky-Keys-latched Shift as up)"
  blind_spots: "The real Sticky Keys dialog was not reproduced (synthetic events cannot open it; injecting OS input into the user's desktop was not done). Unknown whether the user saw the bat hanging raised (Sticky Keys turned ON, or the race) or the game going deaf while the dialog held focus (blur already drops the bat). Live-page blur wiring not exercised: browser tools unavailable in this agent"
  candidate_causes:
    - "environment: Windows Sticky Keys hotkey/prompt (focus steal) and Sticky Keys ON (keyup withheld)"
    - "code: FlipperInput held set never re-checked; per-side OR latch amplifies one stale code; gate re-press on serve keeps it"
    - "config/design: Shift (a modifier owned by an OS accessibility hotkey) is a default flipper binding (02-CONTEXT D-09, index.html)"
  and_gate: "yes. Needs a lost keyup without a later blur (environment) AND an input layer with no way to re-check its state (code). Either alone does not strand the bat (S1/S4/S5 pass; arrows pass UAT)"

## Symptoms

expected: On each of Z, Left Shift, Left Arrow, /, Right Shift, Right Arrow, each bat snaps up the instant its key goes down and starts falling the instant it comes up, even after a multi-second cradle. No tap leaves a bat hanging raised. On TILT the held bat drops at once.
actual: User reported, verbatim: "i was only able to test the flippers with the arrow keys. i noticed that the shift key is not working properly since the left shift is activating sticky keys after many clicks and the flipper gets stuck." Arrow keys not reported faulty. Z, / and Right Shift not tested. Platform Windows 11 (Shift x5 opens the OS Sticky Keys prompt, a system dialog that takes focus from the browser).
errors: None reported
reproduction: UAT test 11 (.planning/phases/04-reactive-elements-game-rules/04-UAT.md). npm run dev, press Enter, tap Left Shift 5+ times quickly on Windows.
started: Discovered during UAT re-test after gap-closure plan 04-09 (G-04-10 resolved). Arrow-key flipping now behaves correctly.

## Eliminated

## Evidence

- timestamp: 2026-11-20T22:00:00Z
  checked: .planning/debug/knowledge-base.md
  found: does not exist (no prior resolved sessions); MemPalace not queried (no KB entries to match)
  implication: no known-pattern candidate

- timestamp: 2026-11-20T22:01:00Z
  checked: src/input/flipper-input.ts (full)
  found: keys on event.code (ShiftLeft/ShiftRight distinct); ignores event.repeat; de-dupes held codes; attach() wires window keydown/keyup, window blur, document visibilitychange; handleBlur/handleVisibilityChange(hidden) call forceClear() which latches a release for each held side and clears the held set
  implication: Hypothesis A as literally stated (no blur handling, no repeat de-dupe) is REFUTED at the code level; the remaining question is whether blur actually fires / fires in the right order for the Sticky Keys case, and what happens after focus returns

- timestamp: 2026-11-20T22:10:00Z
  checked: src/control/flipper-controller.ts (full) and src/sandbox/main.ts onFixedStep wiring
  found: FSM is key-agnostic (sides only). onFixedStep drains the latch and applies press before release for a side, then update(). flipperGate.setEnabled(true) re-presses any side input.isHeld() reports (every serve). Nothing reconciles the held set against the real key state except keyup/blur/visibilitychange
  implication: a stale code in FlipperInput.held keeps its side up indefinitely and also re-raises the bat on every serve

- timestamp: 2026-11-20T22:15:00Z
  checked: Windows Sticky Keys state on this machine (reg HKCU\Control Panel\Accessibility\StickyKeys Flags; SystemParametersInfo SPI_GETSTICKYKEYS)
  found: Flags=510 (0x1FE) both persistent and live: STICKYKEYSON=0, HOTKEYACTIVE=1, CONFIRMHOTKEY=1, TWOKEYSOFF(0x100)=1
  implication: Sticky Keys is OFF now; the 5x-Shift hotkey with confirmation dialog is armed. Cannot tell whether it was ON transiently during UAT (TWOKEYSOFF turns it off as soon as Shift is pressed together with another key, which happens in play)

- timestamp: 2026-11-20T22:50:00Z
  checked: scratch vitest experiment (scratchpad/exp/sticky.exp.test.ts) driving the REAL FlipperInput + FlipperController + PlanckWorld + FixedStepLoop in main.ts onFixedStep order, with synthetic event orders
  found: |
    S1 keydown ShiftLeft -> blur (keyup lost): bat drops to resting (offRest 0.008). Blur path works.
    S2 blur -> late keydown ShiftLeft (keyup lost): left bat held-up (offRest 0.820) for 2 s and beyond; tapping Z and ArrowLeft does NOT release it (heldL stays true, side OR latch); a ShiftLeft keydown is de-duped; only a ShiftLeft keyup releases it. Mirrors on the right (ShiftRight).
    S3 Sticky Keys ON model (OS withholds Shift keyup until next non-modifier key): bat held-up until the keyup finally arrives; ArrowLeft tap alone does not release it.
    S4 down+up in one drain window: resting. S5 7 rapid normal taps: resting. S7 repeat=true keydown on focus return: ignored.
  implication: input/FSM are correct for paired keydown/keyup. The ONLY way a bat hangs raised is a keydown the page processed whose keyup it never receives, with no later blur/hidden. Then the stale code pins the whole side (other bindings cannot release it) and is re-pressed on every serve

- timestamp: 2026-11-20T22:55:00Z
  checked: grep src for shiftKey / getModifierState / window focus / pagehide handling; 02-CONTEXT.md D-09 binding rationale; index.html controls list
  found: none of them are used anywhere. Shift bindings were chosen in 02-CONTEXT D-09 for the both-flipper cradle ergonomics; index.html advertises Left Shift / Right Shift
  implication: no second source of truth can correct a stale held Shift; Shift as a default binding is a recorded design decision, not an accident

- timestamp: 2026-11-20T22:56:00Z
  checked: live-page confirmation via claude-in-chrome
  found: browser tools were not available in this agent context; live check not run
  implication: the real window blur wiring is covered only by code reading (attach() registers window blur) plus the headless S1 result

## Resolution

root_cause: "Two conditions together (AND-gate). (1) Environment: the Windows Sticky Keys feature can swallow a Shift keyup that the page never receives, with no blur after it. This happens when Sticky Keys gets switched ON from the 5x-Shift prompt; the dialog's default button can be triggered by keys the game itself uses (Enter = Start, Space = Launch). Once ON, the OS holds Shift logically down and withholds its keyup until the next non-modifier key. A rarer case is a keydown handled after the dialog's blur, whose keyup then goes to the dialog. (2) Code: FlipperInput (src/input/flipper-input.ts) builds the held set only from keydown/keyup pairs, plus a force-clear on blur or a hidden tab. It never re-checks that set later (no window focus-regain clear, no shiftKey/getModifierState check). The side is held if ANY of its codes is down, so a single stale ShiftLeft keeps the whole left side held: Z and ArrowLeft cannot release it, a new ShiftLeft keydown is de-duped, and flipperGate.setEnabled(true) re-raises the bat on every serve. Hypothesis A as stated is refuted: blur/visibilitychange handlers and the repeat de-dupe exist and work (S1, S7), and the dialog's focus steal on its own drops the bat. Hypothesis B is refuted on event.key (the code uses event.code). Its side-latch part is confirmed, as an amplifier."
fix: "(not applied: goal find_root_cause_only)"
verification: ""
files_changed: []
