require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { ccpApiUrl, ccpHeaders } = require('../utils/ccpConfig');
const { persistCcpLead, persistCcpClient, normalizeCompanyIdentity, resolveLocalLead } = require('../services/crmRecordPersistence');
const { resolveCrmRelationships } = require('../services/crmRelationships');
const Lead = require('../models/Lead');
const Client = require('../models/Client');
const Quotation = require('../models/Quotation');
const ProformaInvoice = require('../models/ProformaInvoice');

function rows(payload, key) {
  if (Array.isArray(payload)) return payload;
  for (const value of [payload?.[key], payload?.data?.[key], payload?.data, payload?.items, payload?.rows]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

async function fetchCollection(resource) {
  const response = await fetch(ccpApiUrl(`ccp/${resource}`), { headers: ccpHeaders() });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || `CCP ${resource} returned ${response.status}`);
  return rows(payload, resource);
}

async function backfillCollection(sourceRows, type) {
  const summary = { total: sourceRows.length, saved: 0, failed: 0 };
  const failures = [];
  for (const row of sourceRows) {
    try {
      if (type === 'lead') await persistCcpLead({ requestPayload: row, responsePayload: { lead: row } });
      else await persistCcpClient({ requestPayload: row, responsePayload: { client: row } });
      summary.saved += 1;
    } catch (error) {
      summary.failed += 1;
      failures.push({
        id: String(row?._id || row?.id || row?.uniqueId || ''),
        error: error.message || 'Unknown persistence error'
      });
    }
  }
  return { summary, failures };
}

async function backfillLocalRelationships() {
  const summary = { leads: 0, clients: 0, quotations: 0, proformaInvoices: 0 };
  const localLeads = await Lead.find().select('_id company companyIdentity').lean();
  for (const lead of localLeads) {
    const companyIdentity = normalizeCompanyIdentity(lead.company);
    if (companyIdentity && companyIdentity !== lead.companyIdentity) {
      await Lead.updateOne({ _id: lead._id }, { $set: { companyIdentity } });
      summary.leads += 1;
    }
  }

  const localClients = await Client.find().select('_id selectedLead selectedLeadCcpId companyIdentity data').lean();
  for (const client of localClients) {
    const company = client.data?.basic?.clientLegalName || client.data?.companyOverview?.companyName || client.data?.importMeta?.companyName;
    const selectedIdentity = client.selectedLeadCcpId || client.data?.importMeta?.leadNumber || client.selectedLead;
    const localLead = await resolveLocalLead(selectedIdentity);
    const update = {
      companyIdentity: normalizeCompanyIdentity(company),
      ...(localLead?._id ? { selectedLead: localLead._id } : {}),
      ...(localLead?.ccpLeadId ? { selectedLeadCcpId: localLead.ccpLeadId } : {})
    };
    await Client.updateOne({ _id: client._id }, { $set: update });
    summary.clients += 1;
  }

  const quotations = await Quotation.find().select('_id leadId companyName').lean();
  for (const quotation of quotations) {
    const relationships = await resolveCrmRelationships(quotation);
    if (Object.keys(relationships).length) {
      await Quotation.updateOne({ _id: quotation._id }, { $set: relationships });
      summary.quotations += 1;
    }
  }
  const invoices = await ProformaInvoice.find().select('_id quotationId leadId companyName').lean();
  for (const invoice of invoices) {
    const quotation = invoice.quotationId
      ? await Quotation.findById(invoice.quotationId).select('leadRef clientRef').lean()
      : null;
    const relationships = {
      ...await resolveCrmRelationships(invoice),
      ...(quotation?.leadRef ? { leadRef: quotation.leadRef } : {}),
      ...(quotation?.clientRef ? { clientRef: quotation.clientRef } : {})
    };
    if (Object.keys(relationships).length) {
      await ProformaInvoice.updateOne({ _id: invoice._id }, { $set: relationships });
      summary.proformaInvoices += 1;
    }
  }
  return summary;
}

async function main() {
  await connectDB();
  const [leads, clients] = await Promise.all([fetchCollection('leads'), fetchCollection('clients')]);
  const leadResult = await backfillCollection(leads, 'lead');
  const clientResult = await backfillCollection(clients, 'client');
  const localRelationships = await backfillLocalRelationships();
  console.log(JSON.stringify({ leads: leadResult.summary, clients: clientResult.summary, localRelationships }, null, 2));
  if (leadResult.failures.length || clientResult.failures.length) {
    console.error(JSON.stringify({ leadFailures: leadResult.failures, clientFailures: clientResult.failures }, null, 2));
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`CCP to CRM backfill failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
