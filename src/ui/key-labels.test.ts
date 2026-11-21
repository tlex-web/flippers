/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";

import indexHtml from "../../index.html?raw";
import {
  applyKeyLabels,
  initKeyLabels,
  keyLabel,
  readLayoutMap,
  type KeyCap,
  type LayoutMapLike,
  type Revealable,
} from "./key-labels";

/**
 * Layout-derived key-cap labels (plan 04-13, G-04-17, UAT 18 decision A). On
 * the user's German QWERTZ layout the KeyZ key is printed Y and the Slash key
 * is printed -, so the caps must come from the Keyboard Map API, never from a
 * literal "Z, /". Fake caps and fake navigators stand in for the DOM; the
 * markup cases read index.html through a raw import.
 */

/** Fake key cap: a data-code attribute and a writable text. */
class FakeCap implements KeyCap {
  textContent: string | null;
  constructor(
    private readonly code: string | null,
    text: string,
  ) {
    this.textContent = text;
  }
  getAttribute(name: string): string | null {
    return name === "data-code" ? this.code : null;
  }
}

/** Fake layout-only element, hidden like the markup. */
class FakeReveal implements Revealable {
  hidden = true;
}

const GERMAN = new Map([
  ["KeyZ", "y"],
  ["Slash", "-"],
  ["KeyX", "x"],
  ["Period", "."],
]);
const US = new Map([
  ["KeyZ", "z"],
  ["Slash", "/"],
  ["KeyX", "x"],
  ["Period", "."],
]);

function rowCaps(): FakeCap[] {
  return [
    new FakeCap("KeyZ", "Z"),
    new FakeCap("Slash", "/"),
    new FakeCap("KeyX", "X"),
    new FakeCap("Period", "."),
  ];
}

function texts(caps: readonly FakeCap[]): (string | null)[] {
  return caps.map((c) => c.textContent);
}

function navWith(getLayoutMap: () => unknown): unknown {
  return { keyboard: { getLayoutMap } };
}

describe("keyLabel", () => {
  it("uppercases a single letter and keeps punctuation", () => {
    expect(keyLabel("y")).toBe("Y");
    expect(keyLabel("x")).toBe("X");
    expect(keyLabel("-")).toBe("-");
    expect(keyLabel(".")).toBe(".");
  });

  it("rejects a missing or empty value", () => {
    expect(keyLabel(undefined)).toBeNull();
    expect(keyLabel("")).toBeNull();
  });

  it("rejects a multi-character value", () => {
    expect(keyLabel("Dead")).toBeNull();
  });

  it("keeps the raw value when its uppercase form is more than one character", () => {
    expect(keyLabel("ß")).toBe("ß");
  });
});

describe("applyKeyLabels", () => {
  it("relabels every cap from the German map and reveals the layout-only element", () => {
    const caps = rowCaps();
    const reveal = new FakeReveal();
    expect(applyKeyLabels(caps, [reveal], GERMAN)).toBe(true);
    expect(texts(caps)).toEqual(["Y", "-", "X", "."]);
    expect(reveal.hidden).toBe(false);
  });

  it("relabels every cap from the US map", () => {
    const caps = rowCaps();
    expect(applyKeyLabels(caps, [new FakeReveal()], US)).toBe(true);
    expect(texts(caps)).toEqual(["Z", "/", "X", "."]);
  });

  it("keeps an unresolved cap's markup label and the layout-only element hidden", () => {
    const caps = rowCaps();
    const reveal = new FakeReveal();
    const partial = new Map(GERMAN);
    partial.delete("Slash");
    expect(applyKeyLabels(caps, [reveal], partial)).toBe(false);
    expect(caps[0]?.textContent).toBe("Y");
    expect(caps[1]?.textContent).toBe("/");
    expect(reveal.hidden).toBe(true);
  });

  it("leaves a cap without a data-code untouched and does not count it", () => {
    const plain = new FakeCap(null, "Left Shift");
    const caps = [...rowCaps(), plain];
    const reveal = new FakeReveal();
    expect(applyKeyLabels(caps, [reveal], GERMAN)).toBe(true);
    expect(plain.textContent).toBe("Left Shift");
    expect(reveal.hidden).toBe(false);
  });

  it("reveals the note over all six caps only when every code resolved", () => {
    const six = (): FakeCap[] => [
      ...rowCaps(),
      new FakeCap("KeyZ", "Z"),
      new FakeCap("Slash", "/"),
    ];
    const caps = six();
    const reveal = new FakeReveal();
    expect(applyKeyLabels(caps, [reveal], GERMAN)).toBe(true);
    expect(texts(caps)).toEqual(["Y", "-", "X", ".", "Y", "-"]);
    expect(reveal.hidden).toBe(false);

    const noPeriod = new Map(GERMAN);
    noPeriod.delete("Period");
    const hiddenReveal = new FakeReveal();
    expect(applyKeyLabels(six(), [hiddenReveal], noPeriod)).toBe(false);
    expect(hiddenReveal.hidden).toBe(true);
  });
});

