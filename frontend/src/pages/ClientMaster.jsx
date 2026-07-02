import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Clock3, Database, Download, Edit3, Eye, FileCheck2, FileText, FolderCheck, KeyRound, MapPin, Plus, RefreshCw, Save, Search, ShieldCheck, Sparkles, Trash2, Upload, UserRound, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import DashboardShell from '../components/dashboard/DashboardShell';
import ProfileModal from '../components/dashboard/ProfileModal';
import ToastMessage from '../components/ToastMessage';
import { adminRoles } from '../constants/dashboard';
import api from '../services/api';
import { API_ENDPOINTS } from '../services/apiEndpoints';
import { fetchCcpClients, fetchCcpLeads } from '../services/ccpApi';
import ClientDirectoryView from '../features/clientMaster/ClientDirectoryView';
import { selectOptions } from '../features/clientMaster/clientMaster.constants';
import {
  AddressTab,
  Card,
  CpcbTab,
  ComplianceTab,
  ContactsTab,
  CteTab,
  Field,
  SelectLike,
  UploadButton,
  ValidationTab
} from '../features/clientMaster/ClientMasterFormSections';
import {
  annualDraftLegacyKeys,
  buildAnnualReturnYears,
  buildCcpClientEditUrl,
  findClientByRouteKey,
  formatDateInputValue,
  getAnnualDraftAliasValue,
  getAssignedName,
  getClientQuotationContext,
  getClientQuotations,
  getClientUniqueId,
  getFirstAnnualReturnYear,
  getMsmeRows,
  getMsmeSummary,
  getVisibilityStatus,
  mapExcelRowToClient,
  mergeClientSources,
  mergeLeadSources,
  normalizePersonName,
  normalizeFinancialYearLabel,
  openCcpClientEdit,
  readClientData
} from '../features/clientMaster/clientMaster.utils';
import {
  AnnualReturnHistory,
  DetailAccordion,
  EmptyTab,
  annualProcessingTabIds,
  annualProcessingTabLabels,
  formatDisplayDate,
  formatInrValue,
  getAnnualCompletedTabs,
  getAnnualReviewStage,
  getDocumentLinkName,
  getStoredAnnualReturnFiling,
  mapClientDocuments,
  mergeAnnualWorkflowState,
  normalizeAnnualApprovalWorkflow,
  normalizeDocumentUrl,
  normalizeRoleName,
  safeDecode
} from '../features/clientMaster/ClientMasterAnnualReturn';

const tabs = [
  { id: 'basic', label: 'Client Basic Info', icon: Building2 },
  { id: 'address', label: 'Address Details', icon: MapPin },
  { id: 'compliance', label: 'Compliance & MSME', icon: FileCheck2 },
  { id: 'cte', label: 'CTE / CTO / CCA', icon: FolderCheck },
  { id: 'cpcb', label: 'CPCB Details', icon: ShieldCheck },
  { id: 'validation', label: 'Validation Documents', icon: FileText },
  { id: 'contacts', label: 'OTP & People', icon: UserRound }
];

const complianceRows = [
  ['gst', 'GST Number', 'GST Certificate Date', 'GST Certificate'],
  ['cin', 'CIN', 'CIN Document Date', 'CIN Document'],
  ['pan', 'PAN', 'PAN Document Date', 'PAN Document'],
  ['factoryLicense', 'Factory License No', 'Factory License Document Date', 'Factory License Document'],
  ['eprCertificate', 'EPR Certificate No', 'EPR Certificate File Date', 'EPR Certificate File'],
  ['iec', 'IEC Certificate', 'IEC Certificate Date', 'IEC Certificate File'],
  ['dicDcssi', 'DIC/DCSSI Certificate No', 'DIC/DCSSI Certificate Date', 'DIC/DCSSI Certificate File']
];

function normalizeAnnualClientKey(value = '') {
  return String(value || '').trim().toLowerCase();
}

function getAnnualClientMatchKeys(client = {}) {
  const data = readClientData(client);
  const lead = typeof client?.selectedLead === 'object' ? client.selectedLead : {};
  return [
    client?._id,
    client?.id,
    data.importMeta?.ccpClientId,
    data.importMeta?.uniqueId,
    data.importMeta?.leadNumber,
    lead?._id,
    lead?.id,
    lead?.leadCode,
    getClientUniqueId(client)
  ].map(normalizeAnnualClientKey).filter(Boolean);
}

function getAnnualReturnMatchKeys(row = {}) {
  const client = row.client && typeof row.client === 'object' ? row.client : {};
  const clientData = row.clientData && typeof row.clientData === 'object' ? row.clientData : {};
  return [
    row.clientKey,
    row.client,
    client._id,
    client.id,
    clientData.importMeta?.ccpClientId,
    clientData.importMeta?.uniqueId,
    clientData.importMeta?.leadNumber
  ].map(normalizeAnnualClientKey).filter(Boolean);
}

function mapAnnualReturnRecordToFiling(row = {}) {
  return {
    annualYear: row.annualYear,
    status: row.status || row.approvalWorkflow?.status || 'draft',
    activeTab: row.activeTab || '',
    activeSection: row.activeSection || '',
    draft: row.draft || {},
    basicInfo: row.basicInfo || {},
    financials: row.financials || {},
    data: row.data || {},
    brandOwner: row.brandOwner || {},
    importer: row.importer || {},
    annual: row.annual || {},
    approvalWorkflow: row.approvalWorkflow || {},
    savedAt: row.savedAt || row.updatedAt || ''
  };
}

function getLeadSelectValue(lead = {}) {
  return String(lead._id || lead.id || lead.sourceLeadId || lead.leadCode || lead.uniqueId || lead.company || '').trim();
}

