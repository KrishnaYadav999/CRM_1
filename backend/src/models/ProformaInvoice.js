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

const ProformaInvoiceSchema = new mongoose.Schema({
  proformaNumber: { type: String, required: true, unique: true, index: true, trim: true },
  quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', index: true },
  quotationNumber: { type: String, trim: true, index: true },
  poNumber: { type: String, trim: true, index: true },
  leadId: { type: String, trim: true },
  leadCode: { type: String, trim: true },
  companyName: { type: String, required: true, trim: true, index: true },
  leadDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
  invoiceDate: { type: Date, default: Date.now },
  validUntil: { type: String, trim: true },
  items: { type: [ProformaItemSchema], default: [] },
  terms: { type: [String], default: [] },
  subtotal: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'issued', 'cancelled'], default: 'issued', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('ProformaInvoice', ProformaInvoiceSchema);
