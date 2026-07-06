/**
 * Extract all text from a PDF buffer using pdfjs, headless (no canvas).
 * Returns "" for scanned/image-only PDFs.
 *
 * pdfjs constructs `new DOMMatrix()` at module scope; when its optional
 * @napi-rs/canvas polyfill is absent (the packaged app), these inert stubs
 * must exist BEFORE the import evaluates. src/instrumentation.ts also sets
 * them at boot; this is belt-and-suspenders. Kept out of webpack via
 * serverExternalPackages, and traced per-route via outputFileTracingIncludes.
 */
export async function extractPdfText(buf: Buffer): Promise<string> {
  const g = globalThis as Record<string, unknown>;
  g.DOMMatrix ??= class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  };
  g.ImageData ??= class ImageData {};
  g.Path2D ??= class Path2D {};

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  let text = "";
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      for (const item of tc.items) {
        if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
      }
      text += "\n";
    }
  } finally {
    await doc.destroy();
  }
  return text;
}
