const User = require('../models/User');
const UserSession = require('../models/UserSession');
const AuditLog = require('../models/AuditLog');
const Lead = require('../models/Lead');
const SupportTicket = require('../models/SupportTicket');
const Client = require('../models/Client');
const { completeness } = require('./clientOnboardingReminders');

const ONLINE_WINDOW_MS = 15 * 60 * 1000;

function reportDateRange(from, to) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const startLabel = /^\d{4}-\d{2}-\d{2}$/.test(String(from || '')) ? String(from) : today;
  const endLabel = /^\d{4}-\d{2}-\d{2}$/.test(String(to || '')) ? String(to) : startLabel;
  const start = new Date(`${startLabel}T00:00:00.000+05:30`);
  const end = new Date(`${endLabel}T23:59:59.999+05:30`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    const error = new Error('Please select a valid report date range');
    error.statusCode = 400;
    throw error;
  }
  return { from: startLabel, to: endLabel, start, end };
}

function productivityScore(row) {
  const focus = row.openSeconds ? Math.min(50, Math.round((row.activeSeconds / row.openSeconds) * 50)) : 0;
  const activity = Math.min(25, Math.round(Math.log10(row.activityCount + 1) * 10));
  const output = Math.min(25, row.closedLeads * 3);
  return Math.min(100, focus + activity + output);
}

function riskForUser(row, now = new Date()) {
  if (!row.active) return { key: 'inactive', level: 'High Risk', reason: 'Inactive account', rank: 4 };
  if (!row.lastLogin) return { key: 'never', level: 'Never Logged In', reason: 'No successful CRM login recorded', rank: 5 };
  const staleDays = Math.floor((now.getTime() - new Date(row.lastLogin).getTime()) / 86400000);
  if (staleDays >= 7) return { key: 'stale', level: 'Medium Risk', reason: `${staleDays} days since last login`, rank: 3 };
  if (row.openSeconds > 1800 && row.awayRatio >= 0.7) return { key: 'away', level: 'High Risk', reason: 'High away ratio', rank: 2 };
  return { key: 'healthy', level: 'Low Risk', reason: 'No activity risk detected', rank: 1 };
}

function indiaDateKey(value) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(value));
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function buildDailyTimeline(sessions, activities) {
  const groups = new Map();
  sessions.forEach((session) => {
    const date = indiaDateKey(session.loginAt || session.lastActivityAt);
    if (!date) return;
    const endAt = session.logoutAt || session.lastActivityAt || session.loginAt;
    const current = groups.get(date) || { date, firstLogin: session.loginAt, lastSeen: endAt, activeSeconds: 0, awaySeconds: 0, actions: 0, modules: new Set() };
    if (new Date(session.loginAt) < new Date(current.firstLogin)) current.firstLogin = session.loginAt;
    if (new Date(endAt) > new Date(current.lastSeen)) current.lastSeen = endAt;
    const openSeconds = Math.max(0, Math.round((new Date(endAt) - new Date(session.loginAt)) / 1000));
    current.activeSeconds += Math.max(0, Number(session.activeSeconds) || 0);
    current.awaySeconds += Math.max(0, openSeconds - (Number(session.activeSeconds) || 0));
    groups.set(date, current);
  });
  activities.forEach((activity) => {
    const date = indiaDateKey(activity.occurredAt);
    if (!groups.has(date)) groups.set(date, { date, firstLogin: null, lastSeen: activity.occurredAt, activeSeconds: 0, awaySeconds: 0, actions: 0, modules: new Set() });
    const current = groups.get(date);
    current.actions += 1;
    if (activity.module) current.modules.add(activity.module);
    if (!current.lastSeen || new Date(activity.occurredAt) > new Date(current.lastSeen)) current.lastSeen = activity.occurredAt;
  });
  return [...groups.values()].map((row) => ({ ...row, modules: [...row.modules].sort() })).sort((a, b) => b.date.localeCompare(a.date));
}

