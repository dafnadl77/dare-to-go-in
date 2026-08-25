import 'dotenv/config';
import express from 'express';
import { dreamAnalysisRouter } from './routes/dreamAnalysis.js';

const app = express();
app.use(express.json());
app.use('/api', dreamAnalysisRouter);

// A distinct name (not PORT) so it can never collide with an ambient PORT
// env var some other tool (e.g. the frontend dev server) already uses.
const port = Number(process.env.DREAM_ANALYSIS_PORT) || 8787;
app.listen(port, () => {
  console.log(`Dream Analysis backend listening on http://localhost:${port}`);
});
