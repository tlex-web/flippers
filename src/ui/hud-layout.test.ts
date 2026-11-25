/// <reference types="vite/client" />
import { describe, it, expect, vi } from "vitest";

import indexHtml from "../../index.html?raw";
import { SKILL_SHOT_MAX_POINTS } from "../game/tuning";
import { FlipperInput } from "../input/flipper-input";
import { PlungerInput } from "../input/plunger-input";
import { HUD_BAR_GAP_CSS } from "../render/view-transform";
import { HINT_READY_ATTR, statusText, type StatusCode } from "./hud";

/**
 * Narrow-viewport HUD bar (06.4, GAME-01): main.ts sets data-hud="bar" on
 * #sandbox when the side panel would cover the canvas, and index.html turns the
 * panel into a bar above the table. These are string checks on the style block
 * (the project's raw-import idiom); the pixels are checked in the UAT.
 */

const style = /<style>([\s\S]*?)<\/style>/.exec(indexHtml)?.[1] ?? "";

/** The bar-mode container selector, escaped for a RegExp. */
const BAR = String.raw`#sandbox\[data-hud="bar"\]`;

/**
 * A bar-mode rule for `sel` (a RegExp source under `#sandbox[data-hud="bar"]`)
 * whose block holds `decl`. The selector may sit anywhere in a selector list.
 */
function barRule(sel: string, decl: string): RegExp {
  return new RegExp(String.raw`${BAR}\s+${sel}(?:\s*,[^{]*)?\s*\{[^}]*${decl}`);
}

/**
 * The worst-case value for every status code (06.4 WR-02). Exhaustive, so a
 * new StatusCode fails tsc here until its worst case is listed. Fixed texts
 * take 0; the skill shot is capped; BONUS has no cap, but 9,999,999,999,999
 * renders as 23 code points and any reachable bonus is far below it.
 */
const WORST: Record<StatusCode, number> = {
  none: 0,
  tilt: 0,
  tiltNoBonus: 0,
  newHighScore: 0,
  ballSaved: 0,
  attract: 0,
  gameOver: 0,
  warning: 0,
  skillShot: SKILL_SHOT_MAX_POINTS,
  bonus: 9_999_999_999_999,
};

/** The number of code points in `s` (what a reader counts as characters). */
const cp = (s: string): number => [...s].length;

/** A synthetic keydown with a spied `preventDefault` (the src/input test idiom). */
function ev(code: string, repeat = false) {
  return { code, repeat, preventDefault: vi.fn() };
}

/** Each key cap the bar-mode hint shows, and the event code it names. */
const KEY_CODE = {
  Space: "Space",
  "←": "ArrowLeft",
  "→": "ArrowRight",
} as const;

/** The bar-mode hint's inner markup ("" when it is missing). */
function hintBody(): string {
  const m = /<p id="hud-hint" class="hud-hint">([\s\S]*?)<\/p>/.exec(indexHtml);
  expect(m).not.toBeNull();
  return m?.[1] ?? "";
}

/** The first number captured by `re` in the style block (NaN when absent). */
function num(re: RegExp): number {
  return Number(re.exec(style)?.[1]);
}

