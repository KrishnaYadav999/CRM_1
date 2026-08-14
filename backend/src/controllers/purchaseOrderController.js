const crypto = require('crypto');
const Lead = require('../models/Lead');
const Client = require('../models/Client');
const Quotation = require('../models/Quotation');

const MIME_BY_EXTENSION = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

const text = (value) => String(value ?? '').trim();
const idText = (value) => text(value?._id ?? value?.id ?? value);

function asIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inferMimeType(fileName, storedMimeType) {
  if (text(storedMimeType)) return text(storedMimeType);
  const extension = text(fileName).toLowerCase().split('.').pop();
  return MIME_BY_EXTENSION[extension] || null;
}

function serviceObject(value) {
  if (value && typeof value === 'object') {
    return { id: idText(value) || null, name: text(value.name || value.label || value.servicesOffered || value.applicableService) };
  }
  return { id: null, name: text(value) };
}

function stablePoId(leadId, assignmentIndex, rowIndex) {
  return `po_${crypto.createHash('sha256').update(`${leadId}:${assignmentIndex}:${rowIndex}`).digest('hex').slice(0, 24)}`;
}

async function leanFind(Model, filter = {}) {
  const query = Model.find(filter);
  return typeof query?.lean === 'function' ? query.lean() : query;
}

function quotationMatchesLead(quotation, lead) {
  const candidates = [quotation.leadRef, quotation.leadId, quotation.leadCode, quotation.businessLeadCode].map(idText).filter(Boolean);
  return candidates.includes(idText(lead)) || candidates.includes(text(lead.leadCode));
}

function resolveQuotation(row, lead, quotations) {
  const rowQuotationId = idText(row.quotationId);
  const rowQuotationNumber = text(row.quotationNumber || row.quotationNo);
  return quotations.find((quotation) => rowQuotationId && idText(quotation) === rowQuotationId)
    || quotations.find((quotation) => rowQuotationNumber && text(quotation.quotationNumber) === rowQuotationNumber)
    || quotations.find((quotation) => quotationMatchesLead(quotation, lead))
    || null;
}

async function loadPurchaseOrders(models) {
  const [leads, clients, quotations] = await Promise.all([
    leanFind(models.Lead, {}), leanFind(models.Client, {}), leanFind(models.Quotation, {})
  ]);
  const clientByLead = new Map();
  for (const client of clients || []) {
    const leadId = idText(client.selectedLead);
    if (leadId && !clientByLead.has(leadId)) clientByLead.set(leadId, idText(client));
  }

  const records = [];
  for (const lead of leads || []) {
    const leadId = idText(lead);
    for (const [assignmentIndex, assignment] of (lead.assignments || []).entries()) {
      for (const [rowIndex, row] of (assignment.poYearRows || []).entries()) {
        if (!text(row.poNumber) && !text(row.poFileUrl)) continue;
        const quotation = resolveQuotation(row, lead, quotations || []);
        const services = (Array.isArray(row.services) ? row.services : [])
          .map(serviceObject).filter((service) => service.name);
        const firstService = services[0] || null;
        const poAmount = Number(row.poAmount);
        const fallbackAmount = Number(quotation?.grandTotal);
        const createdAt = asIso(row.createdAt || lead.createdAt);
        const updatedAt = asIso(row.updatedAt || lead.updatedAt);
        records.push({
          id: stablePoId(leadId, assignmentIndex, rowIndex),
          leadId,
          leadNumber: text(lead.leadCode) || null,
          clientId: clientByLead.get(leadId) || null,
          quotationId: idText(quotation) || idText(row.quotationId) || null,
          quotationNumber: text(row.quotationNumber || row.quotationNo || quotation?.quotationNumber) || null,
          poNumber: text(row.poNumber) || null,
          poAmount: Number.isFinite(poAmount) && poAmount > 0 ? poAmount : (Number.isFinite(fallbackAmount) ? fallbackAmount : null),
          currency: text(row.currency) || 'INR',
          financialYear: text(row.fy) || null,
          services,
          service: firstService,
          poProof: text(row.poFileUrl) ? {
            url: text(row.poFileUrl),
            fileName: text(row.poFileName) || null,
            mimeType: inferMimeType(row.poFileName, row.poFileMimeType),
            size: row.poFileSize !== null && row.poFileSize !== undefined && row.poFileSize !== ''
              && Number.isFinite(Number(row.poFileSize)) && Number(row.poFileSize) >= 0 ? Number(row.poFileSize) : null
          } : null,
          poReceivedDate: asIso(row.poReceivedDate || assignment.closedAt || lead.closedAt || lead.updatedAt),
          createdAt,
          updatedAt
        });
      }
    }
  }
  return records;
}

function createPurchaseOrderController(models = { Lead, Client, Quotation }) {
  return {
    async list(req, res) {
      let records = await loadPurchaseOrders(models);
      const query = req.query || {};
      if (text(query.leadId)) records = records.filter((row) => row.leadId === text(query.leadId));
      if (text(query.clientId)) records = records.filter((row) => row.clientId === text(query.clientId));
      if (text(query.quotationId)) records = records.filter((row) => row.quotationId === text(query.quotationId));
      if (text(query.poNumber)) {
        const needle = text(query.poNumber).toLowerCase();
        records = records.filter((row) => text(row.poNumber).toLowerCase().includes(needle));
      }
      records.sort((left, right) => new Date(right.poReceivedDate || right.updatedAt || 0) - new Date(left.poReceivedDate || left.updatedAt || 0));
      const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
      const total = records.length;
      return res.json({
        success: true,
        message: 'Purchase orders fetched successfully',
        data: records.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0 }
      });
    },

    async getOne(req, res) {
      const record = (await loadPurchaseOrders(models)).find((row) => row.id === text(req.params?.id));
      if (!record) return res.status(404).json({ success: false, message: 'Purchase order not found' });
      return res.json({ success: true, message: 'Purchase order fetched successfully', data: record });
    }
  };
}

module.exports = {
  ...createPurchaseOrderController(), createPurchaseOrderController, loadPurchaseOrders,
  inferMimeType, stablePoId
};
