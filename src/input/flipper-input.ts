/**
 * Engine-agnostic keyboard input for the two flippers — the FIRST keyboard/DOM
 * handling in the codebase (D-10). It imports NO physics engine (`planck`) and
 * does ZERO per-frame / per-event / per-drain allocation: the held `Set`, the
 * edge latch, and the drained view are all constructed ONCE in the constructor
 * and mutated in place thereafter (mirrors the `drainEvents` reused-view + reset
 * shape in `src/physics/planck-world.ts`).
 *
 * Design (D-09/D-10):
 *  - Keys on `event.code` (physical, layout-independent — the ONLY way to tell
 *    `ShiftLeft` from `ShiftRight`, which `event.key` collapses to `"Shift"`).
 *  - Each side is HELD iff ANY of its bound codes is down (per-side OR); it
 *    RELEASES only when ALL of its codes are up.
 *  - `event.repeat === true` keydowns are ignored (OS auto-repeat never
 *    re-triggers a flip), except the Windows second Shift press below; an
 *    already-held code is de-duped (no duplicate press).
 *  - `preventDefault()` fires on BOUND codes only (`/` = Firefox quick-find,
 *    arrows = page scroll) — reserved keys (Space plunger; X/./ArrowUp nudge) are
 *    never swallowed (threat T-02-03).
 *  - Press/release edges latch immediately and are drained by the consumer at the
 *    top of each fixed step; on window `blur`, `document` `visibilitychange`
 *    (hidden) and window `focus` regain the held set is force-cleared and release
 *    edges are emitted so a tab-blur, or a keyup an OS dialog took while the page
 *    was blurred, can never strand a key "down" (threats T-02-03, T-04-27).
 *  - Modifier reconciliation (G-04-11): any later NON-Shift key event whose
 *    `shiftKey` is strictly `false` drops a held `ShiftLeft`/`ShiftRight`. The
 *    OS's modifier state then proves no Shift is down, so a held Shift is a
 *    stale code whose keyup the OS took. Only a strict `false` counts: an
 *    event without the field (unknown state) never reconciles. A Shift key's
 *    own keyup reconciles only with `windowsShiftHeal` on (below): platforms
 *    differ in how they report the REMAINING Shift on one Shift's keyup, and
 *    off Windows the D-09 both-Shift cradle must never lose a held bat to
 *    that. A Shift keydown never reconciles (G-04-21): a keydown reporting
 *    Shift up proves nothing about the other Shift. Edges come from each
 *    event's NET per-side transition, so dropping a stale Shift and adding the
 *    new key in one event (Z over a stale ShiftLeft) is edge-free: the bat does
 *    not drop under the player's finger. Residual: with Windows Sticky Keys
 *    turned ON, the OS keeps Shift logically down, reports `shiftKey` true and
 *    withholds the keyup until the next non-modifier key, so no browser check
 *    can release it earlier. Shift stays a default binding (UAT 18, decision
 *    A); the bindings are unchanged.
 *  - Windows both-Shift merge (G-04-17): Windows posts both Shift keys as ONE
 *    virtual key, VK_SHIFT. The second Shift pressed while the other is held
 *    arrives as a keydown flagged `repeat` (the OS previous-state bit of the
 *    shared key), and the first Shift released while both are held sends NO
 *    keyup; only the final release fires, reporting `shiftKey` false. Two
 *    heals: (1) a repeat keydown for a Shift code that is not held while the
 *    other Shift is held counts as a press. G-04-21 extends it past a
 *    force-clear: the other Shift code also counts as a press once the Shift
 *    held across the clear has sent an ignored auto-repeat, a marker tracked
 *    until the next force-clear or a Shift keyup reporting Shift up; (2) a
 *    ShiftLeft/ShiftRight KEYUP (keyups only) reporting `shiftKey` strictly
 *    false drops BOTH Shift codes, because on Windows such a keyup only
 *    arrives once VK_SHIFT is fully up. Both are
 *    gated to Windows: noVNC ships the same Windows-gated drop-both heal, and
 *    Linux `shiftKey` on a one-of-two Shift release is unverified. The gate is
 *    injected, never read here: main.ts passes `isWindowsPlatform(navigator)`
 *    as `windowsShiftHeal`, and the default is off so tests pick a path
 *    explicitly. Residual: on Windows, a bat whose Shift is released while the
 *    other Shift is still held stays up until the other Shift is released,
 *    because the browser receives no event in between. After a force-clear, a
 *    second Shift pressed before the held Shift's first OS auto-repeat (the
 *    typematic delay, about 500 ms) is still missed, because no event before
 *    that repeat tells the page a Shift is down.
 *
 * All edge logic lives in the directly-callable `handle*` methods so unit tests
 * drive synthetic events with no real DOM; `attach()`/`detach()` only wire those
 * handlers to the real `window`/`document` in the browser (`main.ts`, plan 02-03).
 */

