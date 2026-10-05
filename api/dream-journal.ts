import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDreamJournal } from '../server/routes/dreamJournal.js';

const CHUNK = 64 * 1024;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ reason: 'request_failed', message: 'Method not allowed.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  const result = await handleDreamJournal(req.body, { authorization: req.headers.authorization, cookie: req.headers.cookie });
  if ('pdf' in result) {
    // Streamed in chunks: a large journal is not subject to the buffered-response size limit, and nothing is stored.
    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="DARE-dream-journal.pdf"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    for (let i = 0; i < result.pdf.length; i += CHUNK) res.write(Buffer.from(result.pdf.subarray(i, i + CHUNK)));
    res.end();
    return;
  }
  res.status(result.status).json(result.body);
}
