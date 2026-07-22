const ProformaInvoice = require('../models/ProformaInvoice');
const Quotation = require('../models/Quotation');

const text = (value) => String(value || '').trim();
const money = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0;

async function nextProformaNumber() {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fy = `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
  const latest = await ProformaInvoice.findOne({ proformaNumber: new RegExp(`^PI/${fy}/\\d+$`, 'i') })
    .sort({ createdAt: -1 }).select('proformaNumber').lean();
  const sequence = (Number.parseInt(String(latest?.proformaNumber || '').split('/').pop(), 10) || 0) + 1;
  return `PI/${fy}/${String(sequence).padStart(3, '0')}`;
}

function cleanPayload(body = {}) {
  const leadDetails = body.leadDetails && typeof body.leadDetails === 'object' ? body.leadDetails : {};
  const items = (Array.isArray(body.items) ? body.items : []).map((item) => ({
    serviceCategory: text(item.serviceCategory), servicesForYear: text(item.servicesForYear),
    eprCategory: text(item.eprCategory), piboParent: text(item.piboParent),
    piboCategory: text(item.piboCategory), unit: text(item.unit), basicAmount: money(item.basicAmount)
  })).filter((item) => item.serviceCategory || item.piboCategory || item.basicAmount);
  const calculated = items.reduce((sum, item) => sum + ((Number(item.unit) || 1) * item.basicAmount), 0);
  return {
    quotationId: body.quotationId || undefined, quotationNumber: text(body.quotationNumber), poNumber: text(body.poNumber),
    leadId: text(body.leadId), leadCode: text(body.leadCode), companyName: text(body.companyName || leadDetails.companyName),
    leadDetails, invoiceDate: body.invoiceDate || new Date(), validUntil: text(body.validUntil), items,
    terms: (Array.isArray(body.terms) ? body.terms : String(body.terms || '').split(/\r?\n/)).map(text).filter(Boolean),
    subtotal: money(body.subtotal || calculated), grandTotal: money(body.grandTotal || calculated),
    status: ['draft', 'issued', 'cancelled'].includes(body.status) ? body.status : 'issued'
  };
}

exports.list = async (req, res) => {
  const rows = await ProformaInvoice.find().populate('createdBy', 'name email').sort({ createdAt: -1 }).lean();
  return res.json({ ok: true, proformaInvoices: rows });
};

exports.create = async (req, res) => {
  const payload = cleanPayload(req.body);
  if (!payload.companyName) return res.status(400).json({ error: 'Company Name is required.' });
  if (!payload.poNumber) return res.status(400).json({ error: 'PO Number is required.' });
  if (!payload.quotationNumber) return res.status(400).json({ error: 'Quotation Number is required.' });
  if (!payload.items.length) return res.status(400).json({ error: 'At least one invoice item is required.' });
  if (payload.quotationId) {
    const quotation = await Quotation.findById(payload.quotationId).select('_id quotationNumber').lean();
    if (!quotation) return res.status(400).json({ error: 'Selected quotation was not found.' });
    payload.quotationNumber = quotation.quotationNumber;
  }
  const row = await ProformaInvoice.create({ ...payload, proformaNumber: await nextProformaNumber(), createdBy: req.user?._id });
  await row.populate('createdBy', 'name email');
  return res.status(201).json({ ok: true, proformaInvoice: row });
};

exports.update = async (req, res) => {
  const row = await ProformaInvoice.findById(req.params.id);
  if (!row) return res.status(404).json({ error: 'Proforma Invoice not found.' });
  const payload = cleanPayload(req.body);
  if (!payload.companyName || !payload.poNumber || !payload.quotationNumber || !payload.items.length) {
    return res.status(400).json({ error: 'Company, PO Number, Quotation Number and at least one item are required.' });
  }
  Object.assign(row, payload);
  await row.save();
  return res.json({ ok: true, proformaInvoice: row });
};

exports._test = { cleanPayload };
