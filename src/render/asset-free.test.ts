/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";

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
 * `<link rel="icon" type="image/svg+xml">` whose href is an inline SVG data URL
 * drawn only from palette.ts colors. The gate reads it through real parsers,
 * the same routes the browser takes, never a regex over markup:
 *
 * - HTML: jsdom builds the spec HTML tree. Exactly one link may carry the icon
 *   rel token, its rel, type and attribute set are pinned, and no noscript
 *   element may appear (jsdom parses with the scripting flag off and browsers
 *   with it on, which changes how noscript content tokenizes).
 * - data: URL: Node's WHATWG URL parser and fetch (the fetch spec's data: URL
 *   processor) decode the href; the MIME type must be exactly image/svg+xml and
 *   every byte printable ASCII, so the browser's XML decoder has nothing to
 *   sniff and the decoded text is provably what the browser renders.
 * - SVG: jsdom's XML parser builds the tree (decoding references first), then
 *   element and attribute allowlists, a per-shape fill presence check (SVG's
 *   initial fill is black, which palette.ts does not hold) and a palette check
 *   on every paint value.
 *
 * The icon link is then removed and the unchanged patterns scan two views of
 * the remainder, so every other icon link, icon file and `data:` URI still
 * fails:
 *
 * - serialized: jsdom's tree written back out as canonical markup (every
 *   attribute double-quoted, character references decoded), which catches a
 *   value the source spells with references or leaves unquoted.
 * - raw: the index.html source with only the icon link's own source span (its
 *   parse5 location) cut out, which catches markup jsdom's parser drops but a
 *   browser keeps, e.g. tags inside a `<select>`: parse5 still uses the old
 *   "in select" insertion mode, while current browsers keep and load them
 *   (06.4.1-REVIEW WR-01, sixth pass).
 *
 * The regex validator this replaces was retired after six 06.4.1 review passes
 * kept finding validator-vs-browser parsing mismatches.
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

/** The SVG namespace: the favicon's root and every element in it must be in it. */
const SVG_NS = "http://www.w3.org/2000/svg";

/** The namespace XML puts every `xmlns` and `xmlns:*` declaration attribute in. */
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

/**
 * The only elements the favicon SVG may use (by localName, in the SVG
 * namespace; case-sensitive, as SVG is). An allowlist, not a denylist: an
 * element nobody listed would otherwise get in by default, e.g. SMIL `<set>`
 * and `<animate>`, which repaint through `to`/`values` that the paint check
 * never reads (06.4.1-REVIEW WR-02). Static shapes and grouping only, nothing
 * that animates, filters, fetches or holds text.
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
 * The only null-namespace attributes the favicon SVG may use (by localName;
 * case-sensitive): geometry, and the fill/stroke paint the palette check
 * reads. The bare `xmlns` declaration is admitted separately by namespace, and
 * every other namespaced attribute (`xmlns:*`, `xlink:*`, `xml:*`) fails.
 * Nothing that filters, masks, clips, animates or fetches is listed: an
 * unlisted presentation attribute such as `filter='invert(1)'` would recolor
 * the icon with no paint value to check (06.4.1-REVIEW WR-02).
 * opacity, fill-opacity and stroke-opacity are left out on purpose: alpha
 * blends palette colors into rendered colors palette.ts does not hold, so
 * partial opacity is not allowed in the favicon (06.4.1-REVIEW IN-03).
 */
