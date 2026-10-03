import express, { type Express } from 'express';
import type pg from 'pg';
import { errorHandler } from './errors.js';
import { postOfficesRouter } from './routes/post-offices.js';
import { shipmentsRouter } from './routes/shipments.js';

export function createApp(pool: pg.Pool): Express {
  const app = express();
  app.use(express.json());

  const api = express.Router();

  api.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  });

  api.use('/post-offices', postOfficesRouter(pool));
  api.use('/shipments', shipmentsRouter(pool));

  app.use('/api', api);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}
