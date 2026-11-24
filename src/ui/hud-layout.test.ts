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
});