const ICON_ATTRS: ReadonlySet<string> = new Set([
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
 * declare one. palette.ts holds no black, so each must carry its own fill
 * (stricter than inheriting one from a `<g>`).
 */
const ICON_SHAPES: ReadonlySet<string> = new Set(["rect", "circle", "ellipse", "path"]);

/** The paint attributes whose values must be none or a palette.ts hex. */
const PAINT_ATTRS: ReadonlySet<string> = new Set(["fill", "stroke", "stop-color"]);

/** `s` with only ASCII A-Z lowercased (HTML and CSS keywords are ASCII case-insensitive). */
function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/**
 * The rel tokens of `el`: its rel attribute ASCII-lowercased and split on
 * HTML's ASCII whitespace (tab, LF, FF, CR, space), empty tokens dropped.
 */
function relTokens(el: Element): string[] {
  return asciiLower(el.getAttribute("rel") ?? "")
    .split(/[\t\n\f\r ]+/)
    .filter((t) => t !== "");
}

/** True when `el`'s rel tokens include `icon` (the `rel~=icon` test, ASCII case-insensitive). */
function isIconLink(el: Element): boolean {
  return relTokens(el).includes("icon");
}

/** A thrown value's message (jsdom's DOMException may not be an Error of this realm). */
function errorDetail(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e && typeof e.message === "string") {
    return e.message;
  }
  return String(e);
}

/**
 * Throws unless `el` and everything under it is a static, palette-colored
 * drawing, checked in preorder (each element before its children): the
 * element is an ICON_ELEMENTS member in the SVG namespace; every attribute is
 * a null-namespace ICON_ATTRS member or the bare `xmlns` declaration (so
 * `xmlns:*`, `xlink:*` and `xml:*` fail); every fill, stroke and stop-color
 * value is none or a palette.ts hex once CSS whitespace (ASCII only) is
 * stripped from its ends; every ICON_SHAPES element carries its own fill
 * (SVG's initial fill is black, which palette.ts does not hold); and the
 * element holds only element children (no text, CDATA, comment or processing
 * instruction). Node kinds are compared by count and numeric nodeType, since
 * the global `Node` constant does not exist in the node test environment.
 */
function checkIconElement(el: Element): void {
  if (el.namespaceURI !== SVG_NS || !ICON_ELEMENTS.has(el.localName)) {
    throw new Error(`icon SVG element <${el.tagName}> is not allowed`);
  }
  const attrs = Array.from(el.attributes);
  for (const attr of attrs) {
    const bareXmlns = attr.name === "xmlns" && attr.namespaceURI === XMLNS_NS;
    if (!bareXmlns && (attr.namespaceURI !== null || !ICON_ATTRS.has(attr.localName))) {
      throw new Error(`icon SVG attribute ${attr.name} is not allowed`);
    }
  }
  for (const attr of attrs) {
    if (attr.namespaceURI !== null || !PAINT_ATTRS.has(attr.localName)) continue;
    // CSS strips only its own whitespace (space, tab, LF, CR, FF);
    // String.prototype.trim() would also strip U+00A0 and U+FEFF, which CSS
    // keeps, so such a value is an invalid color and the shape paints black.
    const value = asciiLower(attr.value.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, ""));
    if (value !== "none" && !PALETTE_HEX.has(value)) {
      throw new Error(`icon SVG paint ${attr.name}=${attr.value} is not none or a palette.ts hex`);
    }
  }
  if (ICON_SHAPES.has(el.localName) && !el.hasAttributeNS(null, "fill")) {
    throw new Error(`icon SVG <${el.localName}> has no fill (SVG's initial black is off-palette)`);
  }
  if (el.childNodes.length !== el.children.length) {
    const other = Array.from(el.childNodes).find((n) => n.nodeType !== 1);
    throw new Error(`icon SVG must hold only elements, found node type ${other?.nodeType}`);
  }
  for (const child of Array.from(el.children)) checkIconElement(child);
}

/**
 * Throws unless `svg` is a well-formed XML document holding only an `<svg>`
 * root in the SVG namespace whose tree passes checkIconElement. The XML parser
 * (jsdom with contentType image/svg+xml, the browser's own route for an SVG
 * image) decodes character and entity references and normalizes attribute
 * values before any check reads them, so the checks see the attribute names,
 * values and elements the browser renders, not their spelling. A document
 * holding anything beside its root (a doctype, a comment, an xml-stylesheet
 * processing instruction) fails.
 */
function checkIconSvg(svg: string): void {
  let doc: Document;
  try {
    doc = new JSDOM(svg, { contentType: "image/svg+xml" }).window.document;
  } catch (e) {
    throw new Error(`icon SVG is not well-formed XML: ${errorDetail(e)}`);
  }
  const root = doc.documentElement;
  if (doc.childNodes.length !== 1 || doc.firstChild !== root) {
    throw new Error("icon SVG document must hold only its svg root");
  }
  if (root.localName !== "svg" || root.namespaceURI !== SVG_NS) {
    throw new Error("icon SVG root must be <svg> in the SVG namespace");
  }
  checkIconElement(root);
}

/**
 * The SVG text a browser decodes from the icon `href`, read the browser's way:
 * the WHATWG URL parser (which drops raw tab, LF and CR) and then Node's
 * fetch, whose data: URL processor is the fetch spec's own algorithm (via
 * undici), so percent-decoding, bad escapes and `;base64,` bodies behave as
 * they do in the browser. The protocol must be data: before fetch is called,
 * so a remote href can never reach the network. The MIME type must be exactly
 * image/svg+xml with no parameters (a charset parameter would override XML
 * encoding detection in the browser). Every body byte must be printable ASCII
 * (0x20 to 0x7E): that leaves the browser's XML decoder nothing to sniff (no
 * BOM, no charset, no encoding-declaration effect, no control or non-ASCII
 * character), so the string handed to checkIconSvg is provably the text the
 * browser decodes. The favicon needs nothing outside printable ASCII.
 *
 * Async because there is no synchronous built-in data: URL processor, and
 * importing jsdom's transitive data-urls package would be an undeclared
 * dependency.
 */
