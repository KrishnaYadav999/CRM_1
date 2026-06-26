require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const leadRoutes = require('./routes/leads');
const clientRoutes = require('./routes/clients');
const quotationRoutes = require('./routes/quotations');
const annualReturnRoutes = require('./routes/annualReturns');
const ccpRoutes = require('./routes/ccp');
const teamRoutes = require('./routes/teams');
const { startPendingApprovalReminderScheduler } = require('./services/pendingApprovalNotifications');

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection', err);
});

const app = express();
app.use(express.json({ limit: '3mb' }));

const allowedOrigins = String(process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length
    ? (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin))
    : '*'
}));

const dbReady = connectDB().then(() => {
  startPendingApprovalReminderScheduler();
}).catch((err) => {
  console.error('Database startup failed', err);
});

app.use('/api', async (req, res, next) => {
  await dbReady;
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database unavailable. Please check MongoDB Atlas connection.' });
  }
  return next();
});

app.use('/api/auth', authRoutes);
app.use('/api/ccp', ccpRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/annual-returns', annualReturnRoutes);
app.use('/api/teams', teamRoutes);

app.get('/', (req, res) => res.send({ ok: true, env: process.env.NODE_ENV }));

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
