---
status: diagnosed
trigger: "shift-flipper-residual-stick: Hold ShiftLeft and ShiftRight together, release ShiftLeft first, then ShiftRight: both bats drop (Shift bindings behave as reliably as the arrow keys). (UAT 04 test 17, gap G-04-17)"
created: 2026-11-21T00:00:00Z
updated: 2026-11-21T00:50:00Z
audit_acknowledged:
  milestone: v1.0
  at: 2026-11-25
  status: diagnosed
---

## Current Focus

bug_class: Bohrbug at the app layer (deterministic for the both-Shift overlap event sequence); intermittent only because the trigger (two Shifts held at once) is player-dependent
known_pattern_candidate: "left-shift-sticky-keys-flipper-stuck — lost Shift keyup leaves a stale held code (same class, different OS trigger)"
hypothesis: "CONFIRMED (diagnosis only). Windows treats both Shifts as one VK_SHIFT. In a both-Shift hold the page gets (1) the second press as keydown repeat:true, which FlipperInput ignores, and (2) no keyup for the first release; the final keyup (other code, shiftKey false) cannot clear it because dropStaleShift skips Shift-key events"
test: done (live Chrome 157 / Win11 experiments A-F + replay through the real FlipperInput)
expecting: n/a
next_action: return ROOT CAUSE FOUND to the orchestrator
reasoning_checkpoint:
  hypothesis: "The bat sticks because Windows delivers a both-Shift hold to the page as D:P1, D:P2(repeat), U:R2(shiftKey false) with no keyup for the first release; FlipperInput ignores the repeat press and refuses to reconcile on Shift-key events, so when P1 is also released first, P1 stays in held after both Shifts are up"
  confirming_evidence:
    - "Live Chrome 157 on the user's Windows 11: A/B/D/E/F never deliver the first-released Shift's keyup; the second press is always repeat:true; the final keyup is shiftKey false; OS async state is correct throughout"
    - "Replaying the captured sequences through the real FlipperInput: A and F end heldL=true; the second-pressed bat never gets a press edge in A/B/D; a lone re-tap of the stuck Shift clears it (matches 'can be quickly released')"
    - "Independent precedent: ThinLinc bug 7416 verified the identical page-level sequence in Chrome 78 / Win10; noVNC master ships a Windows-gated drop-both-Shifts-on-Shift-keyup fix; GLFW/SDL/GTK poll VK_LSHIFT/VK_RSHIFT natively"
  falsification_test: "A physical-keyboard keylog on the user's machine showing a ShiftLeft keyup while ShiftRight is held, or a non-repeat keydown for the second Shift, would refute the OS mechanism for real keys. Cheap human check: hold Left Shift, then press Right Shift; 04-11 predicts the right bat does NOT rise"
  fix_rationale: "n/a (diagnose only). Direction: accept a repeat keydown for a Shift code that is not held while the other Shift is held (recovers the lost press), and on a Shift keyup with shiftKey false drop both Shift codes, gated to Windows (heals the lost release at the final keyup)"
  blind_spots: "Input was injected with SendInput (scancodes), not typed; the claim that physical keys behave the same rests on the shared win32k path plus the 2019 ThinLinc physical-key report. UAT test 16 reported the both-Shift cradle holding both bats, which conflicts with the repeat finding (likely a perception miss in a long checklist; unverified). Firefox/Edge on Windows not run. Linux/macOS shiftKey on a one-of-two Shift release not verified"
  candidate_causes:
    - "environment: Windows posts both Shifts as one VK_SHIFT (second press flagged repeat, first release unposted)"
    - "code: FlipperInput ignores every repeat keydown and excludes Shift-key events from shiftKey reconciliation (04-11 design, test B6 pins it)"
    - "config/design: both Shifts are default bindings on opposite sides (D-09 both-Shift cradle), so the OS merge lands on two different bats"
  and_gate: "yes. Needs the Windows VK_SHIFT merge (environment) AND an input layer that drops repeat presses and will not reconcile on Shift keyups (code). Arrow/Z/Slash pairs are distinct VKs and never merge; on the same OS the 04-11 tests pass for single Shifts"

## Symptoms

