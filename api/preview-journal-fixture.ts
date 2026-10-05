import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handlePreviewHarness } from '../server/pdf/previewHarness.js';

// PREVIEW VALIDATION ONLY (preview/* branch, never merged to main): see server/pdf/previewHarness.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handlePreviewHarness(req, res);
}
