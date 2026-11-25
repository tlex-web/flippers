/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";

import indexHtml from "../../index.html?raw";
import mainSrc from "./main.ts?raw";

// Raw-source structural guard for the DOM glue in main.ts (`applyView`, 06.4,
// T-06.4-02). main.ts boots the DOM and the environment is node, so it cannot
// be executed here; the pure predicates are covered in src/render. The checks
// are functions of a source string so the mutation tests below can prove each
// guard fails on a plausible regression.

/** Code only: comment lines and trailing // comments removed. */
function stripComments(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .map((l) => l.replace(/\s\/\/.*$/, ""))
    .join("\n");
}

/** Text from the `{` at `open` to its matching `}` (inclusive). */
function braceBlock(code: string, open: number): string {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return code.slice(open, i + 1);
  }
  throw new Error("unbalanced braces");
}

function applyViewBody(code: string): string {
  const head = "const applyView = (): void => {";
  const at = code.indexOf(head);
  if (at < 0) throw new Error("applyView not found");
  return braceBlock(code, at + head.length - 1);
}

function frameBody(code: string): string {
  const at = code.indexOf("function frame(");
  if (at < 0) throw new Error("frame not found");
  return braceBlock(code, code.indexOf("{", at));
}

const count = (s: string, needle: string): number => s.split(needle).length - 1;

function layoutReadViolations(src: string): string[] {
  const code = stripComments(src);
  const body = applyViewBody(code);
  const out: string[] = [];
  if (count(code, "getBoundingClientRect") !== 2) out.push("total reads != 2");
  if (count(body, "getBoundingClientRect") !== 2) out.push("reads outside applyView");
  return out;
}

function orderingViolations(src: string): string[] {
  const body = applyViewBody(stripComments(src));
  const out: string[] = [];
  const side = body.indexOf('setAttribute("data-hud", "side")');
  const firstRead = body.indexOf("getBoundingClientRect");
  if (side < 0 || side > firstRead) out.push("side not set before first read");
  if (!/sideHudClears\([^;]*getBoundingClientRect\(\)\.right/.test(body)) out.push("side path");
  const bar = body.indexOf('setAttribute("data-hud", "bar")');
  const fit = /heightUnderBar\(\s*vh,\s*hud\.getBoundingClientRect\(\)\.height\s*\)/.exec(body);
  if (bar < 0) out.push("bar not set");
  if (!fit || fit.index < bar) out.push("bar fit not height-based after bar set");
  return out;
}

function attributeViolations(src: string, html: string): string[] {
  const set = new Set(
    [...stripComments(src).matchAll(/setAttribute\("data-hud", "([^"]+)"\)/g)].map((m) => m[1]),
  );
  const style = html.slice(html.indexOf("<style"), html.indexOf("</style>"));
  const used = [...style.matchAll(/#sandbox\[data-hud="([^"]+)"\]/g)].map((m) => m[1]);
  const out: string[] = [];
  for (const v of used) if (!set.has(v)) out.push(`css value ${v} never set`);
  if (!used.includes("bar")) out.push("no bar rule");
  if (!set.has("bar")) out.push("bar never set");
  return out;
}

function invocationViolations(src: string): string[] {
  const code = stripComments(src);
  const out: string[] = [];
  if (!/^\s*applyView\(\);/m.test(code)) out.push("no boot call");
  if (!code.includes('addEventListener("resize", applyView)')) out.push("no resize listener");
  const dpr = code.indexOf("const onDprChange");
  if (dpr < 0 || !braceBlock(code, code.indexOf("{", dpr)).includes("applyView()")) {
    out.push("not called from dpr handler");
  }
  if (frameBody(code).includes("applyView")) out.push("applyView in frame");
  if (/requestAnimationFrame\([^)]*applyView/.test(code)) out.push("applyView in rAF");
  return out;
}

describe("applyView DOM glue (raw-source guard)", () => {
  it("layout reads happen only inside applyView, exactly twice (T-06.4-02)", () => {
    expect(layoutReadViolations(mainSrc)).toEqual([]);
  });

  it("measures in side form first, then fits side by .right and bar by .height", () => {
    expect(orderingViolations(mainSrc)).toEqual([]);
  });

  it("every index.html data-hud selector value is set by main.ts, and bar has a rule", () => {
    expect(attributeViolations(mainSrc, indexHtml)).toEqual([]);
  });

  it("runs on boot, resize and dpr change, never from the frame", () => {
    expect(invocationViolations(mainSrc)).toEqual([]);
  });

  describe("guards fail on plausible mutations", () => {
    const m = (from: string, to: string): string => {
      expect(mainSrc).toContain(from);
      return mainSrc.replace(from, to);
    };
    it("extra layout read in the frame", () => {
      const s = m(
        "function frame(nowMs: number): void {",
        "function frame(nowMs: number): void {\n hud.getBoundingClientRect();",
      );
      expect(layoutReadViolations(s)).not.toEqual([]);
    });
    it("third layout read inside applyView", () => {
      const s = m(
        "const dpr = window.devicePixelRatio || 1;\n      sandbox",
        "const dpr = window.devicePixelRatio || 1;\n hud.getBoundingClientRect();\n      sandbox",
      );
      expect(layoutReadViolations(s)).not.toEqual([]);
    });
    it("bar fit using the bottom instead of the height", () => {
      expect(
        orderingViolations(m("getBoundingClientRect().height", "getBoundingClientRect().bottom")),
      ).not.toEqual([]);
    });
    it("side attribute set after measuring", () => {
      const s = m('sandbox.setAttribute("data-hud", "side");', "");
      expect(orderingViolations(s)).not.toEqual([]);
    });
    it("attribute value renamed in main.ts", () => {
      const s = mainSrc.replaceAll('"data-hud", "bar"', '"data-hud", "narrow"');
      expect(attributeViolations(s, indexHtml)).not.toEqual([]);
    });
    it("attribute value renamed in index.html", () => {
      const h = indexHtml.replaceAll('[data-hud="bar"]', '[data-hud="narrow"]');
      expect(attributeViolations(mainSrc, h)).not.toEqual([]);
    });
    it("applyView dropped from resize listener", () => {
      expect(
        invocationViolations(
          m('addEventListener("resize", applyView)', 'addEventListener("resize", () => {})'),
        ),
      ).not.toEqual([]);
    });
    it("applyView called from the frame", () => {
      const s = m(
        "function frame(nowMs: number): void {",
        "function frame(nowMs: number): void {\n applyView();",
      );
      expect(invocationViolations(s)).not.toEqual([]);
    });
  });
});
