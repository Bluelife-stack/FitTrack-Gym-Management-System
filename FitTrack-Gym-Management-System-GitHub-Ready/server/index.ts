import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { query, pool } from './db.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '32kb' }));

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
type RequestError = Error & { code?: string; status?: number };

const asyncRoute = (handler: AsyncHandler) => (
  req: Request,
  res: Response,
  next: NextFunction
) => handler(req, res).catch(next);

const integer = (value: string) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const date = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
};

const optionalText = (value: unknown) =>
  value === undefined || value === null
    ? null
    : typeof value === 'string' && value.trim()
      ? value.trim()
      : null;

const sendRows = (sql: string) =>
  asyncRoute(async (_req, res) => {
    res.json((await query(sql)).rows);
  });

app.get('/api/health', asyncRoute(async (_req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok', database: 'connected' });
}));

app.get('/api/dashboard', asyncRoute(async (_req, res) => {
  const { rows: [data] } = await query(`SELECT
    (SELECT COUNT(*) FROM members) AS members,
    (SELECT COUNT(DISTINCT member_id) FROM memberships WHERE status='active' AND end_date >= CURRENT_DATE) AS active_members,
    (SELECT COUNT(*) FROM attendance WHERE check_in_date=CURRENT_DATE) AS today_checkins,
    (SELECT COALESCE(SUM(amount),0) FROM payments) AS revenue,
    (SELECT COUNT(*) FROM memberships WHERE status='active' AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7) AS expiring,
    (SELECT COUNT(*) FROM memberships WHERE status='active' AND end_date < CURRENT_DATE) AS expired`);
  res.json(data);
}));

app.get('/api/members', sendRows(`SELECT m.*,
  COALESCE((SELECT p.name FROM memberships ms
    JOIN membership_plans p ON p.id=ms.plan_id
    WHERE ms.member_id=m.id AND ms.status='active' AND ms.end_date>=CURRENT_DATE
    ORDER BY ms.end_date DESC LIMIT 1),'No active plan') AS current_plan
  FROM members m ORDER BY m.id DESC`));