expected: Both bats drop. If the left bat stays raised after both Shifts are up (Windows emits no keyup for the first Shift released while both are held), it is the unhealed WR-02 residual and clears on the next non-Shift key press or a focus regain.
actual: User reported: "the shift keys are still a bit more buggy than the arrow keys - sometimes they get stuck but can be quickly released"
errors: None reported
reproduction: UAT test 17 (.planning/phases/04-reactive-elements-game-rules/04-UAT.md). Real Windows 11 keyboard, Chrome, npm run dev. Test 16 (all six bindings, taps, cradles, both-Shift cradle, Sticky Keys prompt, TILT while holding) PASSED in the same session. Residual is Shift-specific, intermittent, clears quickly (release trigger not stated).
started: Discovered during UAT after gap-closure plan 04-11 (fixed G-04-11). Code-review WR-02 predicted a Windows both-Shift no-keyup residual and left it unhealed.

## Eliminated

- hypothesis: Sticky Keys turned ON (OS latches Shift and withholds its keyup until the next non-modifier key)
  evidence: SPI_GETSTICKYKEYS STICKYKEYSON=0 (and HOTKEYACTIVE=0) now; test 16 in the same session passed every single-Shift tap after the prompt was answered No; Sticky Keys ON makes every Shift tap stick, not "sometimes"
  timestamp: 2026-11-21T00:25:00Z

- hypothesis: IME processing of Shift (CJK IME toggle on Shift tap) swallows or reorders Shift events
  evidence: input methods are en-GB / de-DE / en-US, all with the German layout 00000407; no IME installed
  timestamp: 2026-11-21T00:25:00Z

- hypothesis: a single Shift keyup can be lost outside the both-Shift case
  evidence: live C (LD LU) arrives paired with shiftKey false; test 16 single-Shift taps and cradles passed on the real keyboard
  timestamp: 2026-11-21T00:30:00Z

- hypothesis: WR-01 (stale-Shift heal + same-side press in one drain window) causes the report
  evidence: WR-01 drops a bat while its key is held (opposite symptom); it needs a stale Shift to heal first and does not create one. Still an open defect, coupled to the fix (see Resolution)
  timestamp: 2026-11-21T00:12:00Z

- hypothesis: Chromium's own repeat heuristic (same key code within 2 s) marks the second Shift press as repeat, so physical play with slower presses would not hit it
  evidence: live E: 2.6 s gap with no intervening events, second Shift still repeat:true; the flag is the OS previous-key-state of the shared VK_SHIFT
  timestamp: 2026-11-21T00:38:00Z

## Evidence

- timestamp: 2026-11-21T00:05:00Z
  checked: .planning/debug/knowledge-base.md; prior session left-shift-sticky-keys-flipper-stuck.md
  found: no knowledge base file (no resolved sessions). Prior session (diagnosed, G-04-11) established that a lost Shift keyup with no later blur leaves a stale code in FlipperInput.held that pins its whole side; 04-11 then added focus-regain clear + non-Shift-event shiftKey===false reconciliation
  implication: known-pattern candidate (same class: lost keyup -> stale held code), now on a path 04-11 explicitly excluded

- timestamp: 2026-11-21T00:08:00Z
  checked: src/input/flipper-input.ts (full, post-04-11), src/sandbox/main.ts onFixedStep + flipperGate, flipper-input.test.ts B6
  found: dropStaleShift returns early when e.code is ShiftLeft/ShiftRight ("Events of the Shift keys themselves never reconcile"). handleKeyUp(ShiftRight, shiftKey:false) deletes only ShiftRight. Test B6 pins this: ShiftLeft keyup with shiftKey false keeps a held ShiftRight. Heal exits for a stale Shift: any non-Shift key event with shiftKey===false, window focus, blur, hidden, or a re-tap of the stale Shift (keydown de-duped, its keyup deletes it). flipperGate.setEnabled(true) re-presses a stale side on every serve
  implication: if the browser never delivers a keyup for one Shift, the final Shift keyup (shiftKey false) cannot clear it by design; the bat stays up until one of the listed exits

- timestamp: 2026-11-21T00:12:00Z
  checked: 04-REVIEW.md WR-02 and WR-01; 04-REVIEW-DISPOSITION.md
  found: WR-02 (open) predicts exactly this path, cites GLFW win32 hack, proposes dropping the opposite Shift on a Shift keyup with shiftKey===false, and flags the Linux/Firefox counter-risk as unverified. WR-01 (open) is a separate defect: heal-release + same-side press in one drain window drops a bat while held (opposite symptom: bat falls, not sticks)
  implication: WR-02 is the leading hypothesis; WR-01 does not explain "stuck"