function buildUserProductivityReport({ users, sessions, activities, leads, ticketStats, period, now = new Date() }) {
  const byUser = (items, field) => items.reduce((map, item) => {
    const key = String(item[field] || '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
    return map;
  }, new Map());
  const sessionsByUser = byUser(sessions, 'userId');
  const activitiesByUser = byUser(activities, 'userId');
  const leadsByUser = byUser(leads, 'createdBy');
  const ticketByUser = new Map(ticketStats.map((item) => [String(item._id || ''), {
    total: Number(item.total) || 0, open: Number(item.open) || 0, resolved: Number(item.resolved) || 0
  }]));

  const rows = users.map((user) => {
    const id = String(user._id);
    const ownSessions = sessionsByUser.get(id) || [];
    const ownActivities = activitiesByUser.get(id) || [];
    const ownLeads = leadsByUser.get(id) || [];
    const sortedSessions = [...ownSessions].sort((a, b) => new Date(b.loginAt || 0) - new Date(a.loginAt || 0));
    const latestSession = sortedSessions[0] || null;
    const activeSeconds = ownSessions.reduce((sum, item) => sum + Math.max(0, Number(item.activeSeconds) || 0), 0);
    const openSeconds = ownSessions.reduce((sum, item) => {
      const endAt = item.logoutAt || item.lastActivityAt || item.loginAt;
      return sum + Math.max(0, Math.round((new Date(endAt) - new Date(item.loginAt)) / 1000));
    }, 0);
    const activityCount = ownActivities.length || ownSessions.reduce((sum, item) => sum + Math.max(0, Number(item.activityCount) || 0), 0);
    const awaySeconds = Math.max(0, openSeconds - activeSeconds);
    const online = Boolean(latestSession && !latestSession.logoutAt && now.getTime() - new Date(latestSession.lastActivityAt).getTime() < ONLINE_WINDOW_MS);
    const lastActivity = [...ownActivities.map((item) => item.occurredAt), ...ownSessions.map((item) => item.lastActivityAt), user.lastLogin]
      .filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
    const closedLeads = ownLeads.filter((lead) => lead.closedBy || lead.closedAt || /closed/i.test(String(lead.status || ''))).length;
    const row = {
      id: user._id, name: user.name || user.email || 'Unnamed user', email: user.email || '', role: user.role || '', team: user.team || '',
      active: user.isActive !== false, lastLogin: user.lastLogin || null, lastActivity,
      totalLeads: ownLeads.length, closedLeads, openLeads: Math.max(0, ownLeads.length - closedLeads),
      activeSeconds, openSeconds, awaySeconds, activityCount, sessions: ownSessions.length,
      awayRatio: openSeconds ? awaySeconds / openSeconds : 0, online,
      presence: !user.lastLogin ? 'Never Logged In' : online ? (latestSession.presenceState === 'away' ? 'Away' : 'Active') : 'Offline',
      latestAccess: latestSession ? { ipAddress: latestSession.ipAddress || '', device: latestSession.userAgent || '' } : null,
      tickets: ticketByUser.get(id) || { total: 0, open: 0, resolved: 0 },
      recentActions: [...ownActivities].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).slice(0, 12).map((item) => ({
        id: item._id, action: item.action, module: item.module, description: item.description, occurredAt: item.occurredAt, statusCode: item.statusCode
      })),
      timeline: buildDailyTimeline(ownSessions, ownActivities)
    };
    row.score = productivityScore(row);
    row.risk = riskForUser(row, now);
    return row;
  });
  const summary = rows.reduce((result, row) => ({
    totalUsers: result.totalUsers + 1,
    activeUsers: result.activeUsers + (row.active ? 1 : 0),
    onlineNow: result.onlineNow + (row.online ? 1 : 0),
    activeSeconds: result.activeSeconds + row.activeSeconds,
    awaySeconds: result.awaySeconds + row.awaySeconds,
    actions: result.actions + row.activityCount,
    totalLeads: result.totalLeads + row.totalLeads,
    closedLeads: result.closedLeads + row.closedLeads,
    supportTickets: result.supportTickets + row.tickets.total,
    openTickets: result.openTickets + row.tickets.open,
    resolvedTickets: result.resolvedTickets + row.tickets.resolved,
    totalSessions: result.totalSessions + row.sessions
  }), { totalUsers: 0, activeUsers: 0, onlineNow: 0, activeSeconds: 0, awaySeconds: 0, actions: 0, totalLeads: 0, closedLeads: 0, supportTickets: 0, openTickets: 0, resolvedTickets: 0, totalSessions: 0 });
  return { period: { from: period.from, to: period.to }, summary, users: rows.sort((a, b) => b.risk.rank - a.risk.rank || b.score - a.score) };
}

