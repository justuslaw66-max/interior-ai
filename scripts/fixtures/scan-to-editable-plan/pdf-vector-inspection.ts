import { readFile } from "node:fs/promises";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";

export const vectorExportFontBytes = () => readFile("public/fonts/liberation-sans/LiberationSans-Regular.ttf");

/** Inspect page drawing commands independently of embedded font programs and Unicode maps. */
export function vectorPdfPageContent(pdf: PDFDocument) {
  return pdf.getPages().flatMap((page) => {
    const contents = page.node.Contents();
    const entries = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    return entries.map((entry) => {
      const stream = pdf.context.lookup(entry);
      if (!(stream instanceof PDFRawStream)) throw new Error("Expected a decoded PDF page content stream");
      return Buffer.from(decodePDFRawStream(stream).decode()).toString();
    });
  }).join("\n");
}

export function vectorPdfEmbeddedFonts(pdf: PDFDocument) {
  return pdf.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFDict) || object.get(PDFName.of("Type"))?.toString() !== "/FontDescriptor") return [];
    const ref = object.get(PDFName.of("FontFile2")), stream = ref ? pdf.context.lookup(ref) : undefined;
    return stream instanceof PDFRawStream ? [Buffer.from(decodePDFRawStream(stream).decode())] : [];
  });
}
