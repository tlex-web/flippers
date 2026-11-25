// Types only the jsdom surface that src/render/asset-free.test.ts uses: the
// JSDOM constructor and its contentType and includeNodeLocations options, its
// window (lib DOM's Window, so Document, Element and Attr come from the DOM lib
// the project already loads), serialize() and nodeLocation().
// @types/jsdom is not used because it depends on @types/node, which would pull
// Node typings into the global scope of a browser-only project.
// A script file (no top-level import or export), so this declaration is
// ambient rather than a module augmentation.

declare module "jsdom" {
  export interface ConstructorOptions {
    contentType?: string;
    /** Keep parse5 source locations so nodeLocation() works (HTML only; jsdom throws for XML). */
    includeNodeLocations?: boolean;
  }

  /**
   * A source span from parse5's location info. Both offsets index the source
   * string passed to the constructor: startOffset is the span's first
   * character and endOffset points just past its last.
   */
  export interface SourceSpan {
    readonly startOffset: number;
    readonly endOffset: number;
  }

  /**
   * The parts of parse5's location info the test reads (jsdom 31 returns
   * parse5 8's ElementLocation for an element, which also carries line,
   * column, per-attribute and end-tag data). The node's own offsets span the
   * whole element: its start tag, its children and its end tag, or up to
   * where an ancestor's end tag closed it implicitly.
   */
  export interface NodeLocation extends SourceSpan {
    /**
     * Elements only (parse5's optional ElementLocation.startTag): the span of
     * the element's own start tag. For a void HTML element such as `<link>`
     * it equals the node's span.
     */
    readonly startTag?: SourceSpan;
  }

  export class JSDOM {
    constructor(html?: string, options?: ConstructorOptions);
    readonly window: Window;
    serialize(): string;
    /**
     * Where the parser read `node` in the source. Throws unless the JSDOM was
     * built with includeNodeLocations; null for a node the parser implied
     * (such as an omitted head), undefined for one a script created.
     */
    nodeLocation(node: Node): NodeLocation | null | undefined;
  }
}
