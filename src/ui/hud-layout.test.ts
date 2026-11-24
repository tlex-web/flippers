/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";

import indexHtml from "../../index.html?raw";
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