/** The two controllable flipper sides. */
export type FlipperSide = "left" | "right";

/**
 * The minimal shape the handlers need from a `KeyboardEvent`. Accepting this
 * (rather than the DOM `KeyboardEvent`) lets tests feed plain synthetic objects
 * with no browser globals; a real `KeyboardEvent` is structurally assignable.
 */
export interface KeyEventLike {
  readonly code: string;
  readonly repeat: boolean;
  /**
   * Whether the OS reports a Shift key down for this event. A real
   * `KeyboardEvent` always carries it. Synthetic events may omit it, and an
   * omitted value means the modifier state is unknown, so no reconciliation
   * happens. Optional so every existing synthetic event and the GameInput /
   * PlungerInput signatures stay valid under `exactOptionalPropertyTypes`.
   */
  readonly shiftKey?: boolean;
  /**
   * The event's time stamp in ms. A real `KeyboardEvent` always carries it (a
   * `DOMHighResTimeStamp`). It is read only to tell a fresh Windows Shift
   * re-press from OS auto-repeat (G-04-21 cradle). Synthetic events may omit
   * it. An omitted or non-finite value means the time is unknown, so the event
   * never counts as a timed re-press, and an ignored Shift repeat without it
   * clears the timing reference. Optional so every existing synthetic event and
   * the GameInput / PlungerInput signatures stay valid under
   * `exactOptionalPropertyTypes`.
   */
  readonly timeStamp?: number;
  preventDefault(): void;
}

/**
 * Latched per-side press/release edges for one drain window (read-only view).
 * Consumers apply a side's press BEFORE its release. A side carries both only
 * when it is not held at drain time (a tap inside one window). When it is held,
 * drainEdges drops a same-window release, because the window's last edge was a
 * press (WR-01).
 */
export interface InputEdges {
  readonly leftPress: boolean;
  readonly leftRelease: boolean;
  readonly rightPress: boolean;
  readonly rightRelease: boolean;
}

/** Construction options for {@link FlipperInput}. */
export interface FlipperInputOptions {
  /**
   * Heal the Windows both-Shift merge (G-04-17): accept the second Shift press
   * that Windows flags as a repeat, also after a force-clear once the held
   * Shift has auto-repeated (G-04-21), and drop both Shift codes on a Shift
   * keyup (never a keydown) reporting `shiftKey` false. Defaults to off.
   * main.ts passes `isWindowsPlatform(navigator)`; tests choose a path
   * explicitly.
   */
  readonly windowsShiftHeal?: boolean;
}

/**
 * The platform fields {@link isWindowsPlatform} reads. A real `Navigator` is
 * structurally assignable (lib.dom has no `userAgentData`, so it is optional).
 */
export interface PlatformLike {
  readonly platform?: string;
  readonly userAgentData?: { readonly platform?: string };
}