- timestamp: 2026-11-21T00:20:00Z
  checked: web research (GTK bug 751721, Irrlicht forum, SDL/GLFW/winit/Unity reports), noVNC master core/input/keyboard.js, ThinLinc bug 7416
  found: |
    OS-level Win32 behavior is widely documented: with both Shifts down, releasing the first posts NO WM_KEYUP (Spy++ shows none); the only keyup is for the second key released. GLFW/SDL/GTK poll GetKeyState/GetAsyncKeyState(VK_LSHIFT/VK_RSHIFT) to synthesize the missing release (native APIs, not available in a browser).
    ThinLinc bug 7416 (2019): verified in Chrome 78 / Windows 10 that physical "ShiftL down, ShiftR down, ShiftL up, ShiftR up" reaches the page as "ShiftL down, ShiftR down, ShiftR up" ("we don't get the Shift L up until Shift R has been released. We don't get any events from windows at all"). Same in Firefox and IE; only legacy EdgeHTML detected it.
    noVNC master keyboard.js _handleKeyUp still carries the in-page fix: if browser.isWindows() (navigator.platform /win/i) and the keyup code is ShiftLeft or ShiftRight, also release whichever Shift is still in its down list. Windows-gated, not shiftKey-gated.
  implication: the browser passes the OS quirk straight through to page JS; a mature browser keyboard layer heals it in-page at the final Shift keyup. The intermediate period (one Shift released, the other held) is invisible to page JS

- timestamp: 2026-11-21T00:25:00Z
  checked: local environment (read-only): Sticky Keys SPI_GETSTICKYKEYS + registry, Get-WinUserLanguageList, Chrome version
  found: |
    Sticky Keys dwFlags=26 (0x1A) live and persistent: STICKYKEYSON=0, HOTKEYACTIVE=0 (the 5x-Shift shortcut is now disabled; it was 0x1FE armed at the prior session). No CJK IME: en-GB, de-DE, en-US, all with the German QWERTZ layout 00000407. Chrome 157.0.8103.80.
  implication: Sticky Keys ON cannot explain test 17 (OFF now; test 16 passed every Shift tap with the prompt answered No; Sticky Keys ON would make EVERY Shift tap stick, not "sometimes"). No IME on the Shift path. Side note: KeyZ / Slash codes are labelled Y / - on this user's QWERTZ keyboard

- timestamp: 2026-11-21T00:30:00Z
  checked: LIVE experiment, Chrome 157 on this Windows 11 machine. Own --app logger page (scratch profile, scratchpad/shiftexp/log.html + drive.ps1), foreground verified before every injected event, SendInput scancode-only Shift events (LShift 0x2A, RShift 0x36), page logs keydown/keyup code / shiftKey / repeat / location; OS GetAsyncKeyState(VK_LSHIFT, VK_RSHIFT, VK_SHIFT) after each step
  found: |
    A  phys LD RD LU RU  -> page: D:ShiftLeft s1 r0, D:ShiftRight s1 r1, U:ShiftRight s0      (no ShiftLeft keyup)
    B  phys LD RD RU LU  -> page: D:ShiftLeft s1 r0, D:ShiftRight s1 r1, U:ShiftLeft s0       (no ShiftRight keyup)
    C  phys LD LU        -> page: D:ShiftLeft s1 r0, U:ShiftLeft s0                            (paired)
    D  phys RD LD LU RU  -> page: D:ShiftRight s1 r0, D:ShiftLeft s1 r1, U:ShiftRight s0      (no ShiftLeft keyup)
    OS async state was correct at every step (e.g. A after LU: L0 R1 S1), so Windows knows the per-side state; it just posts no message.
  implication: |
    H1 CONFIRMED live on the user's OS + browser: the first Shift released while both are held never reaches the page; the only keyup is the second-released code, with shiftKey false.
    NEW: the SECOND Shift pressed while the other is held arrives as keydown with repeat:true (Windows reports both Shifts as one VK_SHIFT, already down). FlipperInput.handleKeyDown ignores every repeat keydown, so the second-pressed Shift never enters held: its bat never rises in a both-Shift hold