function getLeadIdentityValues(lead = {}) {
  return [
    lead._id,
    lead.id,
    lead.sourceLeadId,
    lead.leadCode,
    lead.uniqueId,
    lead.leadId,
    lead.company,
    lead.companyName,
    lead.clientName
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function findLeadByValue(leads = [], value = '') {
  const selected = String(value || '').trim();
  if (!selected) return null;
  const selectedLower = selected.toLowerCase();
  return leads.find((lead) => getLeadIdentityValues(lead).some((candidate) => candidate === selected || candidate.toLowerCase() === selectedLower)) || null;
}

function getMongoObjectIdOrEmpty(value = '') {
  const raw = String(value || '').trim();
  return /^[a-f\d]{24}$/i.test(raw) ? raw : '';
}

function hydrateClientsWithAnnualReturns(clients = [], annualReturns = []) {
  if (!Array.isArray(annualReturns) || !annualReturns.length) return clients;
  const rowsByClientKey = new Map();

  annualReturns.forEach((row) => {
    getAnnualReturnMatchKeys(row).forEach((key) => {
      const rows = rowsByClientKey.get(key) || [];
      rows.push(row);
      rowsByClientKey.set(key, rows);
    });
  });

  return clients.map((client) => {
    const matchingRows = getAnnualClientMatchKeys(client)
      .flatMap((key) => rowsByClientKey.get(key) || []);
    const uniqueRows = [...new Map(matchingRows.map((row) => [`${row.clientKey || ''}:${row.annualYear || ''}:${row._id || ''}`, row])).values()];
    if (!uniqueRows.length) return client;

    const data = readClientData(client);
    const currentAnnualReturn = data.annualReturn && typeof data.annualReturn === 'object' && !Array.isArray(data.annualReturn)
      ? data.annualReturn
      : {};
    const filings = { ...(currentAnnualReturn.filings || {}) };

    uniqueRows.forEach((row) => {
      if (!row.annualYear) return;
      const existing = filings[row.annualYear] || {};
      const incomingFiling = mapAnnualReturnRecordToFiling(row);
      const mergedWorkflow = mergeAnnualWorkflowState(existing.approvalWorkflow || {}, incomingFiling.approvalWorkflow || {});
      filings[row.annualYear] = {
        ...existing,
        ...incomingFiling,
        status: mergedWorkflow.status || incomingFiling.status || existing.status || 'draft',
        draft: { ...(existing.draft || {}), ...(row.draft || {}) },
        approvalWorkflow: mergedWorkflow
      };
    });

    return {
      ...client,
      data: {
        ...data,
        annualReturn: {
          ...currentAnnualReturn,
          lastSavedYear: uniqueRows[0]?.annualYear || currentAnnualReturn.lastSavedYear,
          lastSavedAt: uniqueRows[0]?.savedAt || uniqueRows[0]?.updatedAt || currentAnnualReturn.lastSavedAt,
          filings
        }
      }
    };
  });
}

const emptyClient = {
  selectedLead: '',
  adminControls: { approvalStatus: 'PENDING', visibilityStatus: 'DISCONTINUED', assignedTo: '' },
  basic: { clientLegalName: '', tradeName: '', piboCategory: '', eprCategory: '', onboardingYear: '', firstAnnualReturnYear: '' },
  registeredAddress: {},
  communicationAddress: {},
  compliance: {},
  msmeRows: [],
  cte: { numberOfPlantsLocations: '', plantWiseDetails: [] },
  cpcb: {},
  validation: {},
  otp: {},
  authorised: {},
  coordinating: {}
};

const calendarTodoStorageKey = 'crm.calendar.todos.v1';

function readCalendarTodoItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(calendarTodoStorageKey) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCalendarTodoItems(items) {
  localStorage.setItem(calendarTodoStorageKey, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('crm-calendar-items-updated'));
}

export default function ClientMaster() {
  const [currentUser, setCurrentUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [annualReturnRecords, setAnnualReturnRecords] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [staff, setStaff] = useState([]);
  const [client, setClient] = useState(emptyClient);
  const [editingClientId, setEditingClientId] = useState('');
  const [viewClient, setViewClient] = useState(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [viewMode, setViewMode] = useState('list');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelRows, setExcelRows] = useState([]);
  const navigate = useNavigate();
  const { clientKey: routeClientKey, annualYear: routeAnnualYear } = useParams();
  const routeAnnualYearLabel = routeAnnualYear ? decodeURIComponent(routeAnnualYear) : '';

  const canSeeAdminControls = adminRoles.includes(currentUser?.role);
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);
  const isFirstStepReady = Boolean(String(client.basic?.clientLegalName || client.basic?.tradeName || '').trim());
  const leadOptions = useMemo(() => leads.map((lead) => ({
    value: getLeadSelectValue(lead),
    label: `${lead.leadCode || 'ATPL-LEAD-0001'} - ${lead.company || 'Untitled lead'} - ${lead.piboCategory || lead.status || 'Draft'}`
  })), [leads]);
  const staffOptions = useMemo(() => staff.map((user) => ({ value: user._id || user.id, label: `${user.name || user.email} (${user.role})` })), [staff]);

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
    if (!routeClientKey || (!clients.length && !annualReturnRecords.length)) return;
    const matchedClient = findClientByRouteKey(clients, routeClientKey);
    if (matchedClient) {
      setViewMode('list');
      setViewClient(matchedClient);
      return;
    }
    const normalizedRouteKey = normalizeAnnualClientKey(decodeURIComponent(routeClientKey));
    const annualRow = annualReturnRecords.find((row) => getAnnualReturnMatchKeys(row).includes(normalizedRouteKey));
    if (annualRow) {
      const clientData = annualRow.clientData && typeof annualRow.clientData === 'object' ? annualRow.clientData : {};
      const annualClient = hydrateClientsWithAnnualReturns([{
        _id: annualRow.clientKey || annualRow.client?._id || annualRow.client?.id || routeClientKey,
        id: annualRow.clientKey || routeClientKey,
        adminControls: annualRow.adminControls || {},
        data: clientData
      }], [annualRow])[0];
      setViewMode('list');
      setViewClient(annualClient);
    }
  }, [annualReturnRecords, clients, routeClientKey]);

  async function loadPage() {
    setLoading(true);
    try {
      const meResponse = await api.get(API_ENDPOINTS.auth.me);
      const me = meResponse.data.user;
      setCurrentUser(me);
      const [crmClientsResult, ccpClientsResult] = await Promise.allSettled([
        api.get(API_ENDPOINTS.clients.list),
        fetchCcpClients()
      ]);
      if (crmClientsResult.status === 'rejected') throw crmClientsResult.reason;
      const crmClients = crmClientsResult.value.data.clients || [];
      const ccpClients = ccpClientsResult.status === 'fulfilled' && ccpClientsResult.value.data?.ok !== false
        ? (ccpClientsResult.value.data.clients || [])
        : [];
      const mergedClients = mergeClientSources(crmClients, ccpClients);
      try {
        const annualReturnsResponse = await api.get(API_ENDPOINTS.annualReturns.list);
        const annualRows = annualReturnsResponse.data.annualReturns || [];
        setAnnualReturnRecords(annualRows);
        setClients(hydrateClientsWithAnnualReturns(mergedClients, annualRows));
      } catch {
        setAnnualReturnRecords([]);
        setClients(mergedClients);
      }
      const [crmLeadsResult, ccpLeadsResult] = await Promise.allSettled([
        api.get(API_ENDPOINTS.leads.list),
        fetchCcpLeads()
      ]);
      const crmLeads = crmLeadsResult.status === 'fulfilled' ? (crmLeadsResult.value.data.leads || []) : [];
      const ccpLeads = ccpLeadsResult.status === 'fulfilled' && ccpLeadsResult.value.data?.ok !== false
        ? (ccpLeadsResult.value.data.leads || [])
        : [];
      setLeads(mergeLeadSources(crmLeads, ccpLeads));
      try {
        const quotationsResponse = await api.get(API_ENDPOINTS.quotations.list);
        setQuotations(quotationsResponse.data.quotations || []);
      } catch {
        setQuotations([]);
      }
      try {
        const usersResponse = await api.get(API_ENDPOINTS.auth.users);
        setStaff(usersResponse.data.users || []);
      } catch {
        setStaff([meResponse.data.user]);
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to fetch client master data.');
      setLeads([]);
      setClients([]);
      setQuotations([]);
    } finally {
      setLoading(false);
    }
  }

  function setValue(section, field, value) {
    setClient((current) => ({ ...current, [section]: { ...current[section], [field]: value } }));
  }

  function setRoot(field, value) {
    setClient((current) => ({ ...current, [field]: value }));
  }

  function handleLeadSelect(value) {
    const selectedLead = findLeadByValue(leads, value);
    if (!selectedLead) {
      setRoot('selectedLead', value);
      return;
    }
    const leadValue = getLeadSelectValue(selectedLead);
    const leadCode = selectedLead.leadCode || selectedLead.uniqueId || selectedLead.sourceLeadId || leadValue || '';
    const company = selectedLead.company || selectedLead.companyName || selectedLead.clientName || '';
    const email = String(selectedLead.emails || selectedLead.email || '').split(/[,\s;]+/).find(Boolean) || '';

    setClient((current) => ({
      ...current,
      selectedLead: leadValue,
      basic: {
        ...current.basic,
        clientLegalName: current.basic.clientLegalName || company || '',
        tradeName: current.basic.tradeName || company || '',
        piboCategory: current.basic.piboCategory || selectedLead.piboCategory || '',
        eprCategory: current.basic.eprCategory || selectedLead.eprCategory || ''
      },
      importMeta: {
        ...current.importMeta,
        leadNumber: current.importMeta?.leadNumber || leadCode,
        uniqueId: current.importMeta?.uniqueId || leadCode,
        ccpClientId: current.importMeta?.ccpClientId || selectedLead.sourceLeadId || '',
        companyName: current.importMeta?.companyName || company,
        createdBy: current.importMeta?.createdBy || selectedLead.importedCreatedBy || selectedLead.referredBy || '',
        assignedTo: current.importMeta?.assignedTo || selectedLead.assignedToText || selectedLead.assignedTo?.name || ''
      },
      selectedLeadSnapshot: {
        id: leadValue,
        sourceLeadId: selectedLead.sourceLeadId || '',
        leadCode,
        company,
        piboCategory: selectedLead.piboCategory || '',
        eprCategory: selectedLead.eprCategory || '',
        contactPerson: selectedLead.contactPerson || '',
        mobileNo1: selectedLead.mobileNo1 || '',
        email,
        source: selectedLead.source || ''
      },
      registeredAddress: {
        ...current.registeredAddress,
        address1: current.registeredAddress.address1 || selectedLead.addressLine1 || '',
        address2: current.registeredAddress.address2 || selectedLead.addressLine2 || '',
        address3: current.registeredAddress.address3 || selectedLead.addressLine3 || '',
        state: current.registeredAddress.state || selectedLead.state || '',
        city: current.registeredAddress.city || selectedLead.city || '',
        pincode: current.registeredAddress.pincode || selectedLead.pinCode || ''
      },
      communicationAddress: {
        ...current.communicationAddress,
        address1: current.communicationAddress.address1 || selectedLead.addressLine1 || '',
        address2: current.communicationAddress.address2 || selectedLead.addressLine2 || '',
        address3: current.communicationAddress.address3 || selectedLead.addressLine3 || '',
        state: current.communicationAddress.state || selectedLead.state || '',
        city: current.communicationAddress.city || selectedLead.city || '',
        pincode: current.communicationAddress.pincode || selectedLead.pinCode || ''
      },
      otp: {
        ...current.otp,
        mobile: current.otp.mobile || selectedLead.mobileNo1 || '',
        personName: current.otp.personName || selectedLead.contactPerson || '',
        designation: current.otp.designation || selectedLead.designation || ''
      },
      authorised: {
        ...current.authorised,
        name: current.authorised.name || selectedLead.contactPerson || '',
        designation: current.authorised.designation || selectedLead.designation || '',
        mobile: current.authorised.mobile || selectedLead.mobileNo1 || '',
        email: current.authorised.email || email || ''
      },
      coordinating: {
        ...current.coordinating,
        name: current.coordinating.name || selectedLead.contactPerson || '',
        designation: current.coordinating.designation || selectedLead.designation || '',
        mobile: current.coordinating.mobile || selectedLead.mobileNo1 || '',
        email: current.coordinating.email || email || ''
      }
    }));
  }

  function setAdmin(field, value) {
    setClient((current) => ({ ...current, adminControls: { ...current.adminControls, [field]: value } }));
  }

  function openClientForm() {
    setClient(emptyClient);
    setEditingClientId('');
    setActiveTab('basic');
    setError('');
    setNotice('');
    setViewMode('form');
  }

  function openClientTab(tabId) {
    if (tabId !== 'basic' && !isFirstStepReady) {
      setError('First enter Client Legal Name or Trade Name before moving to the next step.');
      return;
    }
    setError('');
    setActiveTab(tabId);
  }

  function nextTab() {
    if (!isFirstStepReady) {
      setError('First enter Client Legal Name or Trade Name before moving to the next step.');
      return;
    }
    setError('');
    const next = tabs[Math.min(activeIndex + 1, tabs.length - 1)];
    setActiveTab(next.id);
  }

  function resolveUserId(value) {
    const raw = normalizePersonName(value);
    if (!raw) return '';
    const match = staff.find((user) => normalizePersonName(user.name) === raw) ||
      staff.find((user) => normalizePersonName(user.email) === raw) ||
      staff.find((user) => normalizePersonName(user.ccpUserId) === raw);
    return match ? (match._id || match.id) : '';
  }

  function resolveAssignedToId(value) {
    if (!value) return '';
    if (typeof value === 'string') {
      if (/^[a-f\d]{24}$/i.test(value)) return value;
      return resolveUserId(value);
    }
    const directId = value._id || value.id || value.userId || '';
    if (/^[a-f\d]{24}$/i.test(String(directId))) return directId;
    return resolveUserId(value.name || value.email || value.ccpUserId);
  }

  function buildAdminControlsPayload(adminControls = {}) {
    const assignedTo = resolveAssignedToId(adminControls.assignedTo);
    const payload = { ...adminControls };
    if (assignedTo) payload.assignedTo = assignedTo;
    else delete payload.assignedTo;
    return payload;
  }

  function resolveLeadId(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const match = leads.find((leadItem) => String(leadItem.leadCode || '').toLowerCase() === raw) ||
      leads.find((leadItem) => String(leadItem.company || '').toLowerCase() === raw);
    return match ? (match._id || match.id) : '';
  }

  async function handleExcelUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError('');
    setNotice('');
    setExcelFileName(file.name);
    setExcelRows([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames?.[0];
      if (!sheetName) {
        setError('No sheet found in this file.');
        return;
      }
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      const parsed = rows
        .map((row) => mapExcelRowToClient(row, staff, leads))
        .filter((row) => Object.values(row.data || {}).some((value) => JSON.stringify(value || '').replace(/["{}[\],:]/g, '').trim() !== ''));

      if (!parsed.length) {
        setError('Excel has no usable client rows.');
        return;
      }

      setExcelRows(parsed);
      const first = parsed[0];
      setClient({
        ...emptyClient,
        ...(first.data || {}),
        selectedLead: first.selectedLead || '',
        adminControls: { ...emptyClient.adminControls, ...(first.adminControls || {}) }
      });
      setNotice(`${parsed.length} client row${parsed.length === 1 ? '' : 's'} loaded. First row applied to form.`);
    } catch (err) {
      console.error(err);
      setError('Unable to read Excel file. Please upload a valid .xlsx file.');
    }
  }

  async function importExcelRows() {
    if (!excelRows.length) return;
    setImporting(true);
    setError('');
    setNotice('');

    try {
      const payload = excelRows.map((row) => {
        const assignedText = row.data?.importMeta?.assignedTo || '';
        const leadText = row.data?.importMeta?.leadNumber || row.data?.importMeta?.uniqueId || '';
        return {
          ...row,
          selectedLead: row.selectedLead || resolveLeadId(leadText),
          adminControls: {
            ...buildAdminControlsPayload(row.adminControls),
            assignedTo: resolveAssignedToId(row.adminControls?.assignedTo) || resolveUserId(assignedText)
          },
          workflowStatus: 'draft'
        };
      });
      const response = await api.post(API_ENDPOINTS.clients.bulk, { clients: payload });
      const successCount = response.data.imported || 0;
      const failures = response.data.failures || [];

      if (successCount) {
        setNotice(`${successCount} client${successCount === 1 ? '' : 's'} imported as drafts.`);
        await loadPage();
      }
      if (failures.length) {
        setError(`${failures.length} row${failures.length === 1 ? '' : 's'} failed. First: row ${failures[0].row + 1} (${failures[0].error})`);
      }
    } catch (err) {
      const failures = err?.response?.data?.failures || [];
      setError(failures.length
        ? `${failures.length} row${failures.length === 1 ? '' : 's'} failed. First: row ${failures[0].row + 1} (${failures[0].error})`
        : err?.response?.data?.error || 'Unable to import clients');
    } finally {
      setImporting(false);
    }
  }

  function addRow(key, row) {
    setClient((current) => ({ ...current, [key]: [...current[key], row] }));
  }

  function updateRow(key, index, field, value) {
    setClient((current) => ({
      ...current,
      [key]: current[key].map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    }));
  }

  function removeRow(key, index) {
    setClient((current) => ({ ...current, [key]: current[key].filter((_, rowIndex) => rowIndex !== index) }));
  }

  function copyRegisteredAddress(checked) {
    if (!checked) return;
    setClient((current) => ({ ...current, communicationAddress: { ...current.registeredAddress } }));
  }

  async function saveClient(workflowStatus) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (workflowStatus === 'submitted' && !String(client.basic?.clientLegalName || '').trim()) {
        setError('Client Legal Name is required before submit.');
        setActiveTab('basic');
        return;
      }
      const payload = {
        selectedLead: getMongoObjectIdOrEmpty(client.selectedLead),
        adminControls: buildAdminControlsPayload(client.adminControls),
        data: client,
        workflowStatus
      };
      if (editingClientId) await api.put(API_ENDPOINTS.clients.detail(editingClientId), payload);
      else await api.post(API_ENDPOINTS.clients.create, payload);
      setNotice(workflowStatus === 'submitted' ? 'Client submitted successfully.' : 'Client draft saved successfully.');
      await loadPage();
      if (workflowStatus === 'submitted') {
        setClient(emptyClient);
        setEditingClientId('');
        setViewMode('list');
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to save client');
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('login_email');
    navigate('/', { replace: true });
  }

  function closeViewClient() {
    setViewClient(null);
    if (routeClientKey) navigate('/sales/client-master', { replace: true });
  }

  function handleViewedClientUpdated(updatedClient) {
    if (!updatedClient) return;
    setViewClient(updatedClient);
    setClients((current) => current.map((item) => (
      String(item._id || item.id || getClientUniqueId(item)) === String(updatedClient._id || updatedClient.id || getClientUniqueId(updatedClient))
        ? updatedClient
        : item
    )));
  }

  if (viewMode === 'list') {
    return (
      <DashboardShell currentUser={currentUser} onOpenProfile={() => setProfileOpen(true)} onLogout={handleLogout}>
        {viewClient ? (
          <ClientViewModal
            client={viewClient}
            quotations={quotations}
            staff={staff}
            initialTab={routeClientKey ? 'annual' : 'basic'}
            initialAnnualYear={routeAnnualYearLabel}
            currentUser={currentUser}
            onClose={closeViewClient}
            onClientUpdated={handleViewedClientUpdated}
          />
        ) : (
          <ClientDirectoryView
            clients={clients}
            staff={staff}
            currentUser={currentUser}
            loading={loading}
            error={error}
            onRefresh={loadPage}
            onView={setViewClient}
            onCreate={openClientForm}
            selectOptions={selectOptions}
          />
        )}
        {profileOpen && <ProfileModal user={currentUser} saving={false} onClose={() => setProfileOpen(false)} onLogout={handleLogout} onSave={() => {}} onUpdatePassword={() => {}} />}
      </DashboardShell>
    );
  }

  return (
    <DashboardShell currentUser={currentUser} onOpenProfile={() => setProfileOpen(true)} onLogout={handleLogout}>
      <div className="px-4 pb-6 pt-3 sm:px-6 sm:pt-4 lg:px-8">
        <div className="rounded-[28px] bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 shadow-sm ring-1 ring-emerald-100 sm:p-5 lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => setViewMode('list')} className="btn-lift inline-flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-100 bg-white text-[#30737B] shadow-sm">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#30737B]">Sales</p>
                <h1 className="mt-1 text-3xl font-black text-slate-950">Client Master</h1>
              </div>
            </div>
            <div className="rounded-2xl border border-teal-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Active Tab</p>
              <p className="mt-1 font-black text-[#30737B]">{activeIndex + 1}. {tabs[activeIndex]?.label}</p>
            </div>
          </div>

          <Card title="Select Lead" className="mt-6">
            <Field required label="Choose Existing Lead">
              <div className="relative">
                <select value={client.selectedLead} onChange={(event) => handleLeadSelect(event.target.value)} className="form-input pr-12">
                  <option value="">Search and select a lead</option>
                  {leadOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              </div>
            </Field>
          </Card>

          {canSeeAdminControls && (
            <Card title="Admin Controls" className="mt-6">
              <div className="grid gap-5 md:grid-cols-3">
                <SelectLike label="Approval Status" value={client.adminControls.approvalStatus} options={selectOptions.approvalStatus} onChange={(value) => setAdmin('approvalStatus', value)} />
                <SelectLike label="Client Visibility Status" value={client.adminControls.visibilityStatus} options={selectOptions.visibilityStatus} onChange={(value) => setAdmin('visibilityStatus', value)} />
                <SelectLike label="Assigned To" value={client.adminControls.assignedTo} options={staffOptions} placeholder="Search and select admin to assign" onChange={(value) => setAdmin('assignedTo', value)} />
              </div>
            </Card>
          )}

          <Card title="Excel Bulk Import" className="mt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-950">Client Master Import</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Upload .xlsx with headers like Unique ID, Trade Name, Client Name, State, City with PIN, GST Number, CPCB Reg No, OTP Mobile.
                </p>
                {excelFileName && (
                  <p className="mt-2 text-xs font-black text-slate-700">
                    File: <span className="font-extrabold">{excelFileName}</span> {excelRows.length ? `(${excelRows.length} row${excelRows.length === 1 ? '' : 's'})` : ''}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="btn-lift inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 font-black text-slate-800 hover:bg-slate-50">
                  <Upload className="h-4 w-4" /> Upload Excel
                  <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="sr-only" />
                </label>
                <button
                  type="button"
                  disabled={!excelRows.length || importing || saving}
                  onClick={importExcelRows}
                  className="btn-lift min-h-11 rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 px-6 font-black text-white shadow-lg shadow-emerald-700/20 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {importing ? 'Importing...' : 'Import Drafts'}
                </button>
              </div>
            </div>
          </Card>

          <section className="mt-6 rounded-2xl border border-teal-100 bg-white/80 p-3 shadow-lg shadow-teal-900/5">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => openClientTab(tab.id)}
                    className={`btn-lift flex min-h-12 shrink-0 items-center gap-2 rounded-xl px-4 font-black transition ${
                      active ? 'bg-[#30737B] text-white shadow-lg shadow-teal-900/15' : 'bg-slate-50 text-slate-600 hover:bg-teal-50 hover:text-[#30737B]'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </section>

          {error && <ToastMessage type="error" className="mt-5">{error}</ToastMessage>}
          {notice && <ToastMessage type="success" className="mt-5">{notice}</ToastMessage>}

          <div className="mt-6 grid gap-6">
            {activeTab === 'basic' && <BasicTab client={client} setValue={setValue} />}
            {activeTab === 'address' && <AddressTab client={client} setValue={setValue} copyRegisteredAddress={copyRegisteredAddress} selectOptions={selectOptions} />}
            {activeTab === 'compliance' && <ComplianceTab client={client} setValue={setValue} addRow={addRow} updateRow={updateRow} removeRow={removeRow} complianceRows={complianceRows} />}
            {activeTab === 'cte' && <CteTab client={client} setValue={setValue} selectOptions={selectOptions} />}
            {activeTab === 'cpcb' && <CpcbTab client={client} setValue={setValue} selectOptions={selectOptions} />}
            {activeTab === 'validation' && <ValidationTab client={client} setValue={setValue} />}
            {activeTab === 'contacts' && <ContactsTab client={client} setValue={setValue} />}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button type="button" disabled={saving} onClick={() => saveClient('draft')} className="btn-lift min-h-11 rounded-xl border border-orange-200 bg-white px-8 font-black text-orange-600 hover:bg-orange-50">Save Draft</button>
            <button type="button" disabled={saving} onClick={() => saveClient('submitted')} className="btn-lift min-h-11 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-8 font-black text-white shadow-lg shadow-orange-600/20">Submit</button>
            <button type="button" disabled={saving || activeIndex === tabs.length - 1} onClick={nextTab} className="btn-lift min-h-11 rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 px-8 font-black text-white shadow-lg shadow-emerald-700/20 disabled:cursor-not-allowed disabled:opacity-60">Next Step</button>
          </div>
        </div>
      </div>
      {profileOpen && <ProfileModal user={currentUser} saving={false} onClose={() => setProfileOpen(false)} onLogout={handleLogout} onSave={() => {}} onUpdatePassword={() => {}} />}
    </DashboardShell>
  );
}

function BasicTab({ client, setValue }) {
  return (
    <Card title="Client Basic Info">
      <div className="grid gap-5 md:grid-cols-2">
        <Field required label="Client Legal Name"><input className="form-input" value={client.basic.clientLegalName} onChange={(event) => setValue('basic', 'clientLegalName', event.target.value)} /></Field>
        <Field label="Trade Name"><input className="form-input" value={client.basic.tradeName} onChange={(event) => setValue('basic', 'tradeName', event.target.value)} /></Field>
        <SelectLike label="PIBO Category" value={client.basic.piboCategory} options={selectOptions.piboCategory} onChange={(value) => setValue('basic', 'piboCategory', value)} />
        <SelectLike label="EPR Category" value={client.basic.eprCategory} options={selectOptions.eprCategory} onChange={(value) => setValue('basic', 'eprCategory', value)} />
        <SelectLike label="Client Onboarding Year" value={client.basic.onboardingYear} options={selectOptions.years} placeholder="Select onboarding year" onChange={(value) => setValue('basic', 'onboardingYear', value)} />
        <Field label="First Annual Return Year Applicable">
          <div className="relative">
            <select value={normalizeFinancialYearLabel(client.basic.firstAnnualReturnYear)} onChange={(event) => setValue('basic', 'firstAnnualReturnYear', event.target.value)} className="form-input pr-12">
              <option value="">Select first annual return year</option>
              {selectOptions.annualReturnYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          </div>
        </Field>
      </div>
    </Card>
  );
}

function ClientViewModal({ client, quotations = [], staff = [], onClose, initialTab = 'basic', initialAnnualYear = '', currentUser, onClientUpdated }) {
  const data = readClientData(client);
  const msmeRows = getMsmeRows(data);
  const clientName = data.basic?.clientLegalName || data.basic?.tradeName || 'Client Details';
  const cityPin = `${data.registeredAddress?.city || ''} ${data.registeredAddress?.pincode || ''}`.trim();
  const assignedName = getAssignedName(client);
  const visibility = getVisibilityStatus(client);
  const rawDocumentUrls = data.validation?.documentUrls;
  const documentUrls = Array.isArray(rawDocumentUrls)
    ? rawDocumentUrls.map((item) => (typeof item === 'string' ? item : item?.url || item?.fileUrl || item?.path || '')).map((item) => item.trim()).filter(Boolean)
    : String(rawDocumentUrls || '').split(',').map((item) => item.trim()).filter(Boolean);
  const docLinks = mapClientDocuments(documentUrls);
  const profileRows = [
    ['Client Name', clientName, Building2],
    ['Trade Name', data.basic?.tradeName, Building2],
    ['State', data.registeredAddress?.state, MapPin],
    ['City with PIN', cityPin, MapPin],
    ['PIBO Category', data.basic?.piboCategory, FolderCheck],
    ['EPR Category', data.basic?.eprCategory, FileCheck2],
    ['Company Industry', data.basic?.companyIndustry, Building2],
    ['Services Offered', data.basic?.servicesOffered, CheckCircle2]
  ];
  const contactRows = [
    ['Contact Person', data.otp?.personName || data.authorised?.name, UserRound],
    ['Contact No', data.otp?.mobile || data.authorised?.mobile, UserRound],
    ['Email', data.authorised?.email || data.coordinating?.email, FileText],
    ['Website', data.basic?.website, Eye],
    ['Authorised Person', data.authorised?.name, UserRound],
    ['Coordinator', data.coordinating?.name, UserRound]
  ];
  const complianceRows = [
    ['GST Number', data.compliance?.gst || data.compliance?.gstNumber, FileText, docLinks.gst],
    ['PAN', data.compliance?.pan || data.compliance?.panNumber, FileText, docLinks.pan],
    ['CIN', data.compliance?.cin || data.compliance?.cinNumber, FileText, docLinks.cin],
    ['Factory License', data.compliance?.factoryLicense || data.compliance?.factoryLicenseNumber, FileText, docLinks.factory],
    ['EPR Certificate', data.compliance?.eprCertificate || data.compliance?.eprCertificateNumber, ShieldCheck, docLinks.epr],
    ['MSME', getMsmeSummary(data), FileCheck2, docLinks.msme]
  ];
  const initials = clientName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CL';
  const [activeClientTab, setActiveClientTab] = useState(initialTab || 'basic');
  const [openDetailGroups, setOpenDetailGroups] = useState({});
  const clientQuotations = useMemo(() => getClientQuotations(quotations, client), [quotations, client]);
  const quotationContext = useMemo(() => getClientQuotationContext(client), [client]);
  const firstAnnualReturnYear = getFirstAnnualReturnYear(client, data);
  const initialAnnualYearLabel = normalizeFinancialYearLabel(initialAnnualYear);
  const annualYears = useMemo(() => {
    const years = buildAnnualReturnYears(firstAnnualReturnYear);
    if (!initialAnnualYearLabel || years.some((year) => year.label === initialAnnualYearLabel)) return years;
    const startYear = Number(initialAnnualYearLabel.split('-')[0]);
    return [
      ...years,
      {
        startYear,
        label: initialAnnualYearLabel,
        period: 'April - March',
        status: 'Open hub'
      }
    ].sort((first, second) => first.startYear - second.startYear);
  }, [firstAnnualReturnYear, initialAnnualYearLabel]);
  const [selectedAnnualYear, setSelectedAnnualYear] = useState(() => (
    initialAnnualYearLabel && annualYears.some((year) => year.label === initialAnnualYearLabel) ? initialAnnualYearLabel : ''
  ));
  const addressRows = [
    ['Registered Address 1', data.registeredAddress?.address1, MapPin],
    ['Registered Address 2', data.registeredAddress?.address2, MapPin],
    ['Registered Address 3', data.registeredAddress?.address3, MapPin],
    ['Registered State', data.registeredAddress?.state, MapPin],
    ['Registered City', data.registeredAddress?.city, MapPin],
    ['Registered PIN', data.registeredAddress?.pincode, MapPin],
    ['Communication Address 1', data.communicationAddress?.address1, MapPin],
    ['Communication City', data.communicationAddress?.city, MapPin],
    ['Communication State', data.communicationAddress?.state, MapPin],
    ['Communication PIN', data.communicationAddress?.pincode, MapPin]
  ];
  const docRows = [
    ['GST Certificate Date', data.compliance?.gstDate, FileText, docLinks.gst],
    ['CIN Document Date', data.compliance?.cinDate, FileText, docLinks.cin],
    ['PAN Document Date', data.compliance?.panDate, FileText, docLinks.pan],
    ['Factory License Date', data.compliance?.factoryLicenseDate, FileText, docLinks.factory],
    ['EPR Certificate No', data.compliance?.eprCertificate, ShieldCheck, docLinks.epr],
    ...(docLinks.application ? [['Application Page', 'Uploaded document', FileText, docLinks.application]] : [])
  ];
  const detailTabs = [
    { id: 'basic', label: 'Basic Info', icon: Building2 },
    { id: 'company', label: 'Company History', icon: Building2, title: 'Company History', message: 'No company history entries yet.' },
    { id: 'quotation', label: 'Quotation History', icon: FileText, title: 'Quotation History', message: 'No quotations mapped yet.' },
    { id: 'annual', label: 'Annual Return History', icon: RefreshCw, title: 'Annual Return History', message: 'No annual return timeline yet.' },
    { id: 'ticket', label: 'Ticket', icon: FolderCheck, title: 'Ticket', message: 'No tickets raised yet.' }
  ];
  const activeTabMeta = detailTabs.find((tab) => tab.id === activeClientTab) || detailTabs[0];
  const isAnnualProcessingView = activeClientTab === 'annual' && annualYears.some((year) => year.label === selectedAnnualYear);
  const calendarClientKey = String(client._id || client.id || getClientUniqueId(client) || clientName);
  const [interactionTab, setInteractionTab] = useState('follow-up');
  const [calendarItems, setCalendarItems] = useState(() => readCalendarTodoItems());
  const [interactionModalType, setInteractionModalType] = useState('');
  const clientCalendarItems = useMemo(() => calendarItems.filter((item) => String(item.clientKey || '') === calendarClientKey), [calendarClientKey, calendarItems]);
  const clientFollowUps = clientCalendarItems.filter((item) => item.type === 'follow-up');
  const clientTodos = clientCalendarItems.filter((item) => item.type !== 'follow-up');
  const assignOptions = useMemo(() => [...new Map([
    ...staff,
    ...(currentUser ? [currentUser] : [])
  ].map((user) => [String(user?._id || user?.id || user?.email || user?.name || Math.random()), user])).values()].filter(Boolean).map((user) => ({
    value: user.name || user.email || user._id || user.id,
    label: `${user.name || user.email || 'User'}${user.email ? ` (${user.email})` : ''}`
  })), [currentUser, staff]);

  useEffect(() => {
    setSelectedAnnualYear((current) => (current && annualYears.some((year) => year.label === current) ? current : ''));
  }, [annualYears]);

  useEffect(() => {
    if (initialTab) setActiveClientTab(initialTab);
    if (initialAnnualYearLabel && annualYears.some((year) => year.label === initialAnnualYearLabel)) {
      setSelectedAnnualYear(initialAnnualYearLabel);
    } else if (initialAnnualYear) {
      setSelectedAnnualYear('');
    }
  }, [client?._id, client?.id, initialTab, initialAnnualYear, initialAnnualYearLabel, annualYears]);

  function toggleDetailGroup(id) {
    setOpenDetailGroups((current) => ({ ...current, [id]: !current[id] }));
  }

  function openClientSection(id) {
    setActiveClientTab(id);
  }

  function saveClientInteractionItem(payload) {
    const assignedUser = [...staff, ...(currentUser ? [currentUser] : [])].find((user) => {
      const keys = [user?.name, user?.email, user?._id, user?.id, user?.crmUserId, user?.userId, user?.ccpUserId]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase());
      return keys.includes(String(payload.assignedTo || '').trim().toLowerCase());
    });
    const nextItems = [
      {
        ...payload,
        id: `${payload.type}-${Date.now()}`,
        clientKey: calendarClientKey,
        clientNumber: getClientUniqueId(client),
        clientName,
        leadNumber: data.importMeta?.leadNumber || client.selectedLead?.leadCode || '',
        assignedToName: assignedUser?.name || payload.assignedTo,
        assignedToEmail: assignedUser?.email || '',
        assignedToId: assignedUser?._id || assignedUser?.id || assignedUser?.crmUserId || assignedUser?.userId || assignedUser?.ccpUserId || '',
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.name || currentUser?.email || ''
      },
      ...calendarItems
    ];
    setCalendarItems(nextItems);
    writeCalendarTodoItems(nextItems);
    setInteractionModalType('');
  }

  return (
    <div className="bg-[#f3f8f6]">
      <section className="min-h-[calc(100vh-64px)] px-4 py-4 sm:px-6 lg:px-8">
        {!isAnnualProcessingView && <div className="-mx-4 -mt-4 border-b border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={onClose} className="btn-lift grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-orange-600 shadow-sm" title="Back">
              <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#30737B]">Client Details</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-lift inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-black text-violet-700"><ShieldCheck className="h-4 w-4" />CPCB Login</button>
              <button type="button" onClick={() => navigate('/sales/quotations?mode=add', { state: { quotationContext } })} className="btn-lift inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-black text-violet-700"><Plus className="h-4 w-4" />Quotation</button>
              <button type="button" className="btn-lift inline-flex min-h-9 items-center gap-2 rounded-lg bg-teal-700 px-3.5 text-sm font-black text-white"><FileText className="h-4 w-4" />History</button>
              <button type="button" onClick={() => openCcpClientEdit(client)} className="btn-lift inline-flex min-h-9 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-black text-white"><Edit3 className="h-4 w-4" />Edit in CCP</button>
            </div>
          </div>
        </div>}

        <div className={isAnnualProcessingView ? 'mt-0 w-full max-w-none' : 'mt-4 w-full max-w-none'}>
          {!isAnnualProcessingView && <section className="client-detail-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/6">
            <div className="bg-[linear-gradient(135deg,#ffffff_0%,#f0fdfa_58%,#fff7ed_100%)] p-4 sm:p-5">
              <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-white bg-[#30737B] text-xl font-black text-white shadow-lg shadow-teal-900/20">{initials}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill value={visibility} />
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black uppercase text-violet-700">{data.basic?.eprCategory || 'EPR Not Set'}</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase text-emerald-700">{data.basic?.piboCategory || 'PIBO Not Set'}</span>
                    </div>
                    <h1 className="mt-2 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">{clientName}</h1>
                    <p className="mt-1 max-w-4xl text-sm font-bold text-slate-500">{data.registeredAddress?.state || 'State not set'}{cityPin ? `, ${cityPin}` : ''}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-white/80 bg-white/80 p-3 shadow-sm shadow-teal-900/5 backdrop-blur xl:min-w-[640px]">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <InlineClientMeta label="Unique ID" value={getClientUniqueId(client)} icon={FileText} />
                    <InlineClientMeta label="Visibility" value={visibility} icon={Eye} status />
                    <InlineClientMeta label="Assigned To" value={assignedName} icon={UserRound} />
                    <InlineClientMeta label="CPCB" value={data.cpcb?.status || '-'} icon={ShieldCheck} />
                  </div>
                </div>
              </div>
            </div>

          </section>}

          {!isAnnualProcessingView && (
            <ClientInteractionsCard
              activeTab={interactionTab}
              onTabChange={setInteractionTab}
              followUps={clientFollowUps}
              todos={clientTodos}
              onAddFollowUp={() => setInteractionModalType('follow-up')}
              onAddTodo={() => setInteractionModalType('todo')}
            />
          )}

          <div className={isAnnualProcessingView ? 'space-y-0' : 'mt-5 space-y-5'}>
            {!isAnnualProcessingView && <section className="client-detail-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
              <div className="client-detail-tab-strip grid sm:grid-cols-5">
                {detailTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeClientTab === tab.id;
                  return (
                    <button key={tab.id} type="button" onClick={() => openClientSection(tab.id)} className={`client-detail-tab-button relative flex min-h-14 items-center justify-center gap-2 border-b border-slate-200 px-3 text-sm font-black transition sm:border-b-0 sm:border-r last:border-r-0 ${active ? 'client-detail-tab-button-active bg-emerald-50 text-[#30737B]' : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>
                      <Icon className="h-4 w-4" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>}

            <main className="space-y-5">
              <section className={isAnnualProcessingView ? '' : 'client-detail-card rounded-xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5'}>
                {!isAnnualProcessingView && <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#30737B]">{activeTabMeta.label}</p>
                    <h3 className="mt-1 text-2xl font-black text-slate-950">{activeTabMeta.title || activeTabMeta.label}</h3>
                  </div>
                  <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black uppercase text-slate-600">Updated {data.importMeta?.creationDate || 'Recently'}</span>
                </div>}

                <div key={activeClientTab} className="client-detail-tab-panel">
                  {activeClientTab === 'basic' && (
                    <div className="mt-5 grid gap-4">
                      <DetailAccordion title="Basic Info" open={Boolean(openDetailGroups.basic)} onToggle={() => toggleDetailGroup('basic')}>
                        <DetailSheet columns={2}>
                          {profileRows.map(([label, value, Icon, actionUrl]) => <DetailValue key={label} label={label} value={value} icon={Icon} actionUrl={actionUrl} />)}
                        </DetailSheet>
                      </DetailAccordion>
                      <DetailAccordion title="Registered and communication addresses" open={Boolean(openDetailGroups.addresses)} onToggle={() => toggleDetailGroup('addresses')}>
                        <DetailSheet columns={2}>
                          {addressRows.map(([label, value, Icon, actionUrl]) => <DetailValue key={label} label={label} value={value} icon={Icon} actionUrl={actionUrl} />)}
                        </DetailSheet>
                      </DetailAccordion>
                      <DetailAccordion title="Document depository" open={Boolean(openDetailGroups.docs)} onToggle={() => toggleDetailGroup('docs')}>
                        <DetailSheet columns={2}>
                          {[...complianceRows, ...docRows].map(([label, value, Icon, actionUrl]) => <DetailValue key={label} label={label} value={value} icon={Icon} actionUrl={actionUrl} />)}
                        </DetailSheet>
                      </DetailAccordion>
                      <DetailAccordion title="Contact matrix" open={Boolean(openDetailGroups.contacts)} onToggle={() => toggleDetailGroup('contacts')}>
                        <DetailSheet columns={2}>
                          {contactRows.map(([label, value, Icon, actionUrl]) => <DetailValue key={label} label={label} value={value} icon={Icon} actionUrl={actionUrl} link={label === 'Website'} />)}
                        </DetailSheet>
                      </DetailAccordion>
                    </div>
                  )}

                  {activeClientTab === 'annual' && (
                    <AnnualReturnHistory
                      client={client}
                      quotations={clientQuotations.length ? clientQuotations : quotations}
                      years={annualYears}
                      selectedYear={selectedAnnualYear}
                      currentUser={currentUser}
                      onSelectYear={setSelectedAnnualYear}
                      onClientUpdated={onClientUpdated}
                    />
                  )}

                  {activeClientTab === 'quotation' && (
                    <QuotationHistory
                      client={client}
                      quotations={clientQuotations}
                      quotationContext={quotationContext}
                    />
                  )}

                  {activeClientTab !== 'basic' && activeClientTab !== 'annual' && activeClientTab !== 'quotation' && (
                    <EmptyTab title={activeTabMeta.title} message={activeTabMeta.message} />
                  )}
                </div>
              </section>

            </main>
          </div>
        </div>
        {interactionModalType && (
          <ClientInteractionModal
            type={interactionModalType}
            clientName={clientName}
            clientNumber={getClientUniqueId(client)}
            leadNumber={data.importMeta?.leadNumber || client.selectedLead?.leadCode || ''}
            assignOptions={assignOptions}
            onClose={() => setInteractionModalType('')}
            onSave={saveClientInteractionItem}
          />
        )}
      </section>
    </div>
  );
}

function ClientInteractionsCard({ activeTab, onTabChange, followUps = [], todos = [], onAddFollowUp, onAddTodo }) {
  const rows = activeTab === 'follow-up' ? followUps : todos;
  return (
    <section className="client-interactions-card">
      <div className="client-interactions-head">
        <div>
          <p>Client Interactions</p>
          <div className="client-interaction-tabs">
            <button type="button" onClick={() => onTabChange('follow-up')} className={activeTab === 'follow-up' ? 'active' : ''}>Follow-Up</button>
            <button type="button" onClick={() => onTabChange('todo')} className={activeTab === 'todo' ? 'active' : ''}>To-Do</button>
          </div>
        </div>
        <div className="client-interaction-actions">
          <button type="button" onClick={onAddFollowUp}><Clock3 className="h-4 w-4" /> Add Follow-Up</button>
          <button type="button" onClick={onAddTodo}><ClipboardList className="h-4 w-4" /> Add To-Do</button>
        </div>
      </div>
      <div className="client-interaction-content">
        {rows.length ? rows.slice(0, 4).map((item) => (
          <article key={item.id} className="client-interaction-row">
            <span><CalendarDays className="h-4 w-4" /></span>
            <div>
              <strong>{item.title}</strong>
              <small>{formatDisplayDate(item.scheduledDate)}{item.scheduledTime ? ` at ${item.scheduledTime}` : ''} • {item.priority || 'Medium'}</small>
            </div>
            <em>{item.status === 'completed' ? 'Done' : item.type === 'follow-up' ? 'Follow-Up' : 'To-Do'}</em>
          </article>
        )) : (
          <div className="client-interaction-empty">
            <ClipboardList className="h-10 w-10" />
            <strong>{activeTab === 'follow-up' ? 'No follow-ups linked to this client' : 'No to-do items linked to this client'}</strong>
            <span>{activeTab === 'follow-up' ? 'Add a dated follow-up so it appears on the calendar.' : 'Create a todo and assign it to the team.'}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function ClientInteractionModal({ type, clientName, clientNumber = '', leadNumber = '', assignOptions = [], onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState({
    title: type === 'follow-up' ? `Follow up with ${clientName}` : '',
    description: '',
    clientNumber,
    clientName,
    leadNumber,
    scheduledDate: today,
    scheduledTime: '',
    priority: 'Medium',
    category: type === 'follow-up' ? 'Follow-Up' : 'General',
    assignedTo: '',
    status: 'open',
    type
  });
  const isFollowUp = type === 'follow-up';

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submit() {
    if (!draft.title.trim()) return;
    onSave({ ...draft, title: draft.title.trim() });
  }

  return (
    <div className="client-interaction-modal-backdrop">
      <div className="client-interaction-modal">
        <div className="client-interaction-modal-head">
          <div>
            <span>{clientName}</span>
            <h3><Plus className="h-5 w-5" /> {isFollowUp ? 'Add Next Follow-Up' : 'Add Client To-Do'}</h3>
          </div>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="client-interaction-form">
          <label>
            <span>{isFollowUp ? 'Follow-Up Title' : 'Todo Title'}</span>
            <input value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder={isFollowUp ? 'Follow up with client' : 'Enter todo title'} />
          </label>
          <label>
            <span>{isFollowUp ? 'Follow-Up Date' : 'Scheduled Date'}</span>
            <input type="date" value={draft.scheduledDate} onChange={(event) => update('scheduledDate', event.target.value)} />
          </label>
          <label>
            <span>{isFollowUp ? 'Follow-Up Time' : 'Scheduled Time'}</span>
            <input type="time" value={draft.scheduledTime} onChange={(event) => update('scheduledTime', event.target.value)} />
          </label>
          <label>
            <span>Client Number</span>
            <input value={draft.clientNumber || ''} readOnly />
          </label>
          <label>
            <span>Lead Number</span>
            <input value={draft.leadNumber || ''} readOnly />
          </label>
          <label>
            <span>Priority</span>
            <select value={draft.priority} onChange={(event) => update('priority', event.target.value)}>
              {['Low', 'Medium', 'High', 'Urgent'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Category</span>
            <select value={draft.category} onChange={(event) => update('category', event.target.value)}>
              {['General', 'Sales', 'Support', 'Development', 'Manager', 'Follow-Up'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Assign To User</span>
            <select value={draft.assignedTo} onChange={(event) => update('assignedTo', event.target.value)}>
              <option value="">Select user (optional)</option>
              {assignOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="wide">
            <span>Remarks / Description</span>
            <textarea value={draft.description} onChange={(event) => update('description', event.target.value)} placeholder={isFollowUp ? 'Enter follow-up remarks' : 'Enter todo description'} />
          </label>
        </div>
        <div className="client-interaction-modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={submit}>{isFollowUp ? 'Save Follow-Up' : 'Add To-Do'}</button>
        </div>
      </div>
    </div>
  );
}

function QuickStat({ label, value, icon: Icon }) {
  return (
    <div className="rounded-lg border border-white/80 bg-white/90 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-[#30737B]"><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-3 truncate text-sm font-black text-slate-950">{value || '-'}</p>
    </div>
  );
}

function StatusPill({ value }) {
  const current = value || '-';
  const statusClass = current === 'LIVE'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : current === 'SUSPENDED'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-rose-200 bg-rose-50 text-rose-700';

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${statusClass}`}>{current}</span>
  );
}

function InlineClientMeta({ label, value, icon: Icon, status = false }) {
  return (
    <div className="min-w-0 border-l-2 border-[#30737B]/20 pl-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-[#30737B]" />
        <p className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      </div>
      {status ? (
        <div className="mt-1"><StatusPill value={value} /></div>
      ) : (
        <p className="mt-1 truncate text-sm font-black text-slate-950">{value || '-'}</p>
      )}
    </div>
  );
}

function DetailSheet({ children, columns = 1 }) {
  return (
    <div className={`detail-sheet-grid detail-sheet-grid-${columns}`}>
      {children}
    </div>
  );
}

function DetailValue({ label, value, icon: Icon, link = false, actionUrl = '' }) {
  const isDocumentList = Array.isArray(value);
  const display = value || '-';
  return (
    <div className="detail-value-card group min-w-0 border-slate-100 px-4 py-3 transition hover:bg-emerald-50/50 sm:px-5">
      <div className="grid gap-3 xl:grid-cols-[minmax(150px,190px)_minmax(0,1fr)_auto] xl:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-[#30737B] ring-1 ring-emerald-100 transition group-hover:bg-white"><Icon className="h-4 w-4" /></span>}
          <p className="min-w-0 truncate text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
        </div>
        <div className="min-w-0 pl-11 xl:pl-0">
          {isDocumentList ? null : link && value ? (
            <a className="inline-flex max-w-full break-words text-sm font-black text-orange-600 underline" href={String(value).startsWith('http') ? value : `https://${value}`} target="_blank" rel="noreferrer">Visit website</a>
          ) : (
            <p className="break-words text-sm font-black leading-6 text-slate-900">{display}</p>
          )}
        </div>
        {actionUrl && !isDocumentList ? (
          <a
            href={normalizeDocumentUrl(actionUrl)}
            target="_blank"
            rel="noreferrer"
            className="btn-lift ml-11 inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-[#30737B] hover:bg-[#30737B] hover:text-white xl:ml-0"
            title={getDocumentLinkName(actionUrl, 0)}
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </a>
        ) : <span className="hidden xl:block" />}
      </div>
      {isDocumentList ? (
        value.length > 0 ? (
          <div className="mt-3 grid gap-2 pl-11 sm:grid-cols-2 xl:grid-cols-3">
            {value.map((url, index) => (
              <a
                key={`${url}-${index}`}
                href={normalizeDocumentUrl(url)}
                target="_blank"
                rel="noreferrer"
                className="btn-lift group/link flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700 hover:border-[#30737B]/40 hover:bg-white hover:text-[#30737B]"
                title={url}
              >
                <span className="min-w-0 truncate">{getDocumentLinkName(url, index)}</span>
                <span className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-black text-orange-600 shadow-sm group-hover/link:text-[#30737B]">View</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-2 pl-11 text-sm font-black text-slate-400">No documents uploaded.</p>
        )
      ) : null}
    </div>
  );
}

function QuotationHistory({ client, quotations, quotationContext }) {
  const navigate = useNavigate();
  const data = readClientData(client);
  const clientName = data.basic?.clientLegalName || data.basic?.tradeName || quotationContext?.clientName || 'Selected Client';
  const totalAmount = quotations.reduce((sum, quotation) => sum + (quotation.items || []).reduce((itemSum, item) => itemSum + (Number(item.basicAmount) || 0), 0), 0);
  const latestQuote = quotations[0];

  function openList() {
    navigate('/sales/quotations', { state: { quotationContext } });
  }

  function openPreview(quotation) {
    navigate('/sales/quotations', { state: { quotationContext, previewQuotationId: quotation._id || quotation.id } });
  }

  function reviseQuotation(quotation) {
    navigate('/sales/quotations', { state: { quotationContext, editQuotationId: quotation._id || quotation.id } });
  }

  return (
    <div className="mt-5 space-y-5">
      <section className="overflow-hidden rounded-xl border border-emerald-100 bg-[linear-gradient(135deg,#f0fdfa_0%,#ffffff_48%,#fff7ed_100%)] p-4 shadow-sm shadow-teal-900/5">
        <div className="grid gap-3 md:grid-cols-4">
          <QuotationStat label="Company" value={clientName} icon={Building2} />
          <QuotationStat label="Total Quotations" value={quotations.length} icon={FileText} />
          <QuotationStat label="Quote Value" value={formatInrValue(totalAmount)} icon={Database} />
          <QuotationStat label="Latest Quote" value={latestQuote?.quotationNumber || '-'} icon={CalendarDays} />
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#30737B]">Company Quotation Ledger</p>
          <h4 className="mt-1 text-xl font-black text-slate-950">{quotations.length ? `${quotations.length} quotation${quotations.length === 1 ? '' : 's'} mapped` : 'No quotations mapped yet'}</h4>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate('/sales/quotations?mode=add', { state: { quotationContext } })} className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-black text-white shadow-lg shadow-orange-500/20">
            <Plus className="h-4 w-4" /> New Quotation
          </button>
          <button type="button" onClick={openList} className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
            <Eye className="h-4 w-4" /> Open Quotation Desk
          </button>
        </div>
      </div>

      {quotations.length ? (
        <div className="space-y-4">
          {quotations.map((quotation, index) => (
            <QuotationHistoryCard
              key={quotation._id || quotation.id || index}
              quotation={quotation}
              index={index}
              onOpen={() => openList()}
              onPreview={() => openPreview(quotation)}
              onRevise={() => reviseQuotation(quotation)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-5 py-12 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-white text-[#30737B] shadow-sm"><FileText className="h-6 w-6" /></div>
          <p className="mt-4 text-lg font-black text-slate-800">Quotation History</p>
          <p className="mt-2 text-sm font-bold text-slate-500">No quotations mapped for this company yet.</p>
          <button type="button" onClick={() => navigate('/sales/quotations?mode=add', { state: { quotationContext } })} className="btn-lift mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-500 px-5 text-sm font-black text-white shadow-lg shadow-orange-500/20">
            <Plus className="h-4 w-4" /> Create Quotation
          </button>
        </div>
      )}
    </div>
  );
}

function QuotationStat({ label, value, icon: Icon }) {
  return (
    <div className="rounded-lg border border-white/80 bg-white/90 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-[#30737B]"><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-3 truncate text-base font-black text-slate-950">{value || '-'}</p>
    </div>
  );
}

function QuotationHistoryCard({ quotation, index, onOpen, onPreview, onRevise }) {
  const items = quotation.items || [];
  const details = quotation.leadDetails || {};
  const created = formatDisplayDate(quotation.createdAt || quotation.quotationDate);
  const total = items.reduce((sum, item) => sum + (Number(item.basicAmount) || 0), 0);
  const status = quotation.status === 'draft' ? 'Open' : quotation.status || 'Open';

  return (
    <article className="client-detail-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-xl hover:shadow-slate-900/10" style={{ animationDelay: `${index * 70}ms` }}>
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_65%,#fff7ed_100%)] p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase text-emerald-700">{status}</span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase text-emerald-700">{items.length} item{items.length === 1 ? '' : 's'}</span>
            <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black uppercase text-orange-700">{created}</span>
          </div>
          <h4 className="mt-3 text-2xl font-black text-slate-950">{quotation.quotationNumber || 'Quotation'}</h4>
          <p className="mt-1 text-sm font-bold uppercase text-slate-500">{details.companyName || '-'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onOpen} className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700"><Eye className="h-4 w-4" />Open</button>
          <button type="button" onClick={onPreview} className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-black text-orange-600 hover:bg-orange-50"><FileText className="h-4 w-4" />View Details</button>
          <button type="button" onClick={onRevise} className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-lg border border-orange-300 bg-white px-4 text-sm font-black text-orange-600"><Edit3 className="h-4 w-4" />Revise</button>
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <InlineClientMeta label="Contact Person" value={details.contactPerson || '-'} icon={UserRound} />
        <InlineClientMeta label="Prepared By" value={quotation.createdBy?.name || quotation.createdBy?.email || details.referredBy || '-'} icon={UserRound} />
        <InlineClientMeta label="Valid Until" value={formatDisplayDate(quotation.validUntil)} icon={CalendarDays} />
        <InlineClientMeta label="Basic Total" value={formatInrValue(total)} icon={Database} />
      </div>

      <div className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h5 className="font-black text-slate-900">Quotation Items</h5>
          <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">INR</span>
        </div>
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-600">
              <tr>
                {['#', 'Service Category', 'Services for the Year', 'EPR Category', 'PIBO Category', 'Unit', 'Basic Amount'].map((header) => (
                  <th key={header} className="border-r border-slate-200 px-4 py-3 last:border-r-0">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length ? items.map((item, itemIndex) => (
                <tr key={itemIndex} className="font-black uppercase text-slate-700 transition hover:bg-emerald-50/40">
                  <td className="px-4 py-4 text-emerald-700">{itemIndex + 1}</td>
                  <td className="px-4 py-4">{item.serviceCategory || '-'}</td>
                  <td className="px-4 py-4">{item.servicesForYear || '-'}</td>
                  <td className="px-4 py-4">{item.eprCategory || '-'}</td>
                  <td className="px-4 py-4">{item.piboCategory || '-'}</td>
                  <td className="px-4 py-4">{item.unit || '-'}</td>
                  <td className="px-4 py-4 text-right text-orange-600">{formatInrValue(item.basicAmount)}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="px-4 py-8 text-center font-black text-slate-400">No quotation items added.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}

