---
phase: quick-261125-0es
plan: 01
subsystem: render/asset-gate
status: complete
tags: [rnd-01, favicon, jsdom, asset-gate, test]
requires: [06.4.1 procedural favicon, src/render/palette.ts]
provides: [parser-based favicon gate (stripIconLink / decodeIconHref / checkIconSvg)]
affects: [src/render/asset-free.test.ts]
tech-stack:
  added: [jsdom 31.0.1 (devDependency, exact)]
  patterns: [parse-then-allowlist, serialize-then-scan, mutation vacuity proof]
key-files:
  created: [src/types/jsdom.d.ts]
  modified: [src/render/asset-free.test.ts, package.json, package-lock.json]
decisions:
  - "Favicon gate reads HTML via jsdom, the data: URL via Node URL + fetch, and the SVG via jsdom's XML parser; regex remains only for value grammars (rel split, CSS whitespace strip, palette hex)"
  - "decodeIconHref is async (Node fetch is the only built-in spec data: URL processor); checkIconSvg stays sync"
  - "Printable-ASCII byte rule on the decoded data: body removes every encoding-sniffing differential"
  - "noscript is rejected rather than modeled (jsdom scripting flag off vs browsers on)"
  - "jsdom typed by a local ambient src/types/jsdom.d.ts; @types/jsdom rejected (pulls in @types/node)"
requirements: [RND-01]
metrics:
  duration: ~35 min
  completed: 2026-11-25
actuals:
  tokens: 14400
  tasks: 3
  commits: 2
plan_head_before: 8053d60572aa171b22cc23993c9341a2c5c2eba5
plan_head_after: f008b693392c6ff7a585d9ee65a8ae0492f9d4a3
---

# Quick 261125-0es Plan 01: Replace regex favicon validation with jsdom parsers Summary

The RND-01 favicon gate now reads the DOM, URL bytes and SVG tree the browser builds (jsdom HTML tree, Node WHATWG URL + fetch data: URL processor with a printable-ASCII byte rule, jsdom XML parser plus element/attribute/fill/paint allowlists), closing 06.4.1-REVIEW WR-01 and WR-02 at the root; the regex validator is gone.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 6d6d367 | feat(quick-261125-0es): parser-based favicon gate tracer with jsdom |
| 2 | f008b69 | refactor(quick-261125-0es): migrate favicon rows to the parser gate, drop regex machinery |
| 3 | (none) | Mutation runs and full gate needed no fix |

`actuals.tokens` is chars/4 over the src + package.json diff (57,622 chars); the package-lock.json diff (+345 lines) is excluded.

## 1. PoC evidence (Step A, HEAD copy vs new gate)

HEAD copy (`git show HEAD:src/render/asset-free.test.ts` + 3 PoC rows against the old synchronous API; a row FAILS when the old gate accepted the PoC):

```
     x WR-01 is rejected 8ms
     x WR-02 is rejected 1ms
     x WR-02b is rejected 1ms
 Test Files  1 failed (1)
      Tests  3 failed | 79 passed (82)
```

All three PoCs were accepted by the HEAD gate. Scratch copy deleted.

New gate (same inputs, `the gate rejects the %s PoC` rows): all pass.
- WR-01 (icon link merged into preceding unclosed `<link type=image/png href=data:image/png...`) -> `type must be image/svg+xml, found image/png`
- WR-02 (second icon link after `title='>'`) -> `found 2`
- WR-02b (unquoted `data:image/png` after `title='>'`, rel=preload) -> stripIconLink resolves; scan of the serialized remainder hits `/index.html: data: URI asset`
- noscript differential row -> `index.html must hold no noscript element`

## 2. Per-row audit (every pre-existing row; 79 at HEAD)

Unchanged rows (8): `scans every non-test source file...`, `there is no public/ directory`, `the extension pattern...`, `the remote-URL pattern...`, `the script patterns...`, `every pattern hits its own positive sample`, `the icon link and data: URI patterns still ... trip on the raw index.html`, `PALETTE_HEX holds...`.

Positive rows migrated to the new gate (all still pass):