- timestamp: 2026-11-21T00:38:00Z
  checked: LIVE experiment 2 (scratchpad/shiftexp/drive2.ps1), same setup
  found: |
    E  phys LD, wait 2600 ms (no events in between: injected keys do not auto-repeat), RD, LU, RU -> page: D:ShiftLeft s1 r0, D:ShiftRight s1 r1, U:ShiftRight s0
    F  phys LD RD LU LD LU RU (re-tap ShiftLeft while ShiftRight held) -> page: D:ShiftLeft s1 r0, D:ShiftRight s1 r1, D:ShiftLeft s1 r1, U:ShiftRight s0
  implication: |
    The repeat flag on the second Shift is not Chromium's < 2 s same-keycode repeat heuristic (2.6 s gap, still r1). It is the OS previous-key-state bit for the shared VK_SHIFT, which the same win32k key path sets for physical keys.
    While one Shift stays held, re-tapping the other yields only a repeat keydown and NO keyup: nothing the page receives in that window can show the released Shift is up

- timestamp: 2026-11-21T00:45:00Z
  checked: replay of the exact live page sequences through the REAL src/input/flipper-input.ts (node 26 type-stripping, scratchpad/shiftexp/replay.ts) and through a scratch copy with two candidate changes (accept a repeat keydown for a Shift code not yet held; on a Shift keyup with shiftKey false drop both Shift codes)
  found: |
    04-11 code:
      A (UAT 17 order)  D:Left[L+] D:Right(rep)[-] U:Right[-]          END heldL=true   <- right bat never rose, left bat stuck after both Shifts up
      B                 D:Left[L+] D:Right(rep)[-] U:Left[L-]          END clear        <- right bat never rose, no stick
      D                 D:Right[R+] D:Left(rep)[-] U:Right[R-]         END clear        <- left bat never rose, no stick
      F                 ... U:Right[-]                                 END heldL=true   <- stuck
      A + lone ShiftLeft re-tap: D:Left (de-duped) U:Left[L-] -> clears  <- the user's "can be quickly released"
      controls (single tap, same-code auto-repeat): unchanged, correct
    candidate copy: every sequence raises the second bat on its repeat-flagged press and ends with both sides clear (L-R- on the final Shift keyup); controls unchanged
  implication: |
    App-level mechanism reproduced deterministically from live-captured events. A stick happens only when the first-PRESSED Shift is also the first RELEASED (FIFO order), which is why it is "sometimes". The two candidate changes heal both faces; the window between the first and second physical release stays unhealable (no event exists)

## Resolution

root_cause: "Two conditions together (AND-gate). (1) Environment: Windows posts both Shift keys as one virtual key (VK_SHIFT). In a both-Shift hold the page receives the second press as a keydown with repeat:true, and gets no keyup at all for the first Shift released. The only keyup is the second-released code, with shiftKey false. Confirmed live in Chrome 157 on the user's Windows 11. (2) Code (src/input/flipper-input.ts): handleKeyDown ignores every repeat keydown, so the second-pressed Shift never enters held and its bat never rises. dropStaleShift returns early for ShiftLeft/ShiftRight events (04-11 design, test B6), so the final Shift keyup removes only its own code. When the first-pressed Shift is also released first, its code stays in held after both Shifts are up and pins that bat. It clears on a lone re-tap of that Shift, any non-Shift key (shiftKey false), a focus change, or never before a serve (flipperGate re-presses it). WR-02 described the release half; the press half (repeat:true) is new."
fix: "(not applied: goal find_root_cause_only). Direction: (a) in handleKeyDown, accept a repeat keydown for a Shift code that is not held while the other Shift is held (this is the Windows second press; a held Shift's own auto-repeat stays de-duped). (b) On a ShiftLeft/ShiftRight keyup with shiftKey === false, drop both Shift codes, gated to Windows (noVNC precedent; Linux shiftKey on a one-of-two release is unverified). Residual, not fixable in a browser: between the first and second physical Shift release the released bat stays up, because no event exists. Covered by the controls hint the user already chose (UAT 18 A). Fix WR-01 alongside, because (b) can put a release and a same-side press in one drain window."
verification: ""
files_changed: []
