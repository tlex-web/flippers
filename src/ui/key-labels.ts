/**
 * Layout-derived key-cap labels (G-04-17, UAT 18 decision A).
 *
 * The flipper and nudge bindings are `KeyboardEvent.code`s (physical keys), but
 * the character printed on a physical key depends on the player's layout. On
 * German QWERTZ the KeyZ key is printed Y and the Slash key is printed -, so a
 * literal "Z" or "/" in the controls list points at the wrong keys. Each
 * layout-dependent cap in index.html carries its code in a `data-code`
 * attribute with the US label as markup fallback; at boot this module asks the
 * Keyboard Map API for the printed character of each code and rewrites the cap.
 *
 * Keyboard Map API scope: `navigator.keyboard.getLayoutMap()` exists only in
 * Chromium browsers, only in a secure context (localhost and https qualify),
 * and is blocked in cross-origin iframes. Where it is missing, throws or
 * rejects, every cap keeps its markup label and layout-only content (the
 * `[data-layout-only]` elements) stays hidden, so the page names only keys it
 * can vouch for. Layout-only content is revealed only when every coded cap
 * resolved.
 *
 * Text-only: labels are filtered to one code point (`keyLabel`) and written
 * through `textContent`, never parsed as markup (T-04-36). Runs once at boot,
 * so it adds no per-frame cost.
 *
 * No engine import and no DOM globals at module scope: caps, layout-only
 * elements and the navigator are injected (an `HTMLElement` satisfies `KeyCap`
 * and `Revealable` structurally), so this module is testable in Vitest's node
 * environment.
 */

/** A key cap carrying a `data-code`. An `HTMLElement` satisfies it. */
export interface KeyCap {
  getAttribute(name: string): string | null;
  textContent: string | null;
}

/** Content shown only when every cap resolved. An `HTMLElement` satisfies it. */
export interface Revealable {
  hidden: boolean;
}

/** The read side of a `KeyboardLayoutMap` (a `Map<string, string>` satisfies it). */
export interface LayoutMapLike {
  get(code: string): string | undefined;
}

/** Number of code points in `s`, counting at most two (a surrogate pair is one). */
function codePoints(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length && n < 2; n++) {
    i += (s.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
  }
  return n;
}

/**
 * One printable code point: not whitespace, not Unicode category C (control,
 * format, lone surrogate, private use, unassigned) and not category M
 * (combining marks).
 */
const PRINTABLE = /^[^\s\p{C}\p{M}]$/u;

/**
 * The cap label for a layout-map value: null unless `raw` is exactly one
 * printable code point; the uppercase form when that is also one code point
 * ("y" -> "Y"), else `raw` ("ß", whose uppercase is "SS"). Whitespace, category
 * C and category M values are rejected because they would draw a blank or
 * garbled cap yet still count as resolved and reveal the layout-only note
 * (04-REVIEW IN-04).
 */
export function keyLabel(raw: string | undefined): string | null {
  if (typeof raw !== "string" || codePoints(raw) !== 1) return null;
  if (!PRINTABLE.test(raw)) return null;
  const upper = raw.toUpperCase();
  return codePoints(upper) === 1 ? upper : raw;
}

/**
 * Rewrites each coded cap from `layout`. A cap without a `data-code` is skipped
 * and does not count; a coded cap whose label does not resolve keeps its markup
 * text. When every coded cap resolved, every `layoutOnly` element is unhidden.
 * Returns whether every coded cap resolved.
 */
export function applyKeyLabels(
  caps: Iterable<KeyCap>,
  layoutOnly: Iterable<Revealable>,
  layout: LayoutMapLike,
): boolean {
  let allResolved = true;
  for (const cap of caps) {
    const code = cap.getAttribute("data-code");
    if (code === null) continue;
    const label = keyLabel(layout.get(code));
    if (label === null) {
      allResolved = false;
    } else {
      cap.textContent = label;
    }
  }
  if (allResolved) {
    for (const el of layoutOnly) el.hidden = false;
  }
  return allResolved;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The layout map from `nav.keyboard.getLayoutMap()`, or null when the API is
 * missing, throws, rejects or resolves something without a `get` function.
 * Takes the navigator as `unknown` (lib.dom has no Keyboard Map API types) and
 * narrows at runtime. Never rejects (T-04-37).
 */
export async function readLayoutMap(nav: unknown): Promise<LayoutMapLike | null> {
  if (!isObject(nav)) return null;
  const keyboard = nav["keyboard"];
  if (!isObject(keyboard)) return null;
  const getLayoutMap = keyboard["getLayoutMap"];
  if (typeof getLayoutMap !== "function") return null;
  let result: unknown;
  try {
    result = await (getLayoutMap as () => unknown).call(keyboard);
  } catch {
    return null;
  }
  if (!isObject(result) || typeof result["get"] !== "function") return null;
  return result as unknown as LayoutMapLike;
}

/**
 * Boot entry: relabels `caps` from the player's layout and reveals `layoutOnly`
 * when every cap resolved. Resolves false (markup labels kept) when the layout
 * is unavailable. Never rejects.
 */
export async function initKeyLabels(
  caps: Iterable<KeyCap>,
  layoutOnly: Iterable<Revealable>,
  nav: unknown,
): Promise<boolean> {
  const layout = await readLayoutMap(nav);
  if (layout === null) return false;
  return applyKeyLabels(caps, layoutOnly, layout);
}