async function getUserProductivityReport({ from, to }) {
  const period = reportDateRange(from, to);
  const [users, sessions, activities, leads, ticketStats] = await Promise.all([
    User.find().select('name email role team isActive lastLogin').lean(),
    UserSession.find({ loginAt: { $gte: period.start, $lte: period.end } }).sort({ loginAt: -1 }).limit(10000).lean(),
    AuditLog.find({ occurredAt: { $gte: period.start, $lte: period.end } }).sort({ occurredAt: -1 }).limit(25000).lean(),
    Lead.find({ createdAt: { $gte: period.start, $lte: period.end } }).select('createdBy status closedBy closedAt createdAt').lean(),
    SupportTicket.aggregate([
      { $match: { createdAt: { $gte: period.start, $lte: period.end } } },
      { $group: {
        _id: '$createdBy', total: { $sum: 1 },
        open: { $sum: { $cond: [{ $in: ['$status', ['Open', 'In Progress']] }, 1, 0] } },
        resolved: { $sum: { $cond: [{ $in: ['$status', ['Resolved', 'Closed']] }, 1, 0] } }
      } }
    ])
  ]);
  return buildUserProductivityReport({ users, sessions, activities, leads, ticketStats, period });
}

function clientSectionAnalysis(data = {}) {
  const ignored = /password|otp|token|secret/i;
  const meaningful = (value) => value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== '');
  const sections = Object.entries(data || {}).filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value)).map(([name, value]) => {
    const fields = Object.entries(value).filter(([key]) => !ignored.test(key));
    const filled = fields.filter(([, item]) => meaningful(item)).length;
    return { name: name.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()), filled, missing: Math.max(0, fields.length - filled), total: fields.length, percentage: fields.length ? Math.round((filled / fields.length) * 100) : 0 };
  });
  return sections.sort((a, b) => b.total - a.total).slice(0, 12);
}

function companyNameFor({ lead, client }) {
  return client?.data?.basic?.clientLegalName || client?.data?.basic?.tradeName || lead?.company || 'Unnamed Company';
}

async function getUserWorkReport({ userId, from, to }) {
  const period = reportDateRange(from, to);
  const user = await User.findById(userId).select('name email role team isActive').lean();
  if (!user) { const error = new Error('User not found'); error.statusCode = 404; throw error; }
  const createdAt = { $gte: period.start, $lte: period.end };
  const [leads, clients] = await Promise.all([
    Lead.find({ createdBy: userId, createdAt }).select('leadCode company companyIdentity status workflowStatus serviceSelections servicesOffered eprCategory createdAt updatedAt').sort({ createdAt: -1 }).lean(),
    Client.find({ createdBy: userId, createdAt }).select('selectedLead companyIdentity data workflowStatus adminControls createdAt updatedAt').sort({ createdAt: -1 }).lean()
  ]);
  const leadById = new Map(leads.map((lead) => [String(lead._id), lead]));
  const clientRows = clients.map((client) => {
    const lead = leadById.get(String(client.selectedLead || ''));
    const required = completeness(client.data || {});
    const sections = clientSectionAnalysis(client.data || {});
    const filled = required.filledCount;
    const total = required.totalCount;
    return { id: client._id, leadId: client.selectedLead, leadCode: lead?.leadCode || '', company: companyNameFor({ lead, client }), status: client.workflowStatus,
      approvalStatus: client.adminControls?.approvalStatus || '', createdAt: client.createdAt, updatedAt: client.updatedAt,
      analysis: { filled, missing: Math.max(0, total - filled), total, percentage: total ? Math.round((filled / total) * 100) : 0, filledFields: required.filledFields, missingFields: required.missingFields, sections } };
  });
  const clientLeadIds = new Set(clientRows.map((row) => String(row.leadId || '')).filter(Boolean));
  const leadRows = leads.map((lead) => ({ id: lead._id, leadCode: lead.leadCode, company: lead.company || 'Unnamed Company', status: lead.status || lead.workflowStatus,
    services: (lead.serviceSelections || []).map((service) => service.servicesOffered || service.service || service.eprCategory).filter(Boolean), createdAt: lead.createdAt, hasClientMaster: clientLeadIds.has(String(lead._id)) }));
  const averageCompletion = clientRows.length ? Math.round(clientRows.reduce((sum, row) => sum + row.analysis.percentage, 0) / clientRows.length) : 0;
  return { period: { from: period.from, to: period.to }, user, summary: { leads: leadRows.length, submittedLeads: leads.filter((lead) => lead.workflowStatus === 'submitted').length,
    clientMasters: clientRows.length, submittedClients: clients.filter((client) => client.workflowStatus === 'submitted').length, averageCompletion,
    completeClients: clientRows.filter((row) => row.analysis.percentage === 100).length, incompleteClients: clientRows.filter((row) => row.analysis.percentage < 100).length }, leads: leadRows, clients: clientRows };
}

module.exports = { getUserProductivityReport, getUserWorkReport, clientSectionAnalysis, buildUserProductivityReport, productivityScore, riskForUser, reportDateRange };
