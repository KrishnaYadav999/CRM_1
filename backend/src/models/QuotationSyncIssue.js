const mongoose = require('mongoose');

const QuotationSyncIssueSchema = new mongoose.Schema({
  ccpQuotationId: { type: String, trim: true, required: true, unique: true },
  ccpLeadId: { type: String, trim: true },
  leadCode: { type: String, trim: true },
  quotationNumber: { type: String, trim: true },
  companyName: { type: String, trim: true },
  reason: { type: String, trim: true, required: true },
  status: { type: String, enum: ['unmatched', 'failed', 'resolved'], default: 'unmatched', index: true },
  lastSeenAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('QuotationSyncIssue', QuotationSyncIssueSchema);
