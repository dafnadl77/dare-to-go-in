/** The server gives up at 60 s; the browser waits a little longer so the user never sits in an endless loading state. */
export const JOURNAL_REQUEST_TIMEOUT_MS = 90_000;

/** Whether the bytes are a complete PDF: header at the start, trailer at the end, and the announced length when one is known. */
export async function isCompletePdf(blob: Blob, announcedLength: string | null): Promise<boolean> {
  if (blob.size < 64) return false;
  if (announcedLength !== null && /^\d+$/.test(announcedLength) && Number(announcedLength) !== blob.size) return false;
  const head = new TextDecoder('latin1').decode(await blob.slice(0, 5).arrayBuffer());
  const tail = new TextDecoder('latin1').decode(await blob.slice(Math.max(0, blob.size - 1024)).arrayBuffer());
  return head === '%PDF-' && tail.includes('%%EOF');
}