/**
 * Whether the browser runs on Windows: matches `"Win32"` (`navigator.platform`)
 * and `"Windows"` (`navigator.userAgentData.platform`, Chromium). A non-empty
 * `userAgentData.platform` wins; an empty or missing one falls back to
 * `platform`. Called once at boot by main.ts to set
 * {@link FlipperInputOptions.windowsShiftHeal}; FlipperInput itself never reads
 * a global (Node >= 21 exposes a `navigator` that follows the test host).
 */
export function isWindowsPlatform(nav: PlatformLike | undefined): boolean {
  const uaPlatform = nav?.userAgentData?.platform;
  const name =
    typeof uaPlatform === "string" && uaPlatform !== "" ? uaPlatform : (nav?.platform ?? "");
  return name.toLowerCase().startsWith("win");
}

/** Internal mutable twin of {@link InputEdges}. */
interface MutableEdges {
  leftPress: boolean;
  leftRelease: boolean;
  rightPress: boolean;
  rightRelease: boolean;
}

/**
 * Static `event.code -> side` map from the D-09 multi-binding set. Built ONCE at
 * module load (never per instance/event). The classic `Z` + `/` bindings are kept;
 * the far-edge Shift keys support the constant both-flipper cradle.
 */
const CODE_TO_SIDE: ReadonlyMap<string, FlipperSide> = new Map<string, FlipperSide>([
  ["KeyZ", "left"],
  ["ShiftLeft", "left"],
  ["ArrowLeft", "left"],
  ["Slash", "right"],
  ["ShiftRight", "right"],
  ["ArrowRight", "right"],
]);

/** The two Shift codes, named once for the stale-Shift reconciliation. */
const SHIFT_LEFT = "ShiftLeft";
const SHIFT_RIGHT = "ShiftRight";

/**
 * The gap in ms after the last ignored Shift auto-repeat beyond which a
 * repeat-flagged keydown of that same Shift is a fresh press (G-04-21 cradle).
 * Windows repeats at about 2.5 (KeyboardSpeed 0) to about 30 (KeyboardSpeed 31)
 * keydowns per second (SPI_GETKEYBOARDSPEED), so the slowest nominal interval
 * is about 400 ms and a steady stream never leaves a gap above 450 ms. The
 * typematic delay is about 250 ms to 1 s (KeyboardDelay 0-3,
 * SPI_GETKEYBOARDDELAY), 500 ms by default, so a re-press missed under the gap
 * is still taken on its own first auto-repeat at the default and longer
 * delays. Microsoft notes real rates may deviate up to 20% from a linear
 * scale; at the slowest setting that can only turn a physically held Shift's
 * repeat into a press.
 */
export const SHIFT_REPEAT_GAP_MS = 450;

/** The bound codes for each side (for the per-side OR held test), built once. */
const SIDE_CODES: Readonly<Record<FlipperSide, readonly string[]>> = {
  left: ["KeyZ", "ShiftLeft", "ArrowLeft"],
  right: ["Slash", "ShiftRight", "ArrowRight"],
};

function resetEdges(edges: MutableEdges): void {
  edges.leftPress = false;
  edges.leftRelease = false;
  edges.rightPress = false;
  edges.rightRelease = false;
}

export class FlipperInput {
  /** Windows both-Shift heal switch (G-04-17), fixed at construction. */
  private readonly windowsShiftHeal: boolean;

  /** Long-lived set of currently-down bound `event.code`s (never re-created). */
  private readonly held = new Set<string>();

  /**
   * The Shift code of the most recent ignored Shift auto-repeat since the last
   * force-clear (heal only). Windows flags the held Shift's typematic repeat as
   * a repeat, so this marker proves that Shift is physically down even when the
   * clear removed it from `held` (G-04-21). Reset by forceClear and by a Shift
   * keyup reporting Shift up. Holds only the module constants or null.
   */
  private repeatingShift: typeof SHIFT_LEFT | typeof SHIFT_RIGHT | null = null;

