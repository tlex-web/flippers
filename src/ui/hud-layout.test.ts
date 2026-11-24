/// <reference types="vite/client" />
import { describe, it, expect, vi } from "vitest";

import indexHtml from "../../index.html?raw";
import { FlipperInput } from "../input/flipper-input";
import { PlungerInput } from "../input/plunger-input";
import { HUD_BAR_GAP_CSS } from "../render/view-transform";

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
  const m = /<p class="hud-hint">([\s\S]*?)<\/p>/.exec(indexHtml);
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
    expect(style).toMatch(
      barRule(
        String.raw`\.hud-controls\s*>\s*:not\(:nth-last-child\(\s*-n\s*\+\s*2\s*\)\)`,
        String.raw`display:\s*none`,
      ),
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
 * Bar-mode control hint (06.4.1, 06.4-UI-REVIEW fix 1): a static line after
 * #hud-status that shares the status cell and shows only while the status is
 * empty, so a narrow-window player learns the keys and the bar never changes
 * height. HudView writes statusText("none") as "", which is what :empty needs.
 */
describe("index.html bar-mode control hint (06.4.1; GAME-01)", () => {
  it("places the hint right after an empty #hud-status (for :empty and +)", () => {
    // The status div is empty, and the next tag after it opens the hint.
    const next = /id="hud-status"[^>]*><\/div>\s*(<[^>]*>)/.exec(indexHtml)?.[1];
    expect(next).toBe('<p class="hud-hint">');
  });

  it("is static: no role and no aria-live", () => {
    expect(indexHtml.match(/<p class="hud-hint"/g)?.length).toBe(1);
    expect(indexHtml).not.toMatch(/<p class="hud-hint"[^>]*\b(role|aria-)/);
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

  it("hides the hint by visibility, never display, whenever a status shows", () => {
    const m = new RegExp(
      String.raw`${BAR}\s+\.hud-status:not\(:empty\)\s*\+\s*\.hud-hint\s*\{([^}]*)\}`,
    ).exec(style);
    expect(m).not.toBeNull();
    expect(m?.[1]).toMatch(/visibility:\s*hidden/);
    expect(m?.[1]).not.toMatch(/display:/);
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