app.post('/api/members', asyncRoute(async (req, res) => {
  const { full_name, phone, email, status = 'active' } = req.body ?? {};
  const normalizedEmail = optionalText(email);
  if (
    typeof full_name !== 'string' || full_name.trim().length < 2 ||
    typeof phone !== 'string' || phone.trim().length < 7 ||
    !['active', 'inactive'].includes(status) ||
    (email !== undefined && email !== null && typeof email !== 'string') ||
    (normalizedEmail !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
  ) {
    res.status(400).json({ error: 'Enter a valid name, phone number, email, and status.' });
    return;
  }
  const { rows: [created] } = await query(
    'INSERT INTO members(full_name,phone,email,status) VALUES($1,$2,$3,$4) RETURNING *',
    [full_name.trim(), phone.trim(), normalizedEmail, status]
  );
  res.status(201).json(created);
}));

app.put('/api/members/:id', asyncRoute(async (req, res) => {
  const id = integer(String(req.params.id));
  const { full_name, phone, email, status } = req.body ?? {};
  const normalizedEmail = optionalText(email);
  if (
    !id || typeof full_name !== 'string' || full_name.trim().length < 2 ||
    typeof phone !== 'string' || phone.trim().length < 7 ||
    !['active', 'inactive'].includes(status) ||
    (email !== undefined && email !== null && typeof email !== 'string') ||
    (normalizedEmail !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
  ) {
    res.status(400).json({ error: 'Enter valid member details.' });
    return;
  }
  const { rows } = await query(
    'UPDATE members SET full_name=$1,phone=$2,email=$3,status=$4 WHERE id=$5 RETURNING *',
    [full_name.trim(), phone.trim(), normalizedEmail, status, id]
  );
  if (!rows[0]) {
    res.status(404).json({ error: 'Member not found.' });
    return;
  }
  res.json(rows[0]);
}));

app.delete('/api/members/:id', asyncRoute(async (req, res) => {
  const id = integer(String(req.params.id));
  if (!id) {
    res.status(400).json({ error: 'Invalid member id.' });
    return;
  }
  const result = await query('DELETE FROM members WHERE id=$1', [id]);
  if (!result.rowCount) {
    res.status(404).json({ error: 'Member not found.' });
    return;
  }
  res.status(204).end();
}));

app.get('/api/plans', sendRows('SELECT * FROM membership_plans ORDER BY price'));
app.post('/api/plans', asyncRoute(async (req, res) => {
  const { name, price, duration_days, description } = req.body ?? {};
  const parsedPrice = Number(price);
  const parsedDuration = Number(duration_days);
  if (
    typeof name !== 'string' || !name.trim() ||
    !Number.isFinite(parsedPrice) || parsedPrice <= 0 ||
    !Number.isSafeInteger(parsedDuration) || parsedDuration < 1 || parsedDuration > 3650 ||
    (description !== undefined && description !== null && typeof description !== 'string')
  ) {
    res.status(400).json({ error: 'Enter a valid plan name, price, and duration.' });
    return;
  }
  const { rows: [created] } = await query(
    'INSERT INTO membership_plans(name,price,duration_days,description) VALUES($1,$2,$3,$4) RETURNING *',
    [name.trim(), parsedPrice, parsedDuration, optionalText(description)]
  );
  res.status(201).json(created);
}));

app.get('/api/memberships', sendRows(`SELECT ms.*,m.full_name,p.name AS plan_name,p.price
  FROM memberships ms
  JOIN members m ON m.id=ms.member_id
  JOIN membership_plans p ON p.id=ms.plan_id
  ORDER BY ms.id DESC`));
app.post('/api/memberships', asyncRoute(async (req, res) => {
  const memberId = integer(String(req.body?.member_id ?? ''));
  const planId = integer(String(req.body?.plan_id ?? ''));
  const start = date(req.body?.start_date);
  const end = date(req.body?.end_date);
  if (!memberId || !planId || !start || !end || end < start) {
    res.status(400).json({ error: 'Select a member, plan, and valid dates.' });
    return;
  }
  const { rows: [created] } = await query(
    'INSERT INTO memberships(member_id,plan_id,start_date,end_date) VALUES($1,$2,$3,$4) RETURNING *',
    [memberId, planId, start, end]
  );
  res.status(201).json(created);
}));

app.get('/api/attendance', sendRows(`SELECT a.*,m.full_name
  FROM attendance a JOIN members m ON m.id=a.member_id
  ORDER BY a.check_in_date DESC,a.check_in_at DESC LIMIT 100`));
app.post('/api/attendance', asyncRoute(async (req, res) => {
  const memberId = integer(String(req.body?.member_id ?? ''));
  const requestedDate = req.body?.check_in_date;
  const checkInDate = requestedDate === undefined ? null : date(requestedDate);
  if (!memberId || (requestedDate !== undefined && !checkInDate)) {
    res.status(400).json({ error: 'Select a member and a valid check-in date.' });
    return;
  }
  const { rows: [created] } = checkInDate
    ? await query(
      'INSERT INTO attendance(member_id,check_in_date) VALUES($1,$2) RETURNING *',
      [memberId, checkInDate]
    )
    : await query('INSERT INTO attendance(member_id) VALUES($1) RETURNING *', [memberId]);
  res.status(201).json(created);
}));

app.get('/api/payments', sendRows(`SELECT pay.*,m.full_name,p.name AS plan_name
  FROM payments pay
  JOIN members m ON m.id=pay.member_id
  JOIN memberships ms ON ms.id=pay.membership_id
  JOIN membership_plans p ON p.id=ms.plan_id
  ORDER BY pay.payment_date DESC,pay.id DESC`));
app.post('/api/payments', asyncRoute(async (req, res) => {
  const memberId = integer(String(req.body?.member_id ?? ''));
  const membershipId = integer(String(req.body?.membership_id ?? ''));
  const amount = Number(req.body?.amount);
  const requestedDate = req.body?.payment_date;
  const paymentDate = requestedDate === undefined ? null : date(requestedDate);
  const method = req.body?.method ?? 'cash';
  if (
    !memberId || !membershipId || !Number.isFinite(amount) || amount <= 0 ||
    (requestedDate !== undefined && !paymentDate) ||
    !['cash', 'upi', 'card', 'bank'].includes(method)
  ) {
    res.status(400).json({ error: 'Enter valid payment details.' });
    return;
  }
  const { rows: [created] } = paymentDate
    ? await query(
      'INSERT INTO payments(member_id,membership_id,amount,payment_date,method) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [memberId, membershipId, amount, paymentDate, method]
    )
    : await query(
      'INSERT INTO payments(member_id,membership_id,amount,method) VALUES($1,$2,$3,$4) RETURNING *',
      [memberId, membershipId, amount, method]
    );
  res.status(201).json(created);
}));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

app.use((err: RequestError, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.code ?? 'SERVER_ERROR', err.message);
  const messages: Record<string, string> = {
    '23505': 'This record already exists or a duplicate check-in is not allowed.',
    '23503': 'The selected related record does not exist or deletion is blocked by its history.',
    '23514': 'The submitted value violates a database rule.'
  };
  const status = err.code === '23505'
    ? 409
    : err.code?.startsWith('23') || err.code?.startsWith('22')
      ? 400
      : err.status === 413
        ? 413
        : err.status === 400
          ? 400
          : 500;
  res.status(status).json({
    error: messages[err.code ?? ''] ?? (status === 413
      ? 'Request body is too large.'
      : status === 400
        ? 'Request body must contain valid JSON and data.'
        : status === 500
          ? 'Server error. Check the database connection and try again.'
          : 'The submitted data is invalid.')
  });
});

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
app.use(express.static(dist));
app.get('{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => console.log(`FitTrack API running on port ${port}`));

const shutdown = () => {
  server.close(() => {
    void pool.end();
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
