/**
 * Runs once at server startup, BEFORE Next preloads route modules.
 *
 * pdfjs-dist (invoice text extraction) constructs `new DOMMatrix()` at module
 * scope. Its usual Node polyfill comes from the optional native module
 * @napi-rs/canvas, which the packaged desktop app doesn't ship — and the
 * standalone server preloads all routes at boot, so a failed pdfjs evaluation
 * would be cached by the ESM loader before any request could stub the
 * globals. Text extraction never renders, so inert stand-ins are sufficient.
 */
export function register() {
  const g = globalThis as Record<string, unknown>;
  g.DOMMatrix ??= class DOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
  };
  g.ImageData ??= class ImageData {};
  g.Path2D ??= class Path2D {};
}
