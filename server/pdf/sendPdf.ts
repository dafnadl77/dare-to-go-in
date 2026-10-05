import type { ServerResponse } from 'node:http';

/**
 * Sends a finished PDF as a download. Shared by the Vercel function and the local Express route so both behave
 * identically. The PDF already exists in memory (nothing is stored anywhere, no URL is ever created); it is written in
 * 64 KB chunks that respect back-pressure.
 *
 * Content-Length is the integrity signal: a response that is cut short makes the browser's fetch fail instead of
 * handing the page a truncated file that looks like a PDF.
 */
const CHUNK = 64 * 1024;

export interface SendPdfOptions {
  /** Default true. */
  contentLength?: boolean;
  filename?: string;
}

type PdfResponse = Pick<ServerResponse, 'setHeader' | 'write' | 'end' | 'once'> & { status(code: number): unknown };

export async function sendPdf(res: PdfResponse, pdf: Uint8Array, options: SendPdfOptions = {}): Promise<void> {
  res.status(200);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${options.filename ?? 'DARE-dream-journal.pdf'}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (options.contentLength !== false) res.setHeader('Content-Length', String(pdf.length));
  for (let i = 0; i < pdf.length; i += CHUNK) {
    const ok = res.write(Buffer.from(pdf.subarray(i, i + CHUNK)));
    if (!ok) await new Promise<void>((resolve) => res.once('drain', () => resolve()));
  }
  res.end();
}
