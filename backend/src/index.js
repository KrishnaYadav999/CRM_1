require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const leadRoutes = require('./routes/leads');
const clientRoutes = require('./routes/clients');
const quotationRoutes = require('./routes/quotations');
const proformaInvoiceRoutes = require('./routes/proformaInvoices');
const annualReturnRoutes = require('./routes/annualReturns');
const notificationRoutes = require('./routes/notifications');
const assetRoutes = require('./routes/assets');
const teamRoutes = require('./routes/teams');
const calendarItemRoutes = require('./routes/calendarItems');
const supportTicketRoutes = require('./routes/supportTickets');
const complianceIntegrationRoutes = require('./routes/complianceIntegration');
const { startPendingApprovalReminderScheduler } = require('./services/pendingApprovalNotifications');
const { startClientOnboardingReminderScheduler, runClientOnboardingReminders } = require('./services/clientOnboardingReminders');
const { startLeadWorkflowReminderScheduler } = require('./services/leadWorkflowReminders');
const { startStaffOnboardingWorkflowScheduler } = require('./services/staffOnboardingWorkflow');
const { startLeadServiceApprovalReminderScheduler, runLeadServiceApprovalReminders } = require('./services/leadServiceApprovalReminders');
const { startProvisionalLeadClosureScheduler } = require('./services/provisionalLeadClosureWorkflow');
const { applyKnownDataCorrections } = require('./services/knownDataCorrections');

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
  dbReady = connectDB().then(async () => {
    await applyKnownDataCorrections().catch((error) => console.error('Known CRM data correction failed', error));
    if (!schedulerStarted) {
      startPendingApprovalReminderScheduler();
      startClientOnboardingReminderScheduler();
      startLeadWorkflowReminderScheduler();
      startStaffOnboardingWorkflowScheduler();
      startLeadServiceApprovalReminderScheduler();
      startProvisionalLeadClosureScheduler();
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

app.get('/api/internal/client-onboarding-reminders', async (req, res) => {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const authorization = String(req.get('authorization') || '').trim();
  if (!cronSecret) return res.status(503).json({ ok: false, error: 'CRON_SECRET is not configured' });
  if (authorization !== `Bearer ${cronSecret}`) return res.status(401).json({ ok: false, error: 'Unauthorized cron request' });
  try { return res.json({ ok: true, ...(await runClientOnboardingReminders()) }); }
  catch (error) { return res.status(500).json({ ok: false, error: error.message || 'Reminder run failed' }); }
});
app.get('/api/internal/lead-service-approval-reminders', async (req, res) => {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const authorization = String(req.get('authorization') || '').trim();
  if (!cronSecret) return res.status(503).json({ ok: false, error: 'CRON_SECRET is not configured' });
  if (authorization !== `Bearer ${cronSecret}`) return res.status(401).json({ ok: false, error: 'Unauthorized cron request' });
  try { return res.json({ ok: true, ...(await runLeadServiceApprovalReminders()) }); }
  catch (error) { return res.status(500).json({ ok: false, error: error.message || 'Service approval reminder run failed' }); }
});
  app.use('/api/auth', authRoutes);
  app.use('/api/assets', assetRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/proforma-invoices', proformaInvoiceRoutes);
app.use('/api/annual-returns', annualReturnRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/calendar-items', calendarItemRoutes);
app.use('/api/support-tickets', supportTicketRoutes);
app.use('/api/integrations/compliance', complianceIntegrationRoutes);

app.get('/', (req, res) => res.send({ ok: true, env: process.env.NODE_ENV }));

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