describe("index.html narrow-viewport HUD bar (06.4; GAME-01)", () => {
  it("stacks #sandbox in a column with a gap equal to HUD_BAR_GAP_CSS", () => {
    expect(style).toMatch(new RegExp(String.raw`${BAR}\s*\{[^}]*flex-direction:\s*column`));
    expect(style).toMatch(
      new RegExp(String.raw`${BAR}\s*\{[^}]*[\s;{]gap:\s*${HUD_BAR_GAP_CSS}px`),
    );
  });

  it("puts the bar-mode .hud in normal flow above the canvas", () => {
    expect(style).toMatch(new RegExp(String.raw`${BAR}\s+\.hud\s*\{[^}]*position:\s*static`));
    expect(style).toMatch(new RegExp(String.raw`${BAR}\s+\.hud\s*\{[^}]*order:\s*-1`));
  });

  it("keeps the base .hud a fixed side panel", () => {
    expect(style).toMatch(/^\s*\.hud\s*\{[^}]*position:\s*fixed/m);
  });

  it("lays the bar out as a 3-row grid: label/aux, score/mute, status/status", () => {
    expect(style).toMatch(barRule(String.raw`\.hud`, String.raw`display:\s*grid`));
    expect(style).toMatch(
      barRule(
        String.raw`\.hud`,
        String.raw`grid-template-areas:\s*"label\s+aux"\s*"score\s+mute"\s*"status\s+status"`,
      ),
    );
    expect(style).toMatch(barRule(String.raw`\.hud-label`, String.raw`grid-area:\s*label`));
    expect(style).toMatch(barRule(String.raw`\.hud-score`, String.raw`grid-area:\s*score`));
  });

  it("shares the aux cell between ball and best, each with a min-height", () => {
    for (const sel of [String.raw`\.hud-ball`, String.raw`\.hud-best`]) {
      expect(style).toMatch(barRule(sel, String.raw`grid-area:\s*aux`));
      expect(style).toMatch(barRule(sel, String.raw`min-height:`));
    }
  });

  it("gives the status row its grid area and a line-height", () => {
    expect(style).toMatch(barRule(String.raw`\.hud-status`, String.raw`grid-area:\s*status`));
    expect(style).toMatch(barRule(String.raw`\.hud-status`, String.raw`line-height:`));
  });

  it("keeps only the Mute row of the controls list, in the mute cell", () => {
    expect(style).toMatch(barRule(String.raw`\.hud-controls`, String.raw`grid-area:\s*mute`));
    // By class, not by position (06.4 IN-03).
    expect(style).toMatch(
      barRule(
        String.raw`\.hud-controls\s*>\s*:not\(\.hud-controls-mute\)`,
        String.raw`display:\s*none`,
      ),
    );
    expect(indexHtml.match(/class="hud-controls-mute"/g)?.length).toBe(2);
    expect(indexHtml).toMatch(
      /<dt class="hud-controls-mute">Mute<\/dt>\s*<dd class="hud-controls-mute">[\s\S]*?id="hud-mute"[\s\S]*?<\/dd>/,
    );
  });

  it("hides the Windows note and the dev readout", () => {
    expect(style).toMatch(barRule(String.raw`\.hud-controls-note`, String.raw`display:\s*none`));
    expect(style).toMatch(barRule(String.raw`\.hud-diag`, String.raw`display:\s*none`));
  });

  it("never lets flex shrink the canvas", () => {
    expect(style).toMatch(/#stage\s*\{[^}]*flex:\s*none/);
  });

  it("sizes #sandbox with 100vh then the 100dvh override", () => {
    expect(style).toMatch(/#sandbox\s*\{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh/);
  });

  it("has no width-based media query (the layout switch is measured)", () => {
    expect(style).not.toMatch(/@media[^{]*width/);
  });
});

/**
 * Bar-mode control hint (06.4.1, 06.4-UI-REVIEW fix 1; ready-only per 06.4.1.1
 * D-01, D-03): a static line after #hud-status that shares the status cell. It
 * is hidden by default and shows only while HudView, not the status text, marks
 * it data-ready (the ball in play rests on the plunger and no status shows), so
 * a narrow-window player learns the launch keys at the plunger and the bar
 * never changes height.
 */
describe("index.html bar-mode control hint, ready-only (06.4.1, 06.4.1.1 D-01, D-03; GAME-01)", () => {
  it("keeps the hint the next element after #hud-status (reading order)", () => {
    // The status div is empty, and the next tag after it opens the hint.
    const next = /id="hud-status"[^>]*><\/div>\s*(<[^>]*>)/.exec(indexHtml)?.[1];
    expect(next).toBe('<p id="hud-hint" class="hud-hint">');
  });

  it("is static: no role and no aria-live", () => {
    expect(indexHtml.match(/<p id="hud-hint" class="hud-hint"/g)?.length).toBe(1);
    expect(indexHtml).not.toMatch(/<p id="hud-hint" class="hud-hint"[^>]*\b(role|aria-)/);
  });

  it('reads "Hold Space to launch · ← → flip" in at most 31 code points', () => {
    const text = hintBody()
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    expect(text).toBe("Hold Space to launch · ← → flip");
    expect(cp(text)).toBeLessThanOrEqual(31);
  });

  it("shows exactly the Space, ← and → caps, none with a data-code", () => {
    const caps = [...hintBody().matchAll(/<kbd([^>]*)>([^<]*)<\/kbd\s*>/g)];
    expect(caps.map((m) => m[2])).toEqual(Object.keys(KEY_CODE));
    for (const m of caps) {
      expect(m[1]).not.toMatch(/data-code/);
    }
  });

  it("names live bindings: Space launches, ← and → flip", () => {
    const plunger = new PlungerInput();
    plunger.handleKeyDown(ev(KEY_CODE.Space));
    expect(plunger.drainEdges().press).toBe(true);

    const left = new FlipperInput();
    left.handleKeyDown(ev(KEY_CODE["←"]));
    expect(left.drainEdges().leftPress).toBe(true);

    const right = new FlipperInput();
    right.handleKeyDown(ev(KEY_CODE["→"]));
    expect(right.drainEdges().rightPress).toBe(true);
  });

  it("hides the hint outside bar mode", () => {
    expect(style).toMatch(/^\s*\.hud-hint\s*\{[^}]*display:\s*none/m);
  });

  it("shares the status cell in bar mode and never widens the grid", () => {
    const hint = String.raw`\.hud-hint`;
    for (const decl of [
      String.raw`display:\s*block`,
      String.raw`grid-area:\s*status`,
      String.raw`min-width:\s*0`,
      String.raw`margin:\s*0`,
      String.raw`overflow:\s*hidden`,
      String.raw`white-space:\s*nowrap`,
      String.raw`text-overflow:\s*ellipsis`,
      String.raw`font-size:\s*12px`,
      String.raw`line-height:\s*1\.6`,
    ]) {
      expect(style).toMatch(barRule(hint, decl));
    }
  });

  it("hides the bar hint by default, by visibility (06.4.1.1 D-03)", () => {
    expect(style).toMatch(barRule(String.raw`\.hud-hint`, String.raw`visibility:\s*hidden`));
  });

  it("shows the bar hint only on the ready attribute, by visibility, never display (06.4.1.1 D-03)", () => {
    expect(HINT_READY_ATTR).toBe("data-ready");
    const m = new RegExp(
      String.raw`${BAR}\s+\.hud-hint\[${HINT_READY_ATTR}="true"\]\s*\{([^}]*)\}`,
    ).exec(style);
    expect(m).not.toBeNull();
    expect(m?.[1]).toMatch(/visibility:\s*visible/);
    expect(m?.[1]).not.toMatch(/display:/);
  });

  it("couples no :empty selector to the hint (06.4.1-UI-REVIEW fix 3)", () => {
    expect(style).not.toMatch(/:empty[^{]*\.hud-hint/);
    expect(style).not.toMatch(/\.hud-hint[^{]*:empty/);
  });

  it("gives the hint the status row's line box, so the bar keeps one height", () => {
    const statusFont = num(/^\s*\.hud-status\s*\{[^}]*font-size:\s*([\d.]+)px/m);
    const statusLine = num(
      new RegExp(String.raw`${BAR}\s+\.hud-status\s*\{[^}]*line-height:\s*([\d.]+)`),
    );
    const hintFont = num(
      new RegExp(String.raw`${BAR}\s+\.hud-hint\s*\{[^}]*font-size:\s*([\d.]+)px`),
    );
    const hintLine = num(
      new RegExp(String.raw`${BAR}\s+\.hud-hint\s*\{[^}]*line-height:\s*([\d.]+)`),
    );
    expect(statusFont * statusLine).toBeGreaterThan(0);
    expect(hintFont * hintLine).toBeCloseTo(statusFont * statusLine, 9);
  });

  it("styles the hint's caps with the controls kbd rule", () => {
    expect(style).toMatch(/\.hud-controls kbd,[^{]*\.hud-hint kbd\s*[,{]/);
  });
});

/**
 * Side panel status reserve (06.4.1, 06.4 WR-02): applyView measures the side
 * panel once at boot with an empty status line, so the base .hud-status
 * reserves the longest status in CSS and the panel is already at its widest.
 */
describe("side panel status reserve (06.4.1; 06.4 WR-02)", () => {
  /** The base (line-anchored, not under #sandbox) .hud-status block. */
  const BASE_STATUS = /^\s*\.hud-status\s*\{([^}]*)\}/m;

  const widest = Math.max(
    ...(Object.keys(WORST) as StatusCode[]).map((c) => cp(statusText(c, WORST[c]))),
  );

  it("finds the widest status at its worst case: 23 code points", () => {
    expect(widest).toBe(23);
  });

  it("reserves calc(N * (1ch + Xem)) with N the widest status", () => {
    const body = BASE_STATUS.exec(style)?.[1] ?? "";
    const m = /min-width:\s*calc\(\s*(\d+)\s*\*\s*\(\s*1ch\s*\+\s*([\d.]+)em\s*\)\s*\)/.exec(body);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBe(widest);
  });

  it("uses the status letter-spacing as the em factor", () => {
    const body = BASE_STATUS.exec(style)?.[1] ?? "";
    const reserveEm = /min-width:\s*calc\([^;]*\+\s*([\d.]+)em/.exec(body)?.[1];
    const spacingEm = /letter-spacing:\s*([\d.]+)em/.exec(body)?.[1];
    expect(spacingEm).toBe("0.12");
    expect(reserveEm).toBe(spacingEm);
  });

  it("resets the reserve in bar mode", () => {
    expect(style).toMatch(barRule(String.raw`\.hud-status`, String.raw`min-width:\s*auto`));
  });
});

/**
 * A font-size declaration's value, up to the first `;` or `}`, so the last
 * declaration of a block written without a semicolon is still seen
 * (06.4.1.1-REVIEW IN-02).
 */
const FONT_SIZE_DECL = /font-size:\s*([^;}]+)[;}]/g;

/**
 * The same for the `font` shorthand; the lookbehind skips `font-size` and
 * `font-family` (06.4.1.1-REVIEW IN-02).
 */
const FONT_SHORTHAND_DECL = /(?<![\w-])font:\s*([^;}]+)[;}]/g;

/**
 * Type scale floor (06.4.1.1 D-06, 06.4.1-UI-REVIEW fix 2): no HUD text is set
 * below 12 px. Every font-size in the style block is a px value (so the floor
 * is checkable), every font shorthand inherits, and no inline style sets a font.
 */
describe("type scale floor (06.4.1.1 D-06)", () => {
  it("uses no font-size below 12 px (06.4.1.1 D-06)", () => {
    const sizes = [...style.matchAll(FONT_SIZE_DECL)].map((m) => m[1]?.trim() ?? "");
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) {
      expect(s, s).toMatch(/^[\d.]+px$/);
      expect(Number.parseFloat(s), s).toBeGreaterThanOrEqual(12);
    }
    const shorthands = [...style.matchAll(FONT_SHORTHAND_DECL)].map((m) => m[1]?.trim() ?? "");
    for (const s of shorthands) {
      expect(s, s).toBe("inherit");
    }
    expect(indexHtml).not.toMatch(/style="[^"]*font/);
  });

  it("catches a final declaration with no semicolon (06.4.1.1-REVIEW IN-02)", () => {
    const css = ".a { color: red; font-size: 10px }\n.b { font: 10px/1 monospace }";
    expect([...css.matchAll(FONT_SIZE_DECL)].map((m) => m[1]?.trim())).toEqual(["10px"]);
    expect([...css.matchAll(FONT_SHORTHAND_DECL)].map((m) => m[1]?.trim())).toEqual([
      "10px/1 monospace",
    ]);
  });

  it("sets the three former 11 px labels to 12 px", () => {
    for (const sel of [
      String.raw`\.hud-label`,
      String.raw`\.hud-controls-note`,
      String.raw`\.hud-bonus-heading`,
    ]) {
      expect(style, sel).toMatch(
        new RegExp(String.raw`^\s*${sel}\s*\{[^}]*font-size:\s*12px`, "m"),
      );
    }
  });
});

/**
 * Side panel width after the 12 px floor (06.4.1.1 D-07): none of the three
 * raised declarations can set the side panel's width, so the panel stays as
 * wide as the status reserve and the vh 900 side/bar switch point holds. The
 * pixel re-measure is the 06.4.1.1-03 UAT; this pins why it cannot move.
 */
describe("side panel width after the 12 px floor (06.4.1.1 D-07)", () => {
  /** The base (line-anchored, not under #sandbox) .hud-status block. */
  const BASE_STATUS = /^\s*\.hud-status\s*\{([^}]*)\}/m;

  /** The markup after the style block (no CSS selectors). */
  const markup = indexHtml.slice(indexHtml.indexOf("</style>"));

  it("keeps the SCORE label narrower than the 23ch status reserve for any monospace ch", () => {
    const label = /<div class="hud-label">([^<]*)<\/div>/.exec(markup)?.[1] ?? "";
    expect(cp(label)).toBeGreaterThan(0);
    const labelPx = num(/^\s*\.hud-label\s*\{[^}]*font-size:\s*([\d.]+)px/m);
    const labelEm = num(/^\s*\.hud-label\s*\{[^}]*letter-spacing:\s*([\d.]+)em/m);

    const status = BASE_STATUS.exec(style)?.[1] ?? "";
    const statusPx = Number(/font-size:\s*([\d.]+)px/.exec(status)?.[1]);
    const reserveN = Number(/min-width:\s*calc\(\s*(\d+)\s*\*/.exec(status)?.[1]);
    const statusEm = Number(/letter-spacing:\s*([\d.]+)em/.exec(status)?.[1]);

    for (const v of [labelPx, labelEm, statusPx, reserveN, statusEm]) {
      expect(v).toBeGreaterThan(0);
    }
    // A monospace ch is about 0.5em to 0.7em of its font-size.
    for (const r of [0.5, 0.6, 0.7]) {
      const labelWidth = cp(label) * (r * labelPx + labelEm * labelPx);
      const reserve = reserveN * (r * statusPx + statusEm * statusPx);
      expect(labelWidth, `ch = ${r}em`).toBeLessThan(reserve);
    }
  });

  it("keeps the Windows note out of the panel's intrinsic width (contain: inline-size)", () => {
    expect(style).toMatch(/^\s*\.hud-controls-note\s*\{[^}]*contain:\s*inline-size/m);
  });

  it("keeps the BONUS heading in the #hud-bonus overlay, not the #hud side panel", () => {
    const heading = markup.indexOf('class="hud-bonus-heading"');
    const bonus = markup.indexOf('id="hud-bonus"');
    expect(bonus).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(bonus);

    // The bound is structural (06.4.1.1-REVIEW IN-03): #hud ends before the
    // overlay's opening tag, and the slice closes every div it opens, so the
    // overlay is #hud's sibling, not a descendant. Rewording the HTML comment
    // above the overlay changes nothing here.
    const hudStart = markup.indexOf('<div id="hud" class="hud">');
    const hudEnd = markup.indexOf('<div id="hud-bonus"');
    expect(hudStart).toBeGreaterThan(-1);
    expect(hudEnd).toBeGreaterThan(hudStart);
    const hud = markup.slice(hudStart, hudEnd);
    const opens = hud.match(/<div\b/g)?.length ?? 0;
    const closes = hud.match(/<\/div>/g)?.length ?? 0;
    expect(opens).toBeGreaterThan(0);
    expect(closes).toBe(opens);
    expect(hud).not.toMatch(/hud-bonus-heading/);
  });
});