describe("readLayoutMap", () => {
  it("returns null without a navigator", async () => {
    expect(await readLayoutMap(undefined)).toBeNull();
  });

  it("returns null without a keyboard", async () => {
    expect(await readLayoutMap({})).toBeNull();
  });

  it("returns null without getLayoutMap", async () => {
    expect(await readLayoutMap({ keyboard: {} })).toBeNull();
  });

  it("returns the resolved map", async () => {
    expect(await readLayoutMap(navWith(() => Promise.resolve(GERMAN)))).toBe(GERMAN);
  });

  it("returns null when getLayoutMap rejects", async () => {
    const nav = navWith(() => Promise.reject(new Error("blocked by permissions policy")));
    expect(await readLayoutMap(nav)).toBeNull();
  });

  it("returns null when getLayoutMap throws synchronously", async () => {
    const nav = navWith(() => {
      throw new Error("not a secure context");
    });
    expect(await readLayoutMap(nav)).toBeNull();
  });

  it("returns null when getLayoutMap resolves something that is not a map", async () => {
    expect(await readLayoutMap(navWith(() => Promise.resolve(42)))).toBeNull();
  });
});

describe("initKeyLabels", () => {
  it("relabels the caps from the layout and reveals the layout-only element", async () => {
    const caps = rowCaps();
    const reveal = new FakeReveal();
    const nav = navWith(() => Promise.resolve(GERMAN as LayoutMapLike));
    expect(await initKeyLabels(caps, [reveal], nav)).toBe(true);
    expect(texts(caps)).toEqual(["Y", "-", "X", "."]);
    expect(reveal.hidden).toBe(false);
  });

  it("keeps the markup labels and the layout-only element hidden without the API", async () => {
    const caps = rowCaps();
    const reveal = new FakeReveal();
    expect(await initKeyLabels(caps, [reveal], {})).toBe(false);
    expect(texts(caps)).toEqual(["Z", "/", "X", "."]);
    expect(reveal.hidden).toBe(true);
  });
});

describe("index.html markup", () => {
  const CODES = [
    ["KeyZ", "Z"],
    ["Slash", "/"],
    ["KeyX", "X"],
    ["Period", "."],
    ["KeyM", "M"],
  ] as const;

  it("marks each layout-dependent cap with its code and US fallback label", () => {
    for (const [code, text] of CODES) {
      expect(indexHtml).toContain(`<kbd data-code="${code}">${text}</kbd>`);
    }
  });

  it("uses only the five layout-dependent codes (KeyZ, Slash, KeyX, Period, KeyM)", () => {
    const allowed: readonly string[] = CODES.map(([code]) => code);
    const found = [...indexHtml.matchAll(/data-code="([^"]*)"/g)].map((m) => m[1]);
    expect(found.length).toBeGreaterThanOrEqual(5);
    for (const code of found) {
      expect(allowed).toContain(code);
    }
  });

  it("keeps the layout-independent caps without a data-code", () => {
    for (const text of ["Left Shift", "Right Shift", "←", "→", "↑"]) {
      expect(indexHtml).toContain(`<kbd>${text}</kbd>`);
    }
  });

  it("keeps exactly six controls rows", () => {
    expect(indexHtml.match(/<dt>/g)?.length).toBe(6);
  });

  /** The note paragraph's inner markup. */
  function noteBody(): string {
    const m = /<p class="hud-controls-note">([\s\S]*?)<\/p>/.exec(indexHtml);
    expect(m).not.toBeNull();
    return m?.[1] ?? "";
  }

  const SPAN = /<span data-layout-only hidden>([\s\S]*?)<\/span\s*>/;

  it("has exactly one Windows reliability note", () => {
    expect(indexHtml.match(/class="hud-controls-note"/g)?.length).toBe(1);
  });

  it("names the arrow keys outside the layout-only span", () => {
    const outside = noteBody().replace(SPAN, "");
    expect(outside).toMatch(/<kbd>←<\/kbd\s*>/);
    expect(outside).toMatch(/<kbd>→<\/kbd\s*>/);
  });

  it("holds the KeyZ and Slash caps in one hidden layout-only span", () => {
    expect(indexHtml.match(/data-layout-only/g)?.length).toBe(1);
    const span = SPAN.exec(noteBody());
    expect(span).not.toBeNull();
    expect(span?.[1]).toContain('<kbd data-code="KeyZ">Z</kbd>');
    expect(span?.[1]).toContain('<kbd data-code="Slash">/</kbd>');
  });

  it("reads as the arrow-only fallback with the span hidden", () => {
    const text = noteBody()
      .replace(SPAN, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    expect(text).toBe("On Windows, ← → are the most reliable flipper keys. Shift can stick.");
  });

  it("styles the note with contain: inline-size", () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(indexHtml)?.[1] ?? "";
    expect(style).toMatch(/\.hud-controls-note\s*\{[^}]*contain:\s*inline-size/);
  });
});