async function decodeIconHref(href: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    throw new Error("icon href must be a data: URL");
  }
  if (url.protocol !== "data:") throw new Error("icon href must be a data: URL");
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("icon href must be a data: URL");
  }
  const contentType = res.headers.get("content-type");
  if (contentType !== "image/svg+xml") {
    throw new Error(`icon href MIME type must be image/svg+xml, found ${contentType}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const offset = bytes.findIndex((b) => b < 0x20 || b > 0x7e);
  if (offset !== -1) {
    const hh = (bytes[offset] ?? 0).toString(16).padStart(2, "0");
    throw new Error(`icon SVG must be printable ASCII, found byte 0x${hh} at ${offset}`);
  }
  return new TextDecoder().decode(bytes);
}

/** The two views of index.html, minus its validated icon link, that PATTERNS scan. */
interface StrippedHtml {
  /** jsdom's tree serialized: every attribute double-quoted, references decoded, `>` in a value escaped. */
  readonly serialized: string;
  /** The source text with only the icon link's own source span cut out. */
  readonly raw: string;
}

/**
 * `html` with its one icon link removed, in the two views PATTERNS scan (see
 * StrippedHtml): jsdom's tree (the spec HTML tree a browser builds) serialized,
 * and the raw source minus the link's source span. jsdom keeps parse5's
 * source locations (includeNodeLocations), so the span cut from the raw text
 * is exactly the tag the checks below read. Throws unless the document holds
 * exactly one link whose rel tokens include icon, holds no noscript element,
 * and that link's type is exactly image/svg+xml, its rel is exactly the single
 * token icon, its attributes are exactly rel, type and href (nothing else
 * rides on the removed element), and its href decodes (decodeIconHref) to an
 * SVG that passes checkIconSvg.
 *
 * JSDOM is built with no runScripts or resources option, so it never runs
 * scripts or loads subresources; that also means it parses with the scripting
 * flag off, while browsers parse with it on, which changes how noscript
 * content tokenizes. index.html needs no noscript, so one is rejected instead
 * of modeled.
 */
async function stripIconLink(html: string): Promise<StrippedHtml> {
  const dom = new JSDOM(html, { includeNodeLocations: true });
  const doc = dom.window.document;
  const icons = Array.from(doc.querySelectorAll("link")).filter(isIconLink);
  const link = icons[0];
  if (icons.length !== 1 || !link) {
    throw new Error(`expected exactly one icon link in index.html, found ${icons.length}`);
  }
  if (doc.querySelector("noscript")) {
    throw new Error("index.html must hold no noscript element");
  }
  const type = link.getAttribute("type");
  if (type !== "image/svg+xml") {
    throw new Error(`icon link type must be image/svg+xml, found ${type}`);
  }
  const tokens = relTokens(link);
  if (tokens.length !== 1 || tokens[0] !== "icon") {
    throw new Error(`icon link rel must be exactly icon, found ${link.getAttribute("rel")}`);
  }
  const names = link.getAttributeNames().sort().join(",");
  if (names !== "href,rel,type") {
    throw new Error(`icon link may carry only rel, type and href, found ${names}`);
  }
  checkIconSvg(await decodeIconHref(link.getAttribute("href") ?? ""));
  const loc = dom.nodeLocation(link);
  if (!loc) throw new Error("icon link has no source location");
  // A sanity check on the offsets, not a parse: the span must be the link's
  // own start tag, or the raw view would hide the wrong text.
  const span = html.slice(loc.startOffset, loc.endOffset);
  if (asciiLower(span.slice(0, 5)) !== "<link" || !span.endsWith(">")) {
    throw new Error("icon link source span is not its <link> tag");
  }
  const raw = html.slice(0, loc.startOffset) + html.slice(loc.endOffset);
  link.remove();
  return { serialized: dom.serialize(), raw };
}

/** The scan() entries for both views of a stripped page, keyed "`file` (serialized)" and "`file` (raw)". */
function strippedSources(file: string, stripped: StrippedHtml): Record<string, string> {
  return { [`${file} (serialized)`]: stripped.serialized, [`${file} (raw)`]: stripped.raw };
}

/** The real favicon payload, decoded: BG_BOTTOM rounded square, WALL ring, BUMPER_CAP disc. */
const GOOD_SVG =
  `<svg xmlns='${SVG_NS}' viewBox='0 0 32 32'>` +
  "<rect width='32' height='32' rx='7' fill='#0b0420'/>" +
  "<circle cx='16' cy='16' r='11' fill='none' stroke='#4cc9f0' stroke-width='2.5'/>" +
  "<circle cx='16' cy='16' r='6' fill='#f72585'/>" +
  "</svg>";

/** A procedural icon link (rel, type and href only) carrying `svg` as its data URL. */
function iconLink(svg: string): string {
  return `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(svg)}" />`;
}