  /**
   * The timeStamp of the ignored Shift auto-repeat that last set
   * `repeatingShift`, or null when that repeat had no finite timeStamp. Written
   * only together with the marker, so it always belongs to the code the marker
   * names (G-04-21 cradle). A number primitive: never allocates.
   */
  private lastShiftRepeatAt: number | null = null;

  /** The latch handlers write into; copied out and reset on every drain. */
  private readonly pending: MutableEdges = {
    leftPress: false,
    leftRelease: false,
    rightPress: false,
    rightRelease: false,
  };

  /** The reused output view returned by `drainEdges()` (never re-allocated). */
  private readonly view: MutableEdges = {
    leftPress: false,
    leftRelease: false,
    rightPress: false,
    rightRelease: false,
  };

  // Bound handler refs so attach()/detach() add and remove the SAME functions
  // (created once — no per-attach allocation).
  private readonly onWindowKeyDown = (e: KeyboardEvent): void => this.handleKeyDown(e);
  private readonly onWindowKeyUp = (e: KeyboardEvent): void => this.handleKeyUp(e);
  private readonly onWindowBlur = (): void => this.handleBlur();
  private readonly onWindowFocus = (): void => this.handleFocus();
  private readonly onVisibilityChange = (): void =>
    this.handleVisibilityChange(document.hidden);

  constructor(options: FlipperInputOptions = {}) {
    this.windowsShiftHeal = options.windowsShiftHeal === true;
  }

  /**
   * Genuine keydown. Drops a stale Shift first (every event, repeat or unbound
   * included, carries valid modifier state), then ignores OS auto-repeat,
   * `preventDefault`s bound codes only, adds the code (the Set de-dupes) and
   * latches the NET per-side transition: a press when a side goes not-held ->
   * held, a release when a stale-Shift drop left it fully up.
   */
  handleKeyDown(e: KeyEventLike): void {
    const leftBefore = this.isSideHeld("left");
    const rightBefore = this.isSideHeld("right");
    this.dropStaleShift(e, false);
    if (e.repeat && !this.isSecondShiftPress(e.code, e.timeStamp)) {
      // auto-repeat suppression: never re-triggers a flip, never preventDefaults
      if (this.windowsShiftHeal && (e.code === SHIFT_LEFT || e.code === SHIFT_RIGHT)) {
        // G-04-21: remember which Shift is auto-repeating (physically down), and
        // when (G-04-21 cradle); an untimed repeat clears the time reference.
        this.repeatingShift = e.code === SHIFT_LEFT ? SHIFT_LEFT : SHIFT_RIGHT;
        const t = e.timeStamp;
        this.lastShiftRepeatAt = typeof t === "number" && Number.isFinite(t) ? t : null;
      }
      this.commitTransitions(leftBefore, rightBefore);
      return;
    }
    if (!CODE_TO_SIDE.has(e.code)) {
      // unbound/reserved code: no preventDefault, no held-set change
      this.commitTransitions(leftBefore, rightBefore);
      return;
    }
    e.preventDefault(); // bound codes only (Firefox quick-find, arrow scroll)
    this.held.add(e.code); // de-dupe: an already-held code is a no-op
    this.commitTransitions(leftBefore, rightBefore);
  }

  /**
   * Keyup. Drops a stale Shift, removes the code if it is bound, and latches the
   * NET per-side transition: a RELEASE only when a side becomes fully up (ALL of
   * its codes released). A keyup for a code that was never tracked (e.g. its
   * keydown was an ignored auto-repeat) emits no phantom edge.
   */
  handleKeyUp(e: KeyEventLike): void {
    const leftBefore = this.isSideHeld("left");
    const rightBefore = this.isSideHeld("right");
    this.dropStaleShift(e, true);
    if (CODE_TO_SIDE.has(e.code)) this.held.delete(e.code);
    this.commitTransitions(leftBefore, rightBefore);
  }

