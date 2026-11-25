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
   * The offsets of parse5's location info (jsdom 31 returns parse5 8's
   * ElementLocation, which also carries line, column and per-attribute data
   * that the test does not read). Both offsets index the source string passed
   * to the constructor: startOffset is the node's first character and
   * endOffset points just past its last.
   */
  export interface NodeLocation {
    readonly startOffset: number;
    readonly endOffset: number;
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