/** A procedural icon link carrying `raw` verbatim as its data URL body (no encoding). */
function rawIconLink(raw: string): string {
  return `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${raw}" />`;
}

/** The href of every link jsdom finds in `html` whose rel tokens include icon. */
function iconHrefs(html: string): string[] {
  return Array.from(new JSDOM(html).window.document.querySelectorAll("link"))
    .filter(isIconLink)
    .map((l) => l.getAttribute("href") ?? "");
}

/**
 * Asserts that jsdom finds exactly one icon link in `html`, carrying an SVG
 * data URL, so a hand-built row reaches decodeIconHref instead of failing
 * earlier at the HTML layer.
 */
function expectOneSvgIconHref(html: string): void {
  const hrefs = iconHrefs(html);
  expect(hrefs).toHaveLength(1);
  expect(hrefs[0]?.startsWith("data:image/svg+xml,")).toBe(true);
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

  it("finds no image, audio or font asset, and no network fetch, in src or index.html", async () => {
    const hits = scan({
      ...SOURCES,
      ...strippedSources("/index.html", await stripIconLink(indexHtml)),
    });
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
  it("index.html carries exactly one procedural SVG icon link, it validates, and stripping it leaves no icon", async () => {
    const stripped = await stripIconLink(indexHtml);
    for (const [view, text] of Object.entries(stripped)) {
      expect(text.includes('rel="icon"'), view).toBe(false);
      expect(text.includes("icon"), view).toBe(false);
      expect(text.includes("data:"), view).toBe(false);
    }
    // The raw view is the source minus exactly the link's tag (the real
    // index.html holds one `<link`, closed by the first `/>` after it).
    const start = indexHtml.indexOf("<link");
    const end = indexHtml.indexOf("/>", start) + 2;
    expect(start).toBeGreaterThan(0);
    expect(stripped.raw).toBe(indexHtml.slice(0, start) + indexHtml.slice(end));
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

  it("GOOD_SVG is the decoded payload of the real favicon", async () => {
    const hrefs = iconHrefs(indexHtml);
    expect(hrefs).toHaveLength(1);
    expect(await decodeIconHref(hrefs[0] ?? "")).toBe(GOOD_SVG);
  });

  it("strips one valid procedural icon link down to no link at all", async () => {
    const { serialized, raw } = await stripIconLink(iconLink(GOOD_SVG));
    expect(serialized.includes("<link")).toBe(false);
    expect(raw).toBe("");
  });

  it("admits every allowlisted element with palette paint", async () => {
    const svg = withElement(
      "<g><ellipse cx='16' cy='16' rx='3' ry='2' fill='#4cc9f0'/>" +
        "<path d='M0 0h1v1z' fill='none' stroke='#f72585'/></g>",
    );
    await expect(stripIconLink(iconLink(svg))).resolves.toBeTypeOf("object");
  });

  it("admits a ;base64, SVG data URL (decoded the browser's way)", async () => {
    const link = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${btoa(GOOD_SVG)}" />`;
    await expect(stripIconLink(link)).resolves.toBeTypeOf("object");
  });

  it.each<readonly [string, string, string]>([
    ["no xmlns prefix", GOOD_SVG.replace(` xmlns='${SVG_NS}'`, ""), "root must be <svg>"],
    ["url(", withElement("<rect width='1' height='1' filter='url(#f)'/>"), "attribute filter"],
    ["href", withElement("<a href='x'></a>"), "element <a>"],
    ["<image", withElement("<image width='1' height='1'/>"), "element <image>"],
    ["<use", withElement("<use x='0'/>"), "element <use>"],
    ["<script", withElement("<script>alert(1)</script>"), "element <script>"],
    ["<style", withElement("<style>rect{opacity:0}</style>"), "element <style>"],
    [
      "<foreignObject",
      withElement("<foreignObject width='1' height='1'></foreignObject>"),
      "element <foreignObject>",
    ],
    ["@import", withElement("<text>@import x</text>"), "element <text>"],
    ["javascript:", withElement("<text>javascript:void(0)</text>"), "element <text>"],
    ["style attribute", withAttr("style='opacity:0'"), "attribute style"],
    ["event attribute", withAttr("onload='x'"), "attribute onload"],
    ["http outside the xmlns", withElement("<text>http://example.com</text>"), "element <text>"],
    // withAttr adds a second fill to GOOD_SVG's rect: XML forbids a duplicate
    // attribute, so the browser renders no icon either. The single-fill rows
    // below keep the paint intent covered.
    ["fill='red'", withAttr("fill='red'"), "not well-formed XML"],
    ['fill="red"', withAttr('fill="red"'), "not well-formed XML"],
    ["fill='#ff0000'", withAttr("fill='#ff0000'"), "not well-formed XML"],
    [
      "a single fill='red'",
      withElement("<rect width='32' height='32' fill='red'/>"),
      "paint fill=red",
    ],
    [
      'a single fill="red"',
      withElement('<rect width="32" height="32" fill="red"/>'),
      "paint fill=red",
    ],
    [
      "a single fill='#ff0000'",
      withElement("<rect width='32' height='32' fill='#ff0000'/>"),
      "paint fill=#ff0000",
    ],
    // The XML parser decodes references before the paint check reads the value.
    [
      "a fill spelled with an XML character reference",
      withElement("<rect width='32' height='32' fill='&#x72;ed'/>"),
      "paint fill=red",
    ],
    ["off-palette stroke", withAttr("stroke='#123456'"), "paint stroke=#123456"],
    ["off-palette stop-color", withElement("<stop stop-color='#abcdef'/>"), "element <stop>"],
    ["off-palette hex in text", withElement("<text>#ff0000</text>"), "element <text>"],
    [
      "an XML character reference spelling url(",
      withElement("<rect width='1' height='1' filter='&#x75;rl(&#x23;f)'/>"),
      "attribute filter",
    ],
    // 06.4.1-REVIEW WR-02: SMIL repaints off-palette without a paint attribute.
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
    ["a comment", withElement("<!-- note -->"), "found node type 8"],
    ["an uppercase tag", withElement("<RECT width='1' height='1'/>"), "element <RECT>"],
    // 06.4.1-REVIEW WR-02 (second pass): presentation attributes recolor
    // without a paint value.
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
      "not well-formed XML",
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
      "not well-formed XML",
    ],
    ["a doctype", `<!DOCTYPE svg>${GOOD_SVG}`, "document must hold only its svg root"],
    [
      "an xml-stylesheet processing instruction",
      `<?xml-stylesheet href='x.css'?>${GOOD_SVG}`,
      "document must hold only its svg root",
    ],
    [
      "an xmlns:xlink declaration",
      GOOD_SVG.replace("<svg ", "<svg xmlns:xlink='http://www.w3.org/1999/xlink' "),
      "attribute xmlns:xlink",
    ],
    ["an xml:base attribute", withAttr("xml:base='x'"), "attribute xml:base"],
  ])("rejects an icon SVG with %s", async (_name, svg, rule) => {
    await expect(stripIconLink(iconLink(svg))).rejects.toThrow(rule);
  });

  // 06.4.1-REVIEW WR-01: built by hand, so the HTML tokenizer decodes the
  // character references in the attribute before the data: URL is read. In the
  // original inputs the raw `#` of GOOD_SVG's first fill starts the URL
  // fragment and cuts the data body (the browser does the same), so they fail
  // as malformed XML. The re-targeted inputs splice the same payloads into the
  // encoded GOOD_SVG, where no raw `#` cuts the URL, so the decoded attribute
  // text reaches the SVG allowlist.
  const imagePayload = "&lt;image &#x68;ref=&apos;&#x68;ttps://evil.example/x.png&apos;/&gt;";
  const scriptPayload = "&lt;script&gt;alert(1)&lt;/script&gt;";
  it.each<readonly [string, string, string]>([
    [
      "an <image> fetch (raw GOOD_SVG)",
      GOOD_SVG.replace("</svg>", `${imagePayload}</svg>`),
      "not well-formed XML",
    ],
    [
      "a <script> element (raw GOOD_SVG)",
      GOOD_SVG.replace("</svg>", `${scriptPayload}</svg>`),
      "not well-formed XML",
    ],
    [
      "an <image> fetch (encoded GOOD_SVG)",
      encodeURIComponent(GOOD_SVG).replace("%3C%2Fsvg%3E", `${imagePayload}%3C%2Fsvg%3E`),
      "element <image>",
    ],
    [
      "a <script> element (encoded GOOD_SVG)",
      encodeURIComponent(GOOD_SVG).replace("%3C%2Fsvg%3E", `${scriptPayload}%3C%2Fsvg%3E`),
      "element <script>",
    ],
  ])(
    "rejects an icon href hiding %s behind HTML character references",
    async (_name, raw, rule) => {
      expect(raw).toContain("&");
      const link = rawIconLink(raw);
      expectOneSvgIconHref(link);
      await expect(stripIconLink(link)).rejects.toThrow(rule);
    },
  );

  // 06.4.1-REVIEW WR-01 (second pass): built by hand, because iconLink() would
  // percent-encode the raw tab, LF or CR. The URL parser drops it, and the
  // reassembled attribute reaches the SVG allowlist.
  it.each<readonly [string, string, string, string, string]>([
    [
      "a style attribute split by a raw LF",
      withAttr("style='fill:red'"),
      "style",
      "st\nyle",
      "attribute style",
    ],
    [
      "an event attribute split by a raw tab",
      withAttr("onload='x'"),
      "onload",
      "on\tload",
      "attribute onload",
    ],
    [
      "url( split by a raw CR",
      withElement("<rect width='1' height='1' filter='url(#0b0420)'/>"),
      "url(",
      "u\rrl(",
      "attribute filter",
    ],
  ])("rejects an icon href carrying %s", async (_name, svg, token, split, rule) => {
    const encoded = encodeURIComponent(svg);
    const raw = encoded.replace(token, split);
    expect(raw).not.toBe(encoded);
    // What the browser decodes once the URL parser drops the raw character.
    expect(raw.replace(/[\t\n\r]/g, "")).toBe(encoded);
    const link = rawIconLink(raw);
    expectOneSvgIconHref(link);
    await expect(stripIconLink(link)).rejects.toThrow(rule);
  });

  // 06.4.1-REVIEW IN-01: built by hand, because iconLink() never writes a bad
  // escape. Each one makes decodeURIComponent throw a bare URIError; the data:
  // URL processor instead keeps a bad escape as literal bytes and decodes a
  // well-formed one to its byte, so each fails on what the browser would see.
  // The last three are well-formed `%XX` escapes that are not valid UTF-8.
  it.each<readonly [string, string, string]>([
    [
      "a %zz escape",
      encodeURIComponent(GOOD_SVG).replace("%3C%2Fsvg", "%zz%3C%2Fsvg"),
      "found node type 3",
    ],
    ["a % with one hex digit", `${encodeURIComponent(GOOD_SVG)}%4`, "not well-formed XML"],
    ["a trailing %", `${encodeURIComponent(GOOD_SVG)}%`, "not well-formed XML"],
    [
      "a %FF byte",
      encodeURIComponent(GOOD_SVG).replace("%3C%2Fsvg", "%FF%3C%2Fsvg"),
      "printable ASCII",
    ],
    [
      "a lead byte with no continuation",
      `${encodeURIComponent(GOOD_SVG)}%C3%28`,
      "printable ASCII",
    ],
    ["an encoded surrogate", `${encodeURIComponent(GOOD_SVG)}%ED%A0%80`, "printable ASCII"],
  ])(
    "rejects an icon href carrying %s that decodeURIComponent cannot decode",
    async (_name, raw, rule) => {
      expect(() => decodeURIComponent(raw)).toThrow(URIError);
      const link = rawIconLink(raw);
      expectOneSvgIconHref(link);
      await expect(stripIconLink(link)).rejects.toThrow(rule);
    },
  );

  // 06.4.1-REVIEW WR-01 (fourth and fifth passes): a fill padded with
  // non-ASCII whitespace is an invalid CSS color, so its shape paints black,
  // and an encoded control character survives the URL parser. Every such byte
  // is outside printable ASCII, so the byte rule stops it before the XML parse.
  // Without that rule the first three control-character rows would render
  // identically to a palette-valid icon (XML turns a literal LF, CR or tab in
  // an attribute into a space, and CSS strips it).
  it.each<readonly [string, string, string]>([
    ["a fill padded with U+00A0", "%C2%A0%23f72585", "\u00A0#f72585"],
    ["a fill padded with U+FEFF", "%23f72585%EF%BB%BF", "#f72585\uFEFF"],
    ["an encoded LF before a palette fill", "%0A%23f72585", "\n#f72585"],
    ["an encoded CR after a palette fill", "%23f72585%0D", "#f72585\r"],
    ["an encoded tab before a palette fill", "%09%23f72585", "\t#f72585"],
    ["an encoded LF before fill red", "%0Ared", "\nred"],
    ["an encoded DEL before a palette fill", "%7F%23f72585", "\u007F#f72585"],
  ])(
    "rejects an icon href carrying %s with the printable-ASCII message",
    async (_name, escaped, fill) => {
      const raw = encodeURIComponent(GOOD_SVG).replace("%23f72585", escaped);
      expect(decodeURIComponent(raw)).toBe(GOOD_SVG.replace("#f72585", fill));
      const link = rawIconLink(raw);
      expectOneSvgIconHref(link);
      await expect(stripIconLink(link)).rejects.toThrow("printable ASCII");
    },
  );

  // 06.4.1-REVIEW WR-01 (fourth pass): checkIconSvg is called directly, past
  // the byte rule, so the paint check's own whitespace handling is proven on
  // its own: it must strip only what CSS strips.
  it.each<readonly [string, string]>([
    ["U+00A0 before a palette fill", "<rect width='32' height='32' fill='\u00A0#f72585'/>"],
    ["U+FEFF after a palette fill", "<rect width='32' height='32' fill='#f72585\uFEFF'/>"],
    ["U+3000 before fill='none'", "<circle cx='16' cy='16' r='12' fill='\u3000none'/>"],
  ])("the paint check rejects %s (CSS whitespace is ASCII only)", (_name, fragment) => {
    expect(() => checkIconSvg(withElement(fragment))).toThrow("paint fill=");
  });

  // 06.4.1-REVIEW WR-01 (fifth pass): a paint value holding a raw LF or CR is
  // still read (the XML parser turns it into a space) and rejected when the
  // rest is off-palette. Through iconLink() the line break is encoded as %0A
  // or %0D, which the byte rule stops first.
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
  ])("the paint check, and the byte rule before it, reject a %s", async (_name, fragment, rule) => {
    expect(() => checkIconSvg(withElement(fragment))).toThrow(rule);
    const link = iconLink(withElement(fragment));
    expect(link).toMatch(/%0[AD]/);
    await expect(stripIconLink(link)).rejects.toThrow("printable ASCII");
  });

  it("the paint check still strips the ASCII whitespace CSS strips", async () => {
    const fragment = "<rect width='32' height='32' fill=' #f72585 '/>";
    expect(() => checkIconSvg(withElement(fragment))).not.toThrow();
    await expect(stripIconLink(iconLink(withElement(fragment)))).resolves.toBeTypeOf("object");
    // Literal LF, CR and tab pads pass directly; through iconLink() they are
    // encoded, and the byte rule admits no control byte.
    for (const pad of ["\n#f72585\n", "\r\n#f72585\t"]) {
      const padded = `<rect width='32' height='32' fill='${pad}'/>`;
      expect(() => checkIconSvg(withElement(padded)), JSON.stringify(pad)).not.toThrow();
      const link = iconLink(withElement(padded));
      await expect(stripIconLink(link), JSON.stringify(pad)).rejects.toThrow("printable ASCII");
    }
    // A form feed is not an XML 1.0 character, so no browser can render it.
    const formFeed = "<rect width='32' height='32' fill='\f#f72585\r'/>";
    expect(() => checkIconSvg(withElement(formFeed))).toThrow("not well-formed XML");
    // Pads written as XML character references are not attribute-normalized,
    // so the paint value really holds LF, tab and CR, and the strip removes them.
    for (const pad of ["&#xA;#f72585&#x9;", "&#xD;#f72585&#x20;"]) {
      const padded = `<rect width='32' height='32' fill='${pad}'/>`;
      expect(() => checkIconSvg(withElement(padded)), pad).not.toThrow();
      await expect(stripIconLink(iconLink(withElement(padded))), pad).resolves.toBeTypeOf("object");
    }
  });

  it("two procedural icon links throw with the count", async () => {
    const two = iconLink(GOOD_SVG) + iconLink(GOOD_SVG);
    await expect(stripIconLink(two)).rejects.toThrow("found 2");
  });

  it("a second, .ico icon link beside the valid one is counted", async () => {
    const html = `${iconLink(GOOD_SVG)}\n<link rel="icon" href="favicon.ico">`;
    await expect(stripIconLink(html)).rejects.toThrow("found 2");
  });

  it("a .png icon link beside the valid one is counted", async () => {
    const html = `${iconLink(GOOD_SVG)}\n<link rel="icon" type="image/png" href="icon.png">`;
    await expect(stripIconLink(html)).rejects.toThrow("found 2");
  });

  it("an uppercase ICON rel beside the valid one is counted", async () => {
    const html = `${iconLink(GOOD_SVG)}\n<link rel="ICON" href="icon.png">`;
    await expect(stripIconLink(html)).rejects.toThrow("found 2");
  });

  it("a page with no icon link throws with the count", async () => {
    await expect(stripIconLink("<title>x</title>")).rejects.toThrow("found 0");
  });

  it("a data:image/png icon link is not admitted and trips both patterns", async () => {
    const png = '<link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgo=">';
    await expect(stripIconLink(png)).rejects.toThrow("type must be image/svg+xml");
    const hits = scan({ "/x.html": png });
    expect(hits).toContain("/x.html: icon link");
    expect(hits).toContain("/x.html: data: URI asset");
  });

  it.each<readonly [string, string, string]>([
    [
      "an extra onload attribute",
      `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(GOOD_SVG)}" onload="x" />`,
      "may carry only rel, type and href",
    ],
    [
      "a second rel token",
      `<link rel="icon stylesheet" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(GOOD_SVG)}" />`,
      "rel must be exactly icon",
    ],
    [
      "a file href",
      '<link rel="icon" type="image/svg+xml" href="favicon.svg" />',
      "must be a data: URL",
    ],
    [
      "a charset parameter",
      `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(GOOD_SVG)}" />`,
      "MIME type must be image/svg+xml",
    ],
  ])("rejects an icon link with %s", async (_name, html, rule) => {
    await expect(stripIconLink(html)).rejects.toThrow(rule);
  });

  // 06.4.1-REVIEW WR-01 and WR-02: each PoC was accepted by the regex gate.
  // WR-01 merges the real icon link into a preceding unclosed open tag (the
  // parser keeps the first type and href and drops the validated ones as
  // duplicates); WR-02 hides a second icon link behind a quoted `>`; WR-02b is
  // the unquoted data: URI half, caught once serialization quotes the value
  // (only the serialized view sees it: the raw text leaves the value unquoted,
  // so the serialized scan stays alongside the raw one).
  it.each<readonly [string, string, string, string | null]>([
    [
      "WR-01: an icon link merged into a preceding unclosed open tag",
      "<title>Flippers</title>",
      "<title>Flippers</title>\n<link type=image/png href=data:image/png;base64,iVBORw0KGgo=",
      "type must be image/svg+xml, found image/png",
    ],
    [
      "WR-02: a second icon link after a quoted >",
      "</head>",
      "<link title='>' rel=icon type=image/png href=data:image/png;base64,iVBORw0KGgo=>\n</head>",
      "found 2",
    ],
    [
      "WR-02b: an unquoted data: URI after a quoted >",
      "</head>",
      "<link title='>' rel=preload as=image href=data:image/png;base64,iVBORw0KGgo=>\n</head>",
      null,
    ],
  ])("the gate rejects the %s PoC", async (_name, find, repl, rule) => {
    const html = indexHtml.replace(find, repl);
    expect(html).not.toBe(indexHtml);
    if (rule !== null) {
      await expect(stripIconLink(html)).rejects.toThrow(rule);
    } else {
      const hits = scan(strippedSources("/index.html", await stripIconLink(html)));
      expect(hits).toContain("/index.html (serialized): data: URI asset");
      expect(hits).not.toContain("/index.html (raw): data: URI asset");
    }
  });

  // 06.4.1-REVIEW WR-01 (sixth pass): parse5 still uses the old "in select"
  // insertion mode and drops every tag inside a <select> except option,
  // optgroup, input, script and template, so the serialized view holds an
  // empty select. Chrome's relaxed select parsing keeps the img, div and link
  // as elements and loads them (reviewer-verified in Chrome 158). Only the raw
  // view sees them.
  it("the raw scan catches assets jsdom drops from inside a <select> but browsers load", async () => {
    const poc =
      '<select aria-hidden="true" style="display:none"><img src=stars.png>' +
      '<div style="background:url(stars.jpg)"></div>' +
      "<link rel=stylesheet href=//cdn.example/x.css></select>\n" +
      '    <main id="sandbox">';
    const html = indexHtml.replace('<main id="sandbox">', poc);
    expect(html).not.toBe(indexHtml);
    const stripped = await stripIconLink(html);
    expect(stripped.serialized).toContain(
      '<select aria-hidden="true" style="display:none"></select>',
    );
    const hits = scan(strippedSources("/index.html", stripped));
    for (const name of [
      "img tag",
      "CSS url() reference",
      "image, audio or font file extension",
      "remote URL in markup or CSS",
    ]) {
      expect(hits, name).toContain(`/index.html (raw): ${name}`);
    }
    expect(hits.filter((h) => h.startsWith("/index.html (serialized)"))).toEqual([]);
  });

  it("a noscript element is rejected (jsdom parses with scripting off, browsers with it on)", async () => {
    const html = `${iconLink(GOOD_SVG)}<noscript><p title="</noscript><link rel=icon href=x.png>"></p></noscript>`;
    await expect(stripIconLink(html)).rejects.toThrow("index.html must hold no noscript element");
  });

  it("a non-icon apple-touch-icon link is left for the pattern scan to catch", async () => {
    const html = `${iconLink(GOOD_SVG)}\n<link rel="apple-touch-icon" href="icon.png">`;
    const hits = scan(strippedSources("/x.html", await stripIconLink(html)));
    for (const view of ["serialized", "raw"]) {
      expect(hits).toContain(`/x.html (${view}): icon link`);
      expect(hits).toContain(`/x.html (${view}): image, audio or font file extension`);
    }
  });
});
