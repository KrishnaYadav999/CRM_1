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
  pinCode: { type: String, trim: true }
}, { _id: false });

const QuoteItemSchema = new mongoose.Schema({
  serviceCategory: { type: String, trim: true },
  servicesForYear: { type: String, trim: true },
  eprCategory: { type: String, trim: true },
  piboCategory: { type: String, trim: true },
  unit: { type: String, trim: true },
  basicAmount: { type: Number, default: 0 }
}, { _id: false });

const QuotationSchema = new mongoose.Schema({
  quotationNumber: { type: String, trim: true, unique: true, sparse: true },
  leadId: { type: String, trim: true, index: true },
  leadCode: { type: String, trim: true },
  leadDetails: { type: QuoteLeadDetailsSchema, default: {} },
  validUntil: { type: String, trim: true },
  items: { type: [QuoteItemSchema], default: [] },
  terms: { type: [String], default: [] },
  status: { type: String, enum: ['draft', 'sent', 'approved', 'rejected'], default: 'draft', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Quotation', QuotationSchema);
