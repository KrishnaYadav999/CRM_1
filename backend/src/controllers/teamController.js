const Team = require('../models/Team');
const User = require('../models/User');

function cleanIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function mapTeam(team) {
  return {
    id: team._id,
    _id: team._id,
    name: team.name,
    description: team.description,
    members: team.members || [],
    manager: team.manager || null,
    operationHead: team.operationHead || null,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt
  };
}

exports.listTeams = async (req, res) => {
  const teams = await Team.find()
    .populate('members', 'name email role avatarUrl isActive')
    .populate('manager', 'name email role avatarUrl isActive')
    .populate('operationHead', 'name email role avatarUrl isActive')
    .sort({ name: 1 })
    .lean();

  res.json({ ok: true, teams: teams.map(mapTeam) });
};

exports.createTeam = async (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  const memberIds = cleanIds(req.body.members);
  const managerId = String(req.body.manager || req.body.managerId || '').trim();
  const operationHeadId = String(req.body.operationHead || req.body.operationHeadId || '').trim();

  if (!name) return res.status(400).json({ error: 'Team name is required' });
  if (!managerId) return res.status(400).json({ error: 'Manager is required' });
  if (!operationHeadId) return res.status(400).json({ error: 'Operation head is required' });

  const existing = await Team.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (existing) return res.status(400).json({ error: 'Team name already exists' });

  const allUserIds = [...new Set([...memberIds, managerId, operationHeadId])];
  const users = await User.find({ _id: { $in: allUserIds }, isActive: true }).select('_id').lean();
  if (users.length !== allUserIds.length) return res.status(400).json({ error: 'Select only active CRM users for this team' });

  const team = await Team.create({
    name,
    description,
    members: memberIds,
    manager: managerId,
    operationHead: operationHeadId,
    createdBy: req.user?._id
  });

  await User.updateMany(
    { _id: { $in: memberIds } },
    { $set: { teamId: team._id, team: name, managerId, operationHeadId } }
  );
  await User.findByIdAndUpdate(managerId, { $set: { teamId: team._id, team: name, operationHeadId } });
  await User.findByIdAndUpdate(operationHeadId, { $set: { teamId: team._id, team: name } });

  const populated = await Team.findById(team._id)
    .populate('members', 'name email role avatarUrl isActive')
    .populate('manager', 'name email role avatarUrl isActive')
    .populate('operationHead', 'name email role avatarUrl isActive')
    .lean();

  res.status(201).json({ ok: true, team: mapTeam(populated) });
};
