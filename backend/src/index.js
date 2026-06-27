require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const authController = require('./controllers/authController');
const authRoutes = require('./routes/auth');
const leadRoutes = require('./routes/leads');
const clientRoutes = require('./routes/clients');
const quotationRoutes = require('./routes/quotations');
const annualReturnRoutes = require('./routes/annualReturns');
const notificationRoutes = require('./routes/notifications');
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

let schedulerStarted = false;
let dbReady;

function connectAndStartServices() {
  dbReady = connectDB().then(() => {
    if (!schedulerStarted) {
      startPendingApprovalReminderScheduler();
      schedulerStarted = true;
    }
  });
  return dbReady;
}

connectAndStartServices().catch((err) => {
  console.error('Database startup failed', err);
});

app.use('/api', async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState !== 2) connectAndStartServices();
      await dbReady;
    }
  } catch (err) {
    return res.status(503).json({
      error: 'Database unavailable. Please check MongoDB Atlas connection.',
      message: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  }
  return next();
});

function requireCcpSecret(req, res, next) {
  const expectedSecret = process.env.CCP_SHARED_SECRET;
  if (!expectedSecret) return next();

  const providedSecret = req.get('x-ccp-secret') || req.query.secret;
  if (providedSecret !== expectedSecret) {
    return res.status(401).json({ ok: false, error: 'Invalid CCP secret' });
  }

  return next();
}

app.post('/api/crm/users/sync', requireCcpSecret, authController.syncUserFromCcp);
app.use('/api/auth', authRoutes);
app.use('/api/ccp', ccpRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/annual-returns', annualReturnRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/teams', teamRoutes);

app.get('/', (req, res) => res.send({ ok: true, env: process.env.NODE_ENV }));

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