| Row | Old | New |
|-----|-----|-----|
| finds no image, audio or font asset ... in src or index.html | scan with old strip | `scan({...SOURCES, "/index.html": await stripIconLink(indexHtml)})` = [] |
| index.html carries exactly one procedural SVG icon link ... leaves no icon | no `rel="icon"` after strip | same, plus remainder holds no `icon` and no `data:` |
| GOOD_SVG is the decoded payload of the real favicon | regex + decodeURIComponent | JSDOM icon href -> `await decodeIconHref(href)` === GOOD_SVG |
| strips one valid procedural icon link down to no link at all | sync | async, remainder has no `<link` |
| admits every allowlisted element with palette paint | not.toThrow | resolves |
| the paint check still strips the ASCII whitespace CSS strips | see section 3 | see section 3 |

Main `rejects an icon SVG with %s` it.each (35 pre-existing rows, now `await expect(stripIconLink(iconLink(svg))).rejects`):

| Row | Old expected | New expected | Reason (where the rejecting check changed) |
|-----|--------------|--------------|--------|
| no xmlns prefix | must start with | root must be <svg> | XML root lands in the null namespace |
| url( | forbidden url( | attribute filter | attribute allowlist (no token denylist) |
| href | forbidden href | element <a> | element allowlist |
| <image | forbidden <image | element <image> | element allowlist |
| <use | forbidden <use | element <use> | element allowlist |
| <script | forbidden <script | element <script> | element allowlist |
| <style | forbidden <style | element <style> | element allowlist |
| <foreignObject | forbidden <foreignObject | element <foreignObject> | element allowlist |
| @import | forbidden @import | element <text> | element allowlist (text node never reached) |
| javascript: | forbidden javascript: | element <text> | element allowlist |
| style attribute | forbidden style attribute | attribute style | attribute allowlist |
| event attribute | forbidden event attribute | attribute onload | attribute allowlist |
| http outside the xmlns | http outside | element <text> | element allowlist |
| fill='red' | paint fill=red | not well-formed XML | duplicate attribute (withAttr adds a second fill; browser renders no icon either) |
| fill="red" | paint fill=red | not well-formed XML | duplicate attribute |
| fill='#ff0000' | paint fill=#ff0000 | not well-formed XML | duplicate attribute |
| off-palette stroke | paint stroke=#123456 | paint stroke=#123456 | unchanged |
| off-palette stop-color | paint stop-color | element <stop> | element allowlist runs before paint |
| off-palette hex in text | color #ff0000 | element <text> | raw #hex scan removed; element allowlist |
| an XML character reference spelling url( | XML character or entity references | attribute filter | XML parser decodes refs; blanket `&` rejection removed |
| SMIL <set> / <animate> / <animateTransform> | element <...> | element <...> | unchanged |
| a filter primitive | element <feFlood> | element <feFlood> | unchanged |
| a comment | element <!-- | found node type 8 | comment is a non-element node |
| an uppercase tag | element <RECT> | element <RECT> | unchanged (tagName preserves case) |
| a filter / opacity / fill-opacity / stroke-opacity attribute | attribute ... | attribute ... | unchanged |
| an attribute after a quote with no space | attribute filter | not well-formed XML | no whitespace between attributes |
| a rect with no fill / a path with no fill | <rect>/<path> has no fill | unchanged | unchanged |
| fill= written inside another attribute's value | <path> has no fill | unchanged | unchanged |
| a shape tag with an unquoted value | <rect> open tag is malformed | not well-formed XML | unquoted attribute value |

HTML character-reference rows (2 pre-existing; now with `expectOneSvgIconHref` instead of the shape-regex match):

| Row | Old | New | Reason |
|-----|-----|-----|--------|
| an <image> fetch | HTML character references | not well-formed XML | raw `#` in GOOD_SVG's first fill starts the URL fragment and cuts the data body (browser does the same) |
| a <script> element | HTML character references | not well-formed XML | same fragment cut |

Raw tab/LF/CR rows (3; equality assertions kept):

| Row | Old | New | Reason |
|-----|-----|-----|--------|
| a style attribute split by a raw LF | outside ICON_HREF_CHARS (old allowlist) | attribute style | URL parser drops the raw char; reassembled attribute hits the allowlist |
| an event attribute split by a raw tab | old allowlist | attribute onload | same |
| url( split by a raw CR | old allowlist | attribute filter | same |

Bad-escape rows (6; decodeURIComponent URIError assertions kept; it.each retitled to "...that decodeURIComponent cannot decode"):

| Row | Old | New | Reason |
|-----|-----|-----|--------|
| a %zz escape | old allowlist | found node type 3 | fetch keeps `%zz` as literal text inside <svg> |
| a % with one hex digit | old allowlist | not well-formed XML | literal `%4` after the root element |
| a trailing % | old allowlist | not well-formed XML | literal `%` after the root element |
| a %FF byte | old allowlist | printable ASCII | byte rule (0xFF) |
| a lead byte with no continuation | old allowlist | printable ASCII | byte rule (0xC3) |
| an encoded surrogate | old allowlist | printable ASCII | byte rule (0xED) |

Non-ASCII pad and control-character rows (2 + 5; merged into one it.each, decodeURIComponent equality kept):

| Row | Old | New | Reason |
|-----|-----|-----|--------|
| a fill padded with U+00A0 / U+FEFF | old allowlist | printable ASCII | byte rule |
| an encoded LF/CR/tab around a palette fill | old allowlist | printable ASCII | byte rule (see note) |
| an encoded LF before fill red | old allowlist | printable ASCII | byte rule |
| an encoded DEL before a palette fill | old allowlist | printable ASCII | byte rule |

Note: without the byte rule the first three control-character rows (encoded LF/CR/tab around a palette fill) would render identically to a palette-valid icon (XML turns a literal LF/CR/tab in an attribute into a space and CSS strips it). The byte rule keeps them rejected; it is justified by removing encoding sniffing, not by these rows.

Direct paint rows:

| Row | Old | New |
|-----|-----|-----|
| U+00A0 / U+FEFF / U+3000 pads (3, direct) | paint fill= | paint fill= via checkIconSvg (unchanged intent) |
| fill led by LF / CR, split by LF, stroke led by LF, double-quoted fill led by LF (5) | direct: paint fill=/stroke=; iconLink half: old allowlist | direct: unchanged via checkIconSvg (XML normalizes the literal LF/CR to a space, rest off-palette); iconLink half: printable ASCII |

Count/HTML-layer rows:

| Row | Old | New | Reason |
|-----|-----|-----|--------|
| two procedural icon links throw with the count | found 2 | found 2 | unchanged |
| a second, .ico icon link beside the valid one | scan hit `icon link` | found 2 | DOM counts every rel~=icon link (retitled "...is counted") |
| a .png icon link beside the valid one | scan hit `icon link` | found 2 | same (retitled) |
| a data:image/png icon link is not admitted | found 0 + raw scan hits | type must be image/svg+xml + raw scan hits | rel~=icon link is now counted; type check rejects it |

New rows (22): `;base64,` positive; single-fill `fill='red'`, `fill="red"`, `fill='#ff0000'` -> paint; `&#x72;ed` -> `paint fill=red`; `<!DOCTYPE svg>` and `<?xml-stylesheet?>` -> document; `xmlns:xlink` -> `attribute xmlns:xlink`; `xml:base` -> `attribute xml:base`; two re-targeted character-reference rows -> `element <image>` / `element <script>`; `rel="ICON"` beside valid -> `found 2`; no icon link -> `found 0`; onload on the icon link -> attribute set; `rel="icon stylesheet"` -> rel; `href="favicon.svg"` -> data: URL; `;charset=utf-8` -> MIME; WR-01 / WR-02 / WR-02b PoCs; noscript; apple-touch-icon leftover caught by `icon link` + extension patterns.

asset-free.test.ts: 79 -> 101 tests, all passing. Every planner-predicted substring held on the first run; no row needed re-targeting.

## 3. Form-feed positive flip

`the paint check still strips the ASCII whitespace CSS strips`: the space pad passes directly and through stripIconLink; the literal LF/CR/tab pads pass checkIconSvg directly and reject with `printable ASCII` through iconLink. The form-feed pad (`'\f#f72585\r'`) flips from pass to `checkIconSvg` rejecting it with `not well-formed XML`: U+000C is not an XML 1.0 character, so no browser can render that SVG. Positive coverage of the strip on real control characters is now provided by XML character-reference pads (`&#xA;#f72585&#x9;`, `&#xD;#f72585&#x20;`), which are not attribute-normalized, so the paint value really holds LF/tab/CR; both pass checkIconSvg directly and stripIconLink through iconLink.

## 4. Rationale: async decoding and the byte rule

- Async: Node's fetch implements the fetch spec's data: URL processor (the browser's own algorithm, via undici); there is no synchronous built-in equivalent, and importing jsdom's transitive `data-urls` would be an undeclared phantom dependency. checkIconSvg stays synchronous so the direct SVG rows stay synchronous. The protocol is required to be `data:` before fetch is called, so no href can reach the network.
- Byte rule: every decoded body byte must be 0x20..0x7E. That leaves the browser's XML decoder nothing to sniff (no BOM, no charset, no encoding-declaration effect, no control or non-ASCII character), so the string handed to the XML parser is provably the text the browser decodes. MIME must be exactly `image/svg+xml` (a charset parameter would override XML encoding detection).

## 5. Mutation results (vacuity proof)

- Mutation A (`return html;` injected as the first line of stripIconLink, scratch `src/render/zz-mutant.test.ts`): **16 passed / 85 failed**. Survivors: 7 asset-tree pattern/inventory rows (finds-no-asset fails), raw-index pattern row, PALETTE_HEX, GOOD_SVG decode (uses decodeIconHref directly), 2 positive admits (allowlisted elements, base64), 3 direct checkIconSvg U+00A0/U+FEFF/U+3000 rows, WR-02b (scan row), apple-touch-icon (scan row). Every row expecting stripIconLink to reject failed: no vacuous async row.
- Mutation B (`return;` injected as the first line of checkIconSvg): **39 passed / 62 failed**. All 62 failures are exactly the SVG-layer rows (43 main it.each, 4 character-reference, 3 raw tab/LF/CR, 3 bad-escape XML/node rows, 3 direct non-ASCII paint, 5 LF/CR paint, the whitespace-strip row). Survivors are HTML-layer (count, noscript, type, rel, attribute set, PoCs), URL/MIME/byte-layer rows, positives and PATTERNS rows.
- Scratch file deleted after each run; `git status` shows no zz-* file.

## Full gate

- `npx vitest run`: 65 files, 1477 tests passed (HEAD suite was 1455; +22 new rows. The plan's "1445" baseline was stale; the total is above it as required)
- `npx tsc --noEmit`, `npx eslint .`, `npx prettier --check .`: clean
- `npm run build`: ok; `grep -rlE 'jsdom|parse5|saxes' dist` -> 0 files
- vitest.config.ts and vitest.gate.config.ts unchanged; no pre-existing untracked planning file staged
- Removed identifiers: 0 occurrences in asset-free.test.ts (filtered and unfiltered); file and src/types/jsdom.d.ts pure ASCII

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `xmlns` kept in ICON_ATTRS during Task 1**
- **Found during:** Task 1
- **Issue:** The old regex validator (left in place in Task 1 by design) required `xmlns` in ICON_ATTRS; removing it then would have broken the green suite.
- **Fix:** Kept it in Task 1 (checkIconSvg's namespace rule never consults ICON_ATTRS for `xmlns`, since its namespaceURI is non-null); removed it in Task 2 with the old code.
- **Commit:** f008b69

**2. [Rule 1 - Bug] Write tool turned `U+00A0` / `U+FEFF` / `U+3000` escapes into literal characters**
- **Found during:** Task 2 (ASCII check after the full-file Write)
- **Fix:** Re-escaped the 5 characters with a node script (scratchpad), re-ran the ASCII check (0) before committing.
- **Commit:** f008b69

**3. [Rule 2 - Correctness] ASCII-only lowercasing**
- rel tokens and paint values are lowercased with an ASCII-only helper (`asciiLower`) instead of `toLowerCase`, matching HTML/CSS ASCII case-insensitivity exactly.

Minor: the `.ico` / `.png` beside-the-valid-one rows were retitled (`... is counted`) because they now reject at the DOM count; the `index.html carries exactly one...` row gained assertions that the remainder holds no `icon` and no `data:`.

## Residuals (out of scope)

- A `rel=manifest` link whose href is a data: JSON manifest naming remote icons is not caught by the phase-05 PATTERNS (pattern-coverage gap, not a parsing mismatch).
- XML parser parity: jsdom uses saxes; browsers use their own XML parsers. Both follow XML 1.0 well-formedness, and the byte rule plus allowlists leave little room, but exotic well-formedness edge cases are not proven identical.
- `npm audit` reports pre-existing moderate/high advisories in vite, vitest, @typescript-eslint, postcss, nanoid and others; none in jsdom's dependency tree. Not addressed here.

## Self-Check: PASSED

- FOUND: src/types/jsdom.d.ts, src/render/asset-free.test.ts
- FOUND: 6d6d367, f008b69 (ancestors of HEAD)
- No zz-*.test.ts scratch file remains
