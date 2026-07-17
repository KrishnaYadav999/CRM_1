const mongoose = require('mongoose');

const QuoteLeadDetailsSchema = new mongoose.Schema({
  referredBy: { type: String, trim: true },
  salutation: { type: String, trim: true },
  contactPerson: { type: String, trim: true },
  designation: { type: String, trim: true },
  mobileNo1: { type: String, trim: true },
  mobileNo2: { type: String, trim: true },
  companyName: { type: String, trim: true },
  addressLine1: { type: String, trim: true },
  addressLine2: { type: String, trim: true },
  addressLine3: { type: String, trim: true },
  state: { type: String, trim: true },
  city: { type: String, trim: true },
  pinCode: { type: String, trim: true },
  gstNumber: { type: String, trim: true, uppercase: true, maxlength: 15 }
}, { _id: false });

const QuoteItemSchema = new mongoose.Schema({
  id: { type: String, trim: true },
  serviceCategory: { type: String, trim: true },
  servicesForYear: { type: String, trim: true },
  eprCategory: { type: String, trim: true },
  piboCategory: { type: String, trim: true },
  unit: { type: String, trim: true },
  unitLabel: { type: String, trim: true },
  basicAmount: { type: Number, default: 0 }
}, { _id: false });

const QuotationSchema = new mongoose.Schema({
  quotationNumber: { type: String, trim: true, index: true },
  leadId: { type: String, trim: true, index: true },
  ccpQuotationId: { type: String, trim: true, unique: true, sparse: true },
  ccpLeadId: { type: String, trim: true, index: true },
  leadCode: { type: String, trim: true },
  companyName: { type: String, trim: true },
  leadDetails: { type: QuoteLeadDetailsSchema, default: {} },
  quotationDate: { type: Date },
  validUntil: { type: String, trim: true },
  items: { type: [QuoteItemSchema], default: [] },
  terms: { type: [String], default: [] },
  subtotal: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'submitted', 'sent', 'approved', 'rejected'], default: 'draft', index: true },
  source: { type: String, trim: true, default: 'crm', index: true },
  ccpSource: { type: String, trim: true },
  ccpCreatedAt: { type: Date },
  ccpUpdatedAt: { type: Date },
  lastSyncedAt: { type: Date },
  syncMatchStatus: { type: String, enum: ['matched', 'unmatched'], default: 'matched', index: true },
  unmatchedReason: { type: String, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

QuotationSchema.index(
  { leadId: 1, quotationNumber: 1 },
  { unique: true, partialFilterExpression: { leadId: { $type: 'string' }, quotationNumber: { $type: 'string' } } }
);

module.exports = mongoose.model('Quotation', QuotationSchema);
