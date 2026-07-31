const mongoose = require('mongoose');

const ProformaItemSchema = new mongoose.Schema({
  serviceCategory: { type: String, trim: true },
  servicesForYear: { type: String, trim: true },
  eprCategory: { type: String, trim: true },
  piboParent: { type: String, trim: true },
  piboCategory: { type: String, trim: true },
  unit: { type: String, trim: true },
  basicAmount: { type: Number, default: 0 }
}, { _id: false });

const PurchaseOrderYearSchema = new mongoose.Schema({
  fy: { type: String, trim: true },
  annualReturnYear: { type: String, trim: true },
  quotationNo: { type: String, trim: true },
  compliancePoDate: { type: String, trim: true },
  compliancePoFile: { type: String, trim: true },
  serviceCategory: { type: [String], default: [] },
  value: { type: Number, default: 0 }
}, { _id: false });

const ProformaInvoiceSchema = new mongoose.Schema({
  proformaNumber: { type: String, required: true, unique: true, index: true, trim: true },
  quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', index: true },
  leadRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
  clientRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
  quotationNumber: { type: String, trim: true, index: true },
  poNumber: { type: String, trim: true, index: true },
  leadId: { type: String, trim: true },
  leadCode: { type: String, trim: true },
  companyName: { type: String, required: true, trim: true, index: true },
  leadDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
  invoiceDate: { type: Date, default: Date.now },
  validUntil: { type: String, trim: true },
  pricingMode: { type: String, enum: ['combined', 'individual'], default: 'individual' },
  combinedBasicAmount: { type: Number, default: 0 },
  items: { type: [ProformaItemSchema], default: [] },
  poYearCount: { type: Number, min: 0, max: 50, default: 0 },
  poYearRows: { type: [PurchaseOrderYearSchema], default: [] },
  terms: { type: [String], default: [] },
  scopeOfWork: { type: [String], default: [] },
  subtotal: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'issued', 'cancelled'], default: 'issued', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('ProformaInvoice', ProformaInvoiceSchema);
