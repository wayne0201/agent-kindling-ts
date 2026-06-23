declare module 'pdf-parse' {
  export interface PdfData {
    text: string;
    numpages?: number;
    numrender?: number;
    info?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
  function pdfParse(data: Buffer): Promise<PdfData>;
  export default pdfParse;
}