  /** Window blur: force-clear and emit release for every still-held side. */
  handleBlur(): void {
    this.forceClear();
  }

  /**
   * Window focus regain (G-04-11): force-clear and emit release for every
   * still-held side. Any key whose keydown the page handled while blurred is
   * cleared: that keydown came after an OS dialog (e.g. the Windows Sticky Keys
   * prompt) took focus, and its keyup went to the dialog, never to the page.
   * The clear is strictly safe: window focus only follows a blur, and the blur
   * already cleared every key held before it. A key physically held across the
   * focus regain needs a fresh press, the same as after a blur. On Windows, the
   * other Shift still counts as a press once the held Shift's auto-repeat
   * arrives (G-04-21).
   */
  handleFocus(): void {
    this.forceClear();
  }

  /** `document` visibilitychange: force-clear only when the tab became hidden. */
  handleVisibilityChange(hidden: boolean): void {
    if (hidden) this.forceClear();
  }

  /**
   * Copy the latched edges into the reused view, reset the latch, and return the
   * view. The consumer drains this at the top of each fixed step. A side that is
   * held at drain time ended its window on a press, so a release latched in the
   * same window is superseded and only the press is reported: the bat ends up,
   * as release-then-press would leave it (WR-01, the IN-02 held-state rule of
   * PlungerController.applyEdges). A side that is not held keeps both edges,
   * and press-then-release is the true order. No allocation:
   * both `pending` and `view` are long-lived, and the SAME `view` object is
   * returned every call.
   */
  drainEdges(): InputEdges {
    const leftHeld = this.isSideHeld("left");
    const rightHeld = this.isSideHeld("right");
    this.view.leftPress = this.pending.leftPress;
    this.view.leftRelease = this.pending.leftRelease && !(this.pending.leftPress && leftHeld);
    this.view.rightPress = this.pending.rightPress;
    this.view.rightRelease = this.pending.rightRelease && !(this.pending.rightPress && rightHeld);
    resetEdges(this.pending);
    return this.view;
  }

  /**
   * Whether a side is held right now (any of its bound codes is down). Read on
   * a serve to re-press a bat whose key was held through the flipper drop
   * (Pitfall 5); false after a blur, a hidden tab or a focus regain, which
   * clear the held set.
   */
  isHeld(side: FlipperSide): boolean {
    return this.isSideHeld(side);
  }

  /**
   * Wire the handlers to the real browser globals (browser only; not in tests).
   * No `pageshow` listener: a page entering the back/forward cache goes hidden
   * first (visibilitychange clears there) and a frozen page gets no key events.
   */
  attach(): void {
    window.addEventListener("keydown", this.onWindowKeyDown);
    window.addEventListener("keyup", this.onWindowKeyUp);
    window.addEventListener("blur", this.onWindowBlur);
    window.addEventListener("focus", this.onWindowFocus);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  /** Remove the listeners registered by {@link attach}. */
  detach(): void {
    window.removeEventListener("keydown", this.onWindowKeyDown);
    window.removeEventListener("keyup", this.onWindowKeyUp);
    window.removeEventListener("blur", this.onWindowBlur);
    window.removeEventListener("focus", this.onWindowFocus);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  /** True iff ANY of the side's bound codes is currently down (per-side OR). */
  private isSideHeld(side: FlipperSide): boolean {
    const codes = SIDE_CODES[side];
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code !== undefined && this.held.has(code)) return true;
    }
    return false;
  }

  private latchPress(side: FlipperSide): void {
    if (side === "left") this.pending.leftPress = true;
    else this.pending.rightPress = true;
  }

  private latchRelease(side: FlipperSide): void {
    if (side === "left") this.pending.leftRelease = true;
    else this.pending.rightRelease = true;
  }

