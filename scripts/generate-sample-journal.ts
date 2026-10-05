/**
 * Generates the SAMPLE Dream Journal PDFs locally from DEMO fixtures (never real user data):
 *   npx tsx scripts/generate-sample-journal.ts
 * Output: samples/dream-journal/DARE-dream-journal-SAMPLE-{en,he}.pdf (git-ignored scratch, not shipped).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderJournalPdf, launchJournalBrowser } from '../server/pdf/journalRender.ts';
import { sampleDocument } from '../tests/journalFixtures.ts';

const outDir = new URL('../samples/dream-journal/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const browser = await launchJournalBrowser();
try {
  for (const language of ['en', 'he'] as const) {
    const started = Date.now();
    const result = await renderJournalPdf(sampleDocument(language), { browser });
    const file = new URL(`DARE-dream-journal-SAMPLE-${language}.pdf`, outDir);
    writeFileSync(file, result.pdf);
    console.log(`${language}: ${result.pageCount} pages, ${(result.pdf.length / 1024).toFixed(0)} KB, ${result.passes} passes, ${Date.now() - started} ms, TOC ${JSON.stringify(result.tocPageNumbers)} layouts ${JSON.stringify(result.layouts)} -> ${file.pathname}`);
  }
} finally {
  await browser.close();
}
