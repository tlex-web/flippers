/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";

import indexHtml from "../../index.html?raw";
import * as palette from "./palette";

/**
 * RND-01 asset gate (05-08; also AUD-01's "no audio files"). The table is drawn
 * in code and every sound is synthesized, so no image, audio or font asset, and
 * no network fetch that could pull one in, may enter the shipped tree: every
 * non-test .ts, .js, .css and .html file under src plus index.html is scanned on
 * every full suite, and there must be no `public/` directory (Vite copies it
 * into the build verbatim, bypassing every source scan).
 *
 * One icon is allowed (06.4.1): index.html may carry exactly one
 * `<link rel="icon" type="image/svg+xml">` whose href is an inline SVG data URI
 * drawn only from palette.ts colors, with every shape declaring its own fill
 * (SVG's default fill is black, which palette.ts does not hold). The gate
 * validates that one link's decoded SVG and strips the link before scanning
 * with the unchanged patterns, so every other icon link, icon file and `data:`
 * URI still fails.
 *
 * The sources are read through Vite's raw imports (the project has no Node
 * typings, and this is the same idiom key-labels.test.ts uses for index.html).
 * Test files and test/ directories are excluded, which is why the patterns and
 * their positive samples can live here without tripping the gate.
 */

const SOURCES = import.meta.glob<string>(
  ["/src/**/*.{ts,js,css,html}", "!/src/**/*.test.ts", "!/src/**/test/**"],
  { query: "?raw", import: "default", eager: true },
);

/** Every file under public/ (lazy: only the keys are read, nothing is imported). */
const PUBLIC_FILES = Object.keys(import.meta.glob("/public/**/*"));

interface AssetPattern {
  readonly name: string;
  readonly re: RegExp;
  /** An inline sample the pattern must hit, so a broken pattern cannot pass vacuously. */
  readonly sample: string;
}

