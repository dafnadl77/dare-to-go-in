import 'dotenv/config';
import express from 'express';
import { dreamAnalysisRouter } from './routes/dreamAnalysis.js';
import { dreamImageRouter } from './routes/dreamImage.js';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api', dreamAnalysisRouter);
app.use('/api', dreamImageRouter);

// A distinct name (not PORT) so it can never collide with an ambient PORT
// env var some other tool (e.g. the frontend dev server) already uses.
const port = Number(process.env.DREAM_ANALYSIS_PORT) || 8787;
app.listen(port, () => {
  console.log(`Dream Analysis backend listening on http://localhost:${port}`);
});
