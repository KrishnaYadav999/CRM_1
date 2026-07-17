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
const ccpIntegrationRoutes = require('./routes/ccpIntegrations');
const teamRoutes = require('./routes/teams');
const calendarItemRoutes = require('./routes/calendarItems');
const { startPendingApprovalReminderScheduler } = require('./services/pendingApprovalNotifications');
const { requireCcpSecret } = require('./middleware/ccpSecret');
const PendingApproval = require('./models/PendingApproval');

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

app.post('/api/crm/users/sync', requireCcpSecret, authController.syncUserFromCcp);
app.post('/api/pending-approvals/ccp/sync', requireCcpSecret, async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.approvals) ? req.body.approvals : [req.body];
    const approvals = [];
    for (const row of rows.filter(Boolean)) {
      const sourceClientId = String(row.sourceClientId || row.ccpApprovalId || row.id || row._id || '').trim();
      if (!sourceClientId) return res.status(400).json({ ok: false, error: 'Each approval requires a stable CCP id' });
      const update = { ...row, source: 'ccp', sourceClientId };
      delete update._id;
      delete update.id;
      delete update.ccpApprovalId;
      approvals.push(await PendingApproval.findOneAndUpdate(
        { type: update.type || 'client', source: 'ccp', sourceClientId },
        { $set: update },
        { new: true, upsert: true, runValidators: true }
      ).lean());
    }
    return res.json({ ok: true, source: 'crm', approvals });
  } catch (error) { return next(error); }
});
app.use('/api/auth', authRoutes);
app.use('/api/ccp', ccpRoutes);
app.use('/api/integrations/ccp', ccpIntegrationRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/annual-returns', annualReturnRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/calendar-items', calendarItemRoutes);

app.get('/', (req, res) => res.send({ ok: true, env: process.env.NODE_ENV }));

const PORT = process.env.PORT || 6000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
