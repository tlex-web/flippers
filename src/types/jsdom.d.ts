// Types only the jsdom surface that src/render/asset-free.test.ts uses: the
// JSDOM constructor, its window (lib DOM's Window, so Document, Element and
// Attr come from the DOM lib the project already loads) and serialize().
// @types/jsdom is not used because it depends on @types/node, which would pull
// Node typings into the global scope of a browser-only project.
// A script file (no top-level import or export), so this declaration is
// ambient rather than a module augmentation.

declare module "jsdom" {
  export interface ConstructorOptions {
    contentType?: string;
  }

  export class JSDOM {
    constructor(html?: string, options?: ConstructorOptions);
    readonly window: Window;
    serialize(): string;
  }
}