  /**
   * Stale-Shift reconciliation (G-04-11): when a NON-Shift key event reports
   * `shiftKey === false`, no Shift is down, so a held ShiftLeft/ShiftRight is a
   * code whose keyup the OS took; drop it. No-op for an absent `shiftKey`
   * (unknown state) and for `true`. A Shift key's own event reconciles only on
   * a KEYUP with `windowsShiftHeal` on (G-04-17): on Windows such a keyup
   * arrives only once VK_SHIFT is fully up. A Shift keydown reporting Shift up
   * proves nothing about the other Shift, so it never reconciles (G-04-21;
   * sources include the fake Shift pairs Windows injects around NumLock numpad
   * keys, remote desktop and IME injection). With the heal off, the Shift keys'
   * own events never reconcile (the D-09 cradle). Non-Shift events reconcile on
   * keydown and keyup alike. Latches no edge itself: the caller commits the net
   * transition.
   */
  private dropStaleShift(e: KeyEventLike, isKeyUp: boolean): void {
    if (e.shiftKey !== false) return;
    const isShiftCode = e.code === SHIFT_LEFT || e.code === SHIFT_RIGHT;
    if (isShiftCode && !(this.windowsShiftHeal && isKeyUp)) return;
    this.held.delete(SHIFT_LEFT);
    this.held.delete(SHIFT_RIGHT);
    this.repeatingShift = null;
    this.lastShiftRepeatAt = null;
  }

  /**
   * Windows second Shift press (G-04-17): with the heal on, a repeat keydown for
   * a Shift code that is not held while the OTHER Shift is held is the second
   * physical Shift, which Windows flags as a repeat of the shared VK_SHIFT.
   * G-04-21: the OTHER Shift also counts when it carried an ignored auto-repeat
   * since the last force-clear (`repeatingShift`), so a Shift held across a
   * clear no longer blocks the other Shift even though `held` is empty. A held
   * Shift's own auto-repeat and a lone repeat stay ignored. Allocates nothing.
   */
  private isSecondShiftPress(code: string, timeStamp: number | undefined): boolean {
    if (!this.windowsShiftHeal) return false;
    if (code !== SHIFT_LEFT && code !== SHIFT_RIGHT) return false;
    if (this.held.has(code)) return false;
    const other = code === SHIFT_LEFT ? SHIFT_RIGHT : SHIFT_LEFT;
    if (this.held.has(other) || this.repeatingShift === other) return true;
    // G-04-21 cradle: the timed re-press of the auto-repeating Shift itself.
    return (
      this.repeatingShift === code &&
      this.lastShiftRepeatAt !== null &&
      timeStamp !== undefined &&
      Number.isFinite(timeStamp) &&
      timeStamp - this.lastShiftRepeatAt > SHIFT_REPEAT_GAP_MS
    );
  }

  /**
   * Latch each side's NET transition across one event: a press for not-held ->
   * held, a release for held -> not-held. The net transition prevents a
   * drop-then-add flicker within ONE event (Z over a stale ShiftLeft is
   * edge-free). Across events in one drain window the latch can hold both edges
   * for a side; drainEdges resolves their order from the held state at drain
   * time (WR-01).
   */
  private commitTransitions(leftBefore: boolean, rightBefore: boolean): void {
    const leftAfter = this.isSideHeld("left");
    const rightAfter = this.isSideHeld("right");
    if (!leftBefore && leftAfter) this.latchPress("left");
    else if (leftBefore && !leftAfter) this.latchRelease("left");
    if (!rightBefore && rightAfter) this.latchPress("right");
    else if (rightBefore && !rightAfter) this.latchRelease("right");
  }

  /**
   * Idempotent, allocation-free force-clear: empty the set and emit a release for
   * each side that was held. Safe to call when nothing is held (no edges emitted).
   */
  private forceClear(): void {
    const leftBefore = this.isSideHeld("left");
    const rightBefore = this.isSideHeld("right");
    this.held.clear();
    this.repeatingShift = null;
    this.lastShiftRepeatAt = null;
    this.commitTransitions(leftBefore, rightBefore);
  }
}
