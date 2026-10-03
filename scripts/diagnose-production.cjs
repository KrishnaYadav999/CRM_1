// Read-only runtime diagnostics. Never print environment values, tokens or documents.
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const root = path.resolve(process.argv[2] || '.');
const backend = path.join(root, 'backend');
const appRequire = createRequire(path.join(backend, 'package.json'));
appRequire('dotenv').config({ path: path.join(backend, '.env'), quiet: true });
const mongoose = appRequire('mongoose');
const report = (value) => console.log(JSON.stringify(value));
async function measure(name, run) {
  const start = Date.now();
  try { const result = await run(); report({ check: name, ms: Date.now() - start, ...result }); }
  catch (error) { report({ check: name, ms: Date.now() - start, error: error.name, code: error.code }); }
}
(async () => {
  try {
    const processList = spawnSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    if (processList.status === 0) {
      for (const process of JSON.parse(processList.stdout)) {
        if (!String(process.name).includes('crm')) continue;
        report({ check: 'process', name: process.name, status: process.pm2_env?.status, restarts: process.pm2_env?.restart_time, memoryMB: Math.round((process.monit?.memory || 0) / 1048576) });
        const logPath = process.pm2_env?.pm_err_log_path;
        if (logPath && fs.existsSync(logPath)) {
          const fd = fs.openSync(logPath, 'r');
          const length = fs.fstatSync(fd).size;
          const buffer = Buffer.alloc(Math.min(length, 128 * 1024));
          fs.readSync(fd, buffer, 0, buffer.length, Math.max(0, length - buffer.length)); fs.closeSync(fd);
          const log = buffer.toString();
          report({ check: 'recent-error-types', counts: Object.fromEntries(['MongoServerSelectionError', 'MongoNetworkError', 'MongoPoolClearedError', 'MongooseError', 'MongoServerError', 'CastError', 'ReferenceError', 'TypeError', 'overall-dashboard'].map((name) => [name, log.split(name).length - 1])) });
        }
      }
    }
    await mongoose.connect(appRequire('./src/config/db').__test.buildMongoUri(), { dbName: process.env.DB_NAME || 'registerd_types', autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
    await measure('authentication-user-query', async () => ({ found: Boolean(await appRequire('./src/models/User').findOne({ isActive: { $ne: false } }).select('_id').maxTimeMS(10000).lean()) }));
    await measure('overall-dashboard', async () => {
      const { loadOverallRecords } = appRequire('./src/services/overallDashboardData');
      const { buildOverall } = appRequire('./src/services/overallDashboard');
      const { buildUserSections } = appRequire('./src/services/overallDashboardUsers');
      const [records, users, teams, requests] = await Promise.all([
        loadOverallRecords(appRequire('./src/models/Lead'), {}, null),
        appRequire('./src/models/User').find({ isActive: { $ne: false } }).select('_id crmUserId name email role roles managerId teamId').maxTimeMS(10000).lean(),
        appRequire('./src/models/Team').find({}).select('_id manager members').maxTimeMS(10000).lean(),
        appRequire('./src/models/ClientDeactivation').find({ status: 'INACTIVE' }).select('companyKey status').maxTimeMS(10000).lean()
      ]);
      const result = buildOverall(records, requests);
      return { closedRecords: records.length, clients: result.portfolioSummary.clients, users: buildUserSections(records, requests, users, teams).length };
    });
  } catch (error) { report({ check: 'connection', error: error.name, code: error.code }); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
})();