const PATTERNS: readonly AssetPattern[] = [
  { name: "image constructor", re: /\bnew\s+Image\s*\(/, sample: "const img = new Image();" },
  { name: "img tag", re: /<img\b/i, sample: '<img src="logo.png">' },
  {
    name: "CSS url() reference",
    re: /(^|[^\w.])url\s*\(/,
    sample: "background: url(stars.jpg);",
  },
  {
    name: "image, audio or font file extension",
    re: /\.(png|jpe?g|svg|webp|gif|ico|avif|bmp|mp3|wav|ogg|mp4|webm|m4a|aac|flac|opus|woff2?|ttf|otf|eot)(\?[^"'`\s)]*)?["'`)]/i,
    sample: 'import bump from "./bumper.wav";',
  },
  {
    name: "asset URL built from import.meta.url",
    re: /\bnew\s+URL\s*\([^)]*import\.meta\.url/,
    sample: 'const u = new URL("./a.bin", import.meta.url);',
  },
  {
    name: "audio-buffer decode",
    re: /\bdecodeAudioData\s*\(/,
    sample: "ctx.decodeAudioData(buf);",
  },
  { name: "Audio element constructor", re: /\bnew\s+Audio\s*\(/, sample: 'new Audio("x");' },
  {
    name: "audio, video or source element",
    re: /<(audio|video|source)\b/i,
    sample: '<audio src="theme.m4a"></audio>',
  },
  {
    name: "icon link",
    re: /<link\b[^>]*\brel\s*=\s*["']?[^"'>]*\bicon\b/i,
    sample: '<link rel="icon" href="favicon.ico">',
  },
  { name: "network fetch", re: /\bfetch\s*\(/, sample: 'await fetch("/sfx");' },
  { name: "XMLHttpRequest", re: /\bXMLHttpRequest\b/, sample: "const x = new XMLHttpRequest();" },
  { name: "font-face rule", re: /@font-face/i, sample: "@font-face { font-family: X; }" },
  {
    name: "FontFace constructor",
    re: /\bnew\s+FontFace\s*\(/,
    sample: 'new FontFace("X", "local(X)");',
  },
  // 05-REVIEW IN-03: remote stylesheets, fonts and scripts, embedded documents,
  // streaming connections and CSS image-set().
  {
    name: "remote URL in markup or CSS",
    re: /\b(href|src)\s*=\s*["']?(https?:)?\/\//i,
    sample: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X">',
  },
  { name: "CSS @import", re: /@import\b/i, sample: '@import "https://x/y.css";' },
  {
    name: "embedded document element",
    re: /<(object|embed|iframe)\b/i,
    sample: '<iframe src="x"></iframe>',
  },
  {
    name: "streaming connection",
    re: /\bnew\s+(WebSocket|EventSource)\s*\(/,
    sample: 'new WebSocket("wss://x");',
  },
  { name: "CSS image-set()", re: /\bimage-set\s*\(/i, sample: "background: image-set(x 1x);" },
  // 05-REVIEW IN-03 (second pass): asset pulls from script. Vite leaves
  // `https:` module specifiers external, so they are runtime fetches. Side-
  // effect imports and backtick specifiers count too (05-REVIEW IN-02).
  {
    name: "remote ES module specifier",
    re: /\b(from|import)\s*["'`](https?:)?\/\/|\bimport\s*\(\s*["'`](https?:)?\/\//,
    sample: 'import confetti from "https://esm.sh/canvas-confetti";',
  },
  {
    name: "media element created from script",
    re: /\bcreateElement\s*\(\s*["'`](img|audio|video|source)["'`]/i,
    sample: 'const a = document.createElement("audio");',
  },
  {
    name: "data: URI asset",
    re: /["'`]data:(image|audio|font|video)\//i,
    sample: 'img.src = "data:image/png;base64,iVBORw0KGgo=";',
  },
  {
    name: "worker script load",
    re: /\bnew\s+(Shared)?Worker\s*\(|\bimportScripts\s*\(/,
    sample: 'new Worker("https://cdn.example/w.js");',
  },
];

/** Every (file, pattern) hit in the given sources, as "file: pattern". */
function scan(files: Readonly<Record<string, string>>): string[] {
  const hits: string[] = [];
  for (const [file, text] of Object.entries(files)) {
    for (const p of PATTERNS) {
      if (p.re.test(text)) hits.push(`${file}: ${p.name}`);
    }
  }
  return hits;
}

/** The named pattern's RegExp; throws if the pattern was removed from PATTERNS. */
function byName(name: string): RegExp {
  const p = PATTERNS.find((q) => q.name === name);
  if (!p) throw new Error(`${name} pattern missing`);
  return p.re;
}

/** Every `#rrggbb` string export of palette.ts, lowercased: the only colors the favicon may use. */
const PALETTE_HEX: ReadonlySet<string> = new Set(
  Object.values<unknown>(palette)
    .filter((v): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v))
    .map((v) => v.toLowerCase()),
);

/** The SVG namespace, the one http string the favicon payload may hold. */
const SVG_NS = "http://www.w3.org/2000/svg";

/** The start every favicon payload must have (an SVG loaded as an image needs its xmlns). */
const SVG_PREFIX = `<svg xmlns='${SVG_NS}'`;

/**
 * Tokens the decoded favicon SVG may not contain (case-insensitive): anything
 * that fetches (url(, href, <image, <use, @import), runs script (<script,
 * <foreignObject, javascript:, on* event attributes) or styles outside the
 * paint attributes (<style, a style attribute). Not global, so .test is safe.
 */
const ICON_FORBIDDEN: readonly { readonly name: string; readonly re: RegExp }[] = [
  { name: "url(", re: /url\(/i },
  { name: "href", re: /href/i },
  { name: "<image", re: /<image/i },
  { name: "<use", re: /<use/i },
  { name: "<script", re: /<script/i },
  { name: "<style", re: /<style/i },
  { name: "<foreignObject", re: /<foreignobject/i },
  { name: "@import", re: /@import/i },
  { name: "javascript:", re: /javascript:/i },
  { name: "style attribute", re: /\sstyle\s*=/i },
  { name: "event attribute", re: /\son[a-z]+\s*=/i },
];

/**
 * The only elements the favicon SVG may use (case-sensitive, as SVG is).
 * 06.4.1-REVIEW WR-02: ICON_FORBIDDEN is a denylist, so any element nobody
 * listed got in by default, e.g. SMIL `<set>` and `<animate>`, which repaint
 * through `to`/`values` that the paint check never reads. This allowlist is
 * the backstop: static shapes and grouping only, nothing that animates,
 * filters, fetches or holds text.
 */
const ICON_ELEMENTS: ReadonlySet<string> = new Set([
  "svg",
  "rect",
  "circle",
  "ellipse",
  "path",
  "g",
]);

/**
 * The only attributes the favicon SVG may use (case-sensitive): the xmlns,
 * geometry, and the fill/stroke paint the palette check reads.
 * 06.4.1-REVIEW WR-02 (second pass): attributes were still a denylist, so an
 * unlisted presentation attribute such as `filter='invert(1)'` recolored the
 * icon with no flagged token. Nothing that filters, masks, clips, animates or
 * fetches is listed.
 * 06.4.1-REVIEW IN-03: opacity, fill-opacity and stroke-opacity are left out on
 * purpose. Alpha blends palette colors into rendered colors palette.ts does not
 * hold, so partial opacity is not allowed in the favicon.
 */
const ICON_ATTRS: ReadonlySet<string> = new Set([
  "xmlns",
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "rx",
  "ry",
  "cx",
  "cy",
  "r",
  "d",
  "fill",
  "stroke",
  "stroke-width",
  "transform",
]);

/**
 * The ICON_ELEMENTS that paint with SVG's initial fill, black, unless they
 * declare one. palette.ts holds no black, so each must carry its own fill.
 */
const ICON_SHAPES: ReadonlySet<string> = new Set(["rect", "circle", "ellipse", "path"]);

/**
 * One well-formed open tag, read at a `<` (sticky: set lastIndex first): its
 * name, then its quoted attributes as one group for ICON_TAG_ATTR to split.
 */
const ICON_OPEN_TAG = /<([a-z]+)((?:\s+[^\s'"=/>]+\s*=\s*(?:'[^']*'|"[^"]*"))*)\s*\/?>/y;

/** One quoted attribute; the value is consumed whole, so its text is never read as a name. */
const ICON_TAG_ATTR = /\s+([^\s'"=/>]+)\s*=\s*(?:'[^']*'|"[^"]*")/g;

/**
 * Throws unless `svg` is a static, palette-colored drawing: it starts with the
 * SVG xmlns, holds no XML character or entity reference, no ICON_FORBIDDEN
 * token and no http beyond that xmlns, every fill, stroke and stop-color value
 * is none or a palette.ts hex once CSS whitespace (ASCII only) is stripped
 * from its ends, every `#hex` in it is a palette.ts hex, every `<` opens or
 * closes an ICON_ELEMENTS element, every attribute name is in ICON_ATTRS (both
 * allowlists, not denylists), and every ICON_SHAPES element declares its own
 * fill. The element, attribute and fill checks run last so the more specific
 * checks above name their own faults.
 *
 * 06.4.1-REVIEW WR-01: the XML parser decodes `&#x68;`-style references before
 * the browser reads the SVG, so a reference could spell out any token below
 * while the text checks see something else. The favicon needs none, so any `&`
 * is rejected outright rather than decoded.
 */
function validateIconSvg(svg: string): void {
  if (!svg.startsWith(SVG_PREFIX)) {
    throw new Error(`icon SVG must start with ${SVG_PREFIX}`);
  }
  if (svg.includes("&")) {
    throw new Error("icon SVG must not contain XML character or entity references");
  }
  for (const f of ICON_FORBIDDEN) {
    if (f.re.test(svg)) throw new Error(`icon SVG contains forbidden ${f.name}`);
  }
  if (/http/i.test(svg.replace(`xmlns='${SVG_NS}'`, ""))) {
    throw new Error("icon SVG references http outside its xmlns");
  }
  // 06.4.1-REVIEW WR-01 (fourth pass): strip only CSS whitespace (space, tab,
  // LF, CR, FF). String.prototype.trim() also strips U+00A0, U+FEFF and the
  // rest of Unicode's whitespace, which CSS keeps, so the browser rejects such
  // a value as a color and the shape paints SVG's initial black.
  // 06.4.1-REVIEW WR-01 (fifth pass): the value is read up to its closing quote
  // with a negated class, not `.`, which stops at LF and CR. With `.`, a value
  // such as `fill='<LF>red'` made no match at all, so it was never checked, and
  // the browser turned the LF into a space, trimmed it and painted red.
  for (const m of svg.matchAll(/\b(fill|stroke|stop-color)\s*=\s*(?:'([^']*)'|"([^"]*)")/gi)) {
    const raw = m[2] ?? m[3] ?? "";
    const value = raw.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, "").toLowerCase();
    if (value !== "none" && !PALETTE_HEX.has(value)) {
      throw new Error(`icon SVG paint ${m[1]}=${raw} is not none or a palette.ts hex`);
    }
  }
  for (const m of svg.matchAll(/#[0-9a-f]+/gi)) {
    if (!PALETTE_HEX.has(m[0].toLowerCase())) {
      throw new Error(`icon SVG color ${m[0]} is not a palette.ts hex`);
    }
  }
  // Everything after `<` up to whitespace, `/` or `>`: comments, CDATA, doctype
  // and processing instructions are rejected too, not skipped.
  for (const m of svg.matchAll(/<\/?([^\s/>]*)/g)) {
    const name = m[1] ?? "";
    if (!ICON_ELEMENTS.has(name)) {
      throw new Error(`icon SVG element <${name}> is not allowed`);
    }
  }
  // Every name directly before an `=`, after whitespace or a quote: XML puts
  // whitespace between attributes, and the quote also catches a malformed
  // `'filter=` with none. Text inside a value only adds names (stricter), and
  // `&` is already rejected, so no name is hidden behind a reference.
  for (const m of svg.matchAll(/[\s'"]([^\s'"=/>]+)\s*=/g)) {
    const name = m[1] ?? "";
    if (!ICON_ATTRS.has(name)) {
      throw new Error(`icon SVG attribute ${name} is not allowed`);
    }
  }
  // 06.4.1-REVIEW WR-01 (third pass): the paint checks only read paint that is
  // written down, and a shape with no fill paints SVG's initial black. So every
  // shape must declare its own fill (stricter than inheriting one from a <g>).
  // The tag is read quote-aware, so `fill=` inside another value does not
  // count, and a tag that does not parse fails rather than being skipped.
  for (const m of svg.matchAll(/<([a-z]+)/g)) {
    const name = m[1] ?? "";
    if (!ICON_SHAPES.has(name)) continue;
    ICON_OPEN_TAG.lastIndex = m.index;
    const tag = ICON_OPEN_TAG.exec(svg);
    if (!tag) throw new Error(`icon SVG <${name}> open tag is malformed`);
    const attrs = [...(tag[2] ?? "").matchAll(ICON_TAG_ATTR)].map((a) => a[1]);
    if (!attrs.includes("fill")) {
      throw new Error(`icon SVG <${name}> has no fill (SVG's initial black is off-palette)`);
    }
  }
}

/**
 * The one procedural favicon index.html may carry (06.4.1): an icon link of
 * exactly this shape, attributes in this order, whose href is an inline SVG
 * data URI. `\s+` between attributes because Prettier puts each on its own
 * line. Global, so matchAll can count every occurrence (never call .test on it:
 * lastIndex is stateful).
 */
const PROCEDURAL_ICON =
  /<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="data:image\/svg\+xml,([^"]*)"\s*\/?>/g;

/**
 * Every character the raw icon href payload may hold: ASCII letters and digits,
 * what encodeURIComponent leaves unescaped (`-_.!~*'()`), the space, `=`, `/`
 * and `:` the real favicon writes literally, and `%` only as a printable-ASCII
 * escape (`%20` to `%7E`), so the decoded SVG holds no non-ASCII character and
 * no control character.
 * 06.4.1-REVIEW IN-01: a lone `%` (a stray one, or `%zz`) used to get past this
 * and make decodeURIComponent throw a bare URIError that named neither the icon
 * nor the rule. An escape that is not valid UTF-8 (`%FF`, `%C3%28`, an encoded
 * surrogate) did the same. Every escape left is one ASCII byte, which always
 * decodes, so each of these now fails here with this gate's own message.
 * 06.4.1-REVIEW WR-01 (fourth pass): CSS whitespace is ASCII only, so a fill
 * padded with U+00A0 or U+FEFF is an invalid color and its shape paints black.
 * The favicon needs no non-ASCII, so none may reach the validator.
 * 06.4.1-REVIEW WR-01 (fifth pass): `%0A` and `%0D` are not removed by the URL
 * parser (only raw tab, LF and CR are), so they reached the decoded SVG, where
 * a paint value holding one slipped past the paint check. The favicon needs no
 * control character, so escapes stop at printable ASCII: `%09`, `%0A`, `%0C`,
 * `%0D`, `%00` and `%7F` all fail here, and validateIconSvg reads values across
 * line breaks as well.
 */
const ICON_HREF_CHARS = /^(?:[A-Za-z0-9\-_.!~*'() =/:]|%(?:[2-6][0-9A-Fa-f]|7[0-9A-Ea-e]))*$/;

/**
 * `html` with its one procedural icon link removed, so the unchanged PATTERNS
 * scan the rest. Throws unless exactly one such link is present, its raw href
 * holds no HTML character reference and only ICON_HREF_CHARS (so it decodes to
 * printable ASCII and decodeURIComponent cannot throw), and its decoded SVG passes
 * validateIconSvg.
 *
 * 06.4.1-REVIEW WR-01: the browser's HTML tokenizer decodes character
 * references in the attribute value before it reads the data: URL, so `&lt;`,
 * `&#x68;` and the like would let the validator check different text from what
 * the browser renders. A literal `&` is rejected rather than decoded.
 *
 * 06.4.1-REVIEW WR-01 (second pass): the URL parser then deletes every raw tab,
 * LF and CR before the data: body is percent-decoded, so `st<LF>yle=` would reach
 * the browser as `style=` while every token check sees it split. The raw href is
 * held to a positive character allowlist instead, which also closes any other
 * URL-parser normalization of characters the favicon does not need.
 */
function stripProceduralIcon(html: string): string {
  const matches = [...html.matchAll(PROCEDURAL_ICON)];
  const m = matches[0];
  if (matches.length !== 1 || !m) {
    throw new Error(
      `expected exactly one procedural SVG icon link in index.html, found ${matches.length}`,
    );
  }
  const raw = m[1] ?? "";
  if (raw.includes("&")) {
    throw new Error("icon href must not contain HTML character references");
  }
  if (!ICON_HREF_CHARS.test(raw)) {
    throw new Error(
      "icon href holds a raw character, or a bad or non-printable-ASCII % escape, outside ICON_HREF_CHARS (the URL parser strips raw tab, LF and CR)",
    );
  }
  validateIconSvg(decodeURIComponent(raw));
  return html.slice(0, m.index) + html.slice(m.index + m[0].length);
}

/** The real favicon payload, decoded: BG_BOTTOM rounded square, WALL ring, BUMPER_CAP disc. */
const GOOD_SVG =
  `<svg xmlns='${SVG_NS}' viewBox='0 0 32 32'>` +
  "<rect width='32' height='32' rx='7' fill='#0b0420'/>" +
  "<circle cx='16' cy='16' r='11' fill='none' stroke='#4cc9f0' stroke-width='2.5'/>" +
  "<circle cx='16' cy='16' r='6' fill='#f72585'/>" +
  "</svg>";

/** A procedural icon link (the exact admitted shape) carrying `svg` as its data URI. */
function iconLink(svg: string): string {
  return `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(svg)}" />`;
}

/** GOOD_SVG with one extra element before `</svg>`. */
function withElement(fragment: string): string {
  return GOOD_SVG.replace("</svg>", `${fragment}</svg>`);
}

/** GOOD_SVG with one extra attribute on its rect. */
function withAttr(attr: string): string {
  return GOOD_SVG.replace("<rect ", `<rect ${attr} `);
}

describe("asset-free tree (RND-01)", () => {
  it("scans every non-test source file under src, plus index.html", () => {
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain("/src/sim/loop.ts");
    expect(files).toContain("/src/render/interpolate.ts");
    for (const f of files) {
      expect(f.endsWith(".test.ts")).toBe(false);
      expect(f.includes("/test/")).toBe(false);
    }
    expect(indexHtml).toContain("<html");
  });

  it("finds no image, audio or font asset, and no network fetch, in src or index.html", () => {
    const hits = scan({ ...SOURCES, "/index.html": stripProceduralIcon(indexHtml) });
    expect(hits).toEqual([]);
  });

  it("there is no public/ directory (its files would ship unscanned)", () => {
    expect(PUBLIC_FILES).toEqual([]);
  });

  it("the extension pattern catches icons, video and the other audio and font formats", () => {
    const ext = PATTERNS.find((p) => p.name === "image, audio or font file extension");
    if (!ext) throw new Error("extension pattern missing");
    for (const e of ["ico", "avif", "bmp", "mp4", "m4a", "aac", "flac", "opus", "eot"]) {
      expect(ext.re.test(`import a from "./a.${e}";`), e).toBe(true);
    }
  });

  it("the remote-URL pattern catches remote scripts and protocol-relative links, not local ones", () => {
    const remote = PATTERNS.find((p) => p.name === "remote URL in markup or CSS");
    if (!remote) throw new Error("remote URL pattern missing");
    expect(remote.re.test('<script src="https://cdn.example/x.js"></script>')).toBe(true);
    expect(remote.re.test('<link rel="stylesheet" href="//cdn.example/x.css">')).toBe(true);
    expect(remote.re.test('<script type="module" src="/src/sandbox/main.ts"></script>')).toBe(
      false,
    );
  });

  it("the script patterns catch remote modules, created media, data: URIs and workers, not local imports", () => {
    const remote = byName("remote ES module specifier");
    expect(remote.test('const m = await import("https://cdn.example/m.js");')).toBe(true);
    expect(remote.test('import x from "//cdn.example/x.js";')).toBe(true);
    expect(remote.test('import "https://x/y.js";')).toBe(true);
    expect(remote.test("const m = await import(`https://x`);")).toBe(true);
    expect(remote.test('import { CueQueue } from "../app/cue-queue";')).toBe(false);
    expect(remote.test('const m = await import("./lazy");')).toBe(false);
    expect(remote.test('import "./style.css";')).toBe(false);
    const media = byName("media element created from script");
    for (const tag of ["img", "video", "source"]) {
      expect(media.test(`document.createElement('${tag}')`), tag).toBe(true);
    }
    expect(media.test("document.createElement(`img`)")).toBe(true);
    expect(media.test('document.createElement("canvas")')).toBe(false);
    const data = byName("data: URI asset");
    expect(data.test("el.src = `data:audio/wav;base64,UklGR`;")).toBe(true);
    expect(data.test("url('data:font/woff2;base64,d09G')")).toBe(true);
    const worker = byName("worker script load");
    expect(worker.test('new SharedWorker("w.js")')).toBe(true);
    expect(worker.test('importScripts("https://cdn.example/w.js")')).toBe(true);
  });

  it("every pattern hits its own positive sample (no vacuous pass)", () => {
    for (const p of PATTERNS) {
      expect(p.re.test(p.sample), `${p.name} missed its sample`).toBe(true);
      expect(scan({ "/sample.ts": p.sample })).toContain(`/sample.ts: ${p.name}`);
    }
  });
});

describe("procedural favicon carve-out (06.4.1; RND-01)", () => {
  it("index.html carries exactly one procedural SVG icon link, it validates, and stripping it leaves no icon", () => {
    const stripped = stripProceduralIcon(indexHtml);
    expect(stripped.includes('rel="icon"')).toBe(false);
  });

  it("the icon link and data: URI patterns still exist and still trip on the raw index.html", () => {
    expect(byName("icon link").test(indexHtml)).toBe(true);
    expect(byName("data: URI asset").test(indexHtml)).toBe(true);
  });

  it("PALETTE_HEX holds the favicon's three colors and no rgba value", () => {
    for (const hex of [palette.BG_BOTTOM, palette.WALL, palette.BUMPER_CAP]) {
      expect(PALETTE_HEX.has(hex), hex).toBe(true);
    }
    const rgba = Object.values<unknown>(palette).filter(
      (v): v is string => typeof v === "string" && v.startsWith("rgba("),
    );
    expect(rgba).toContain(palette.WALL_GLOW);
    for (const v of rgba) expect(PALETTE_HEX.has(v.toLowerCase()), v).toBe(false);
  });

  it("GOOD_SVG is the decoded payload of the real favicon", () => {
    const m = /href="data:image\/svg\+xml,([^"]*)"/.exec(indexHtml);
    expect(m?.[1] === undefined ? null : decodeURIComponent(m[1])).toBe(GOOD_SVG);
  });

  it("strips one valid procedural icon link down to no link at all", () => {
    expect(stripProceduralIcon(iconLink(GOOD_SVG)).includes("<link")).toBe(false);
  });

  it("admits every allowlisted element with palette paint", () => {
    const svg = withElement(
      "<g><ellipse cx='16' cy='16' rx='3' ry='2' fill='#4cc9f0'/>" +
        "<path d='M0 0h1v1z' fill='none' stroke='#f72585'/></g>",
    );
    expect(() => stripProceduralIcon(iconLink(svg))).not.toThrow();
  });

  it.each<readonly [string, string, string]>([
    ["no xmlns prefix", GOOD_SVG.replace(` xmlns='${SVG_NS}'`, ""), "must start with"],
    ["url(", withElement("<rect width='1' height='1' filter='url(#f)'/>"), "forbidden url("],
    ["href", withElement("<a href='x'></a>"), "forbidden href"],
    ["<image", withElement("<image width='1' height='1'/>"), "forbidden <image"],
    ["<use", withElement("<use x='0'/>"), "forbidden <use"],
    ["<script", withElement("<script>alert(1)</script>"), "forbidden <script"],
    ["<style", withElement("<style>rect{opacity:0}</style>"), "forbidden <style"],
    [
      "<foreignObject",
      withElement("<foreignObject width='1' height='1'></foreignObject>"),
      "forbidden <foreignObject",
    ],
    ["@import", withElement("<text>@import x</text>"), "forbidden @import"],
    ["javascript:", withElement("<text>javascript:void(0)</text>"), "forbidden javascript:"],
    ["style attribute", withAttr("style='opacity:0'"), "forbidden style attribute"],
    ["event attribute", withAttr("onload='x'"), "forbidden event attribute"],
    ["http outside the xmlns", withElement("<text>http://example.com</text>"), "http outside"],
    ["fill='red'", withAttr("fill='red'"), "paint fill=red"],
    ['fill="red"', withAttr('fill="red"'), "paint fill=red"],
    ["fill='#ff0000'", withAttr("fill='#ff0000'"), "paint fill=#ff0000"],
    ["off-palette stroke", withAttr("stroke='#123456'"), "paint stroke=#123456"],
    ["off-palette stop-color", withElement("<stop stop-color='#abcdef'/>"), "paint stop-color"],
    ["off-palette hex in text", withElement("<text>#ff0000</text>"), "color #ff0000"],
    [
      "an XML character reference spelling url(",
      withElement("<rect width='1' height='1' filter='&#x75;rl(&#x23;f)'/>"),
      "XML character or entity references",
    ],
    // 06.4.1-REVIEW WR-02: SMIL repaints off-palette without a fill= or #hex.
    ["SMIL <set>", withElement("<set attributeName='fill' to='red'/>"), "element <set>"],
    [
      "SMIL <animate>",
      withElement("<animate attributeName='stroke' values='red;lime' dur='1s'/>"),
      "element <animate>",
    ],
    [
      "SMIL <animateTransform>",
      withElement("<animateTransform attributeName='transform' type='rotate' to='360'/>"),
      "element <animateTransform>",
    ],
    ["a filter primitive", withElement("<feFlood flood-color='red'/>"), "element <feFlood>"],
    ["a comment", withElement("<!-- note -->"), "element <!--"],
    ["an uppercase tag", withElement("<RECT width='1' height='1'/>"), "element <RECT>"],
    // 06.4.1-REVIEW WR-02 (second pass): presentation attributes recolor
    // without a fill= or #hex.
    [
      "a filter attribute",
      withAttr("filter='invert(1) drop-shadow(0 0 2px red)'"),
      "attribute filter",
    ],
    ["an opacity attribute", withAttr("opacity='0.3'"), "attribute opacity"],
    // 06.4.1-REVIEW IN-03: partial alpha blends palette colors off-palette.
    ["a fill-opacity attribute", withAttr("fill-opacity='0.5'"), "attribute fill-opacity"],
    ["a stroke-opacity attribute", withAttr("stroke-opacity='0.5'"), "attribute stroke-opacity"],
    [
      "an attribute after a quote with no space",
      GOOD_SVG.replace("fill='#0b0420'", "fill='#0b0420'filter='invert(1)'"),
      "attribute filter",
    ],
    // 06.4.1-REVIEW WR-01 (third pass): a shape with no fill paints black.
    ["a rect with no fill", withElement("<rect width='32' height='32'/>"), "<rect> has no fill"],
    ["a path with no fill", withElement("<path d='M0 0h32v32H0z'/>"), "<path> has no fill"],
    [
      "fill= written inside another attribute's value",
      withElement(`<path d="M0 0h32v32H0z fill='none'"/>`),
      "<path> has no fill",
    ],
    [
      "a shape tag with an unquoted value",
      withElement("<rect width=32 height='32' fill='#0b0420'/>"),
      "<rect> open tag is malformed",
    ],
  ])("rejects an icon SVG with %s", (_name, svg, rule) => {
    expect(() => stripProceduralIcon(iconLink(svg))).toThrow(rule);
  });

  // 06.4.1-REVIEW WR-01: built by hand, because iconLink() would percent-encode
  // the `&` and so test the XML layer instead of the HTML attribute layer.
  it.each<readonly [string, string]>([
    ["an <image> fetch", "&lt;image &#x68;ref=&apos;&#x68;ttps://evil.example/x.png&apos;/&gt;"],
    ["a <script> element", "&lt;script&gt;alert(1)&lt;/script&gt;"],
  ])("rejects an icon href hiding %s behind HTML character references", (_name, payload) => {
    const href = `data:image/svg+xml,${GOOD_SVG.replace("</svg>", `${payload}</svg>`)}`;
    const link = `<link rel="icon" type="image/svg+xml" href="${href}" />`;
    expect(link.match(PROCEDURAL_ICON)).toHaveLength(1);
    expect(() => stripProceduralIcon(link)).toThrow("HTML character references");
  });

  // 06.4.1-REVIEW WR-01 (second pass): built by hand, because iconLink() would
  // percent-encode the raw tab, LF or CR that the URL parser deletes.
  it.each<readonly [string, string, string, string]>([
    ["a style attribute split by a raw LF", withAttr("style='fill:red'"), "style", "st\nyle"],
    ["an event attribute split by a raw tab", withAttr("onload='x'"), "onload", "on\tload"],
    [
      "url( split by a raw CR",
      withElement("<rect width='1' height='1' filter='url(#0b0420)'/>"),
      "url(",
      "u\rrl(",
    ],
  ])("rejects an icon href carrying %s", (_name, svg, token, split) => {
    const encoded = encodeURIComponent(svg);
    const raw = encoded.replace(token, split);
    expect(raw).not.toBe(encoded);
    // What the browser decodes once the URL parser drops the raw character.
    expect(raw.replace(/[\t\n\r]/g, "")).toBe(encoded);
    const link = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${raw}" />`;
    expect(link.match(PROCEDURAL_ICON)).toHaveLength(1);
    expect(() => stripProceduralIcon(link)).toThrow("outside ICON_HREF_CHARS");
  });

  // 06.4.1-REVIEW IN-01: built by hand, because iconLink() never writes a bad
  // escape. Each one would make decodeURIComponent throw a bare URIError. The
  // last three are well-formed `%XX` escapes that are not valid UTF-8.
  it.each<readonly [string, string]>([
    ["a %zz escape", encodeURIComponent(GOOD_SVG).replace("%3C%2Fsvg", "%zz%3C%2Fsvg")],
    ["a % with one hex digit", `${encodeURIComponent(GOOD_SVG)}%4`],
    ["a trailing %", `${encodeURIComponent(GOOD_SVG)}%`],
    ["a %FF byte", encodeURIComponent(GOOD_SVG).replace("%3C%2Fsvg", "%FF%3C%2Fsvg")],
    ["a lead byte with no continuation", `${encodeURIComponent(GOOD_SVG)}%C3%28`],
    ["an encoded surrogate", `${encodeURIComponent(GOOD_SVG)}%ED%A0%80`],
  ])("rejects an icon href carrying %s with the ICON_HREF_CHARS message", (_name, raw) => {
    expect(() => decodeURIComponent(raw)).toThrow(URIError);
    const link = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${raw}" />`;
    expect(link.match(PROCEDURAL_ICON)).toHaveLength(1);
    expect(() => stripProceduralIcon(link)).toThrow("outside ICON_HREF_CHARS");
  });

  // 06.4.1-REVIEW WR-01 (fourth pass): a fill padded with non-ASCII whitespace
  // is an invalid CSS color, so its shape paints black. Built by hand so the
  // escape is visible in the row; the href layer must stop it before decoding.
  it.each<readonly [string, string, string]>([
    ["a fill padded with U+00A0", "%C2%A0%23f72585", "\u00A0#f72585"],
    ["a fill padded with U+FEFF", "%23f72585%EF%BB%BF", "#f72585\uFEFF"],
  ])(
    "rejects an icon href carrying %s with the ICON_HREF_CHARS message",
    (_name, escaped, fill) => {
      const raw = encodeURIComponent(GOOD_SVG).replace("%23f72585", escaped);
      expect(decodeURIComponent(raw)).toBe(GOOD_SVG.replace("#f72585", fill));
      const link = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${raw}" />`;
      expect(link.match(PROCEDURAL_ICON)).toHaveLength(1);
      expect(() => stripProceduralIcon(link)).toThrow("outside ICON_HREF_CHARS");
    },
  );

  // 06.4.1-REVIEW WR-01 (fifth pass): an encoded control character survives the
  // URL parser and reaches the decoded SVG, so the href layer must stop it. The
  // first three would pass validateIconSvg (its trim strips them around a
  // palette hex), and the last two would fail it with the paint message, so
  // each row throws the ICON_HREF_CHARS message only while that guard holds.
  it.each<readonly [string, string, string]>([
    ["an encoded LF before a palette fill", "%0A%23f72585", "\n#f72585"],
    ["an encoded CR after a palette fill", "%23f72585%0D", "#f72585\r"],
    ["an encoded tab before a palette fill", "%09%23f72585", "\t#f72585"],
    ["an encoded LF before fill red", "%0Ared", "\nred"],
    ["an encoded DEL before a palette fill", "%7F%23f72585", "\u007F#f72585"],
  ])(
    "rejects an icon href carrying %s with the ICON_HREF_CHARS message",
    (_name, escaped, fill) => {
      const raw = encodeURIComponent(GOOD_SVG).replace("%23f72585", escaped);
      expect(decodeURIComponent(raw)).toBe(GOOD_SVG.replace("#f72585", fill));
      const link = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${raw}" />`;
      expect(link.match(PROCEDURAL_ICON)).toHaveLength(1);
      expect(() => stripProceduralIcon(link)).toThrow("outside ICON_HREF_CHARS");
    },
  );

  // 06.4.1-REVIEW WR-01 (fourth pass): validateIconSvg is called directly, past
  // the href layer above, so the paint check's own whitespace handling is
  // proven on its own: it must strip only what CSS strips.
  it.each<readonly [string, string]>([
    ["U+00A0 before a palette fill", "<rect width='32' height='32' fill='\u00A0#f72585'/>"],
    ["U+FEFF after a palette fill", "<rect width='32' height='32' fill='#f72585\uFEFF'/>"],
    ["U+3000 before fill='none'", "<circle cx='16' cy='16' r='12' fill='\u3000none'/>"],
  ])("the paint check rejects %s (CSS whitespace is ASCII only)", (_name, fragment) => {
    expect(() => validateIconSvg(withElement(fragment))).toThrow("paint fill=");
  });

  // 06.4.1-REVIEW WR-01 (fifth pass): a paint value holding a raw LF or CR used
  // to make no match in the paint check, so it was never read, and the browser
  // painted it. validateIconSvg is called directly, past the href layer, so the
  // paint check itself is proven to read values across line breaks. Through
  // iconLink() the line break is encoded as %0A or %0D, which the href layer
  // now stops first, with its own message.
  it.each<readonly [string, string, string]>([
    ["fill led by an LF", "<rect width='32' height='32' fill='\nred'/>", "paint fill="],
    ["fill led by a CR", "<rect width='32' height='32' fill='\r#00ff00'/>", "paint fill="],
    ["fill split by an LF", "<rect width='32' height='32' fill='r\ned'/>", "paint fill="],
    [
      "stroke led by an LF",
      "<circle cx='16' cy='16' r='14' fill='none' stroke='\nyellow'/>",
      "paint stroke=",
    ],
    [
      "double-quoted fill led by an LF",
      '<rect width="8" height="8" fill="\ncurrentColor"/>',
      "paint fill=",
    ],
  ])("the paint check, and the href layer before it, reject a %s", (_name, fragment, rule) => {
    expect(() => validateIconSvg(withElement(fragment))).toThrow(rule);
    const link = iconLink(withElement(fragment));
    expect(link).toMatch(/%0[AD]/);
    expect(() => stripProceduralIcon(link)).toThrow("outside ICON_HREF_CHARS");
  });

  it("the paint check still strips the ASCII whitespace CSS strips", () => {
    const fragment = "<rect width='32' height='32' fill=' #f72585 '/>";
    expect(() => validateIconSvg(withElement(fragment))).not.toThrow();
    expect(() => stripProceduralIcon(iconLink(withElement(fragment)))).not.toThrow();
    // LF, CR, tab and FF too, but only called directly: the paint check's own
    // trim admits them, and the href layer admits no control-character escape.
    for (const pad of ["\n#f72585\n", "\r\n#f72585\t", "\f#f72585\r"]) {
      const padded = `<rect width='32' height='32' fill='${pad}'/>`;
      expect(() => validateIconSvg(withElement(padded)), JSON.stringify(pad)).not.toThrow();
      const link = iconLink(withElement(padded));
      expect(() => stripProceduralIcon(link), JSON.stringify(pad)).toThrow(
        "outside ICON_HREF_CHARS",
      );
    }
  });

  it("two procedural icon links throw with the count", () => {
    const two = iconLink(GOOD_SVG) + iconLink(GOOD_SVG);
    expect(() => stripProceduralIcon(two)).toThrow("found 2");
  });

  it("a second, .ico icon link beside the valid one still trips the icon link pattern", () => {
    const html = `${iconLink(GOOD_SVG)}\n<link rel="icon" href="favicon.ico">`;
    expect(scan({ "/x.html": stripProceduralIcon(html) })).toContain("/x.html: icon link");
  });

  it("a .png icon link beside the valid one still trips the gate", () => {
    const html = `${iconLink(GOOD_SVG)}\n<link rel="icon" type="image/png" href="icon.png">`;
    expect(scan({ "/x.html": stripProceduralIcon(html) })).toContain("/x.html: icon link");
  });

  it("a data:image/png icon link is not admitted and trips both patterns", () => {
    const png = '<link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgo=">';
    expect(() => stripProceduralIcon(png)).toThrow("found 0");
    const hits = scan({ "/x.html": png });
    expect(hits).toContain("/x.html: icon link");
    expect(hits).toContain("/x.html: data: URI asset");
  });
});
