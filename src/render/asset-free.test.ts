/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";

import indexHtml from "../../index.html?raw";

/**
 * RND-01 asset gate (05-08; also AUD-01's "no audio files"). The table is drawn
 * in code and every sound is synthesized, so no image, audio or font asset, and
 * no network fetch that could pull one in, may enter the shipped tree: every
 * non-test .ts, .js, .css and .html file under src plus index.html is scanned on
 * every full suite, and there must be no `public/` directory (Vite copies it
 * into the build verbatim, bypassing every source scan).
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
    const hits = scan({ ...SOURCES, "/index.html": indexHtml });
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

  it("every pattern hits its own positive sample (no vacuous pass)", () => {
    for (const p of PATTERNS) {
      expect(p.re.test(p.sample), `${p.name} missed its sample`).toBe(true);
      expect(scan({ "/sample.ts": p.sample })).toContain(`/sample.ts: ${p.name}`);
    }
  });
});
