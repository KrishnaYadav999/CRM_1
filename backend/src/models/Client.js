const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
  selectedLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  selectedLeadCcpId: { type: String, trim: true, index: true },
  ccpClientId: { type: String, trim: true, unique: true, sparse: true, index: true },
  companyIdentity: { type: String, trim: true, index: true },
  adminControls: {
    approvalStatus: { type: String, default: 'PENDING' },
    visibilityStatus: { type: String, default: 'LIVE' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  workflowStatus: { type: String, enum: ['draft', 'submitted'], default: 'draft' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sync: {
    source: { type: String, enum: ['crm', 'ccp', 'crm+ccp'], default: 'crm' },
    status: { type: String, enum: ['synced', 'pending', 'failed'], default: 'synced', index: true },
    lastSyncedAt: { type: Date },
    lastError: { type: String, trim: true }
  },
  ccpSnapshot: { type: mongoose.Schema.Types.Mixed, default: undefined }
}, { timestamps: true });

ClientSchema.index({ companyIdentity: 1, workflowStatus: 1 });

module.exports = mongoose.model('Client', ClientSchema);
