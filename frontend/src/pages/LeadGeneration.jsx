import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, CheckCircle2, ChevronDown, Clock3, ContactRound, CreditCard, Download, Edit3, Eye, FileText, Mail, MapPin, Phone, Plus, RefreshCw, Search, TrendingUp, Upload, UserCheck, UserPlus, UsersRound, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import DashboardShell from '../components/dashboard/DashboardShell';
import ProfileModal from '../components/dashboard/ProfileModal';
import ToastMessage from '../components/ToastMessage';
import SearchableSelect from '../components/form/SearchableSelect';
import PremiumDatePicker from '../components/form/PremiumDatePicker';
import PiboDependentSelect from '../components/form/PiboDependentSelect';
import { adminRoles } from '../constants/dashboard';
import api from '../services/api';
import { API_ENDPOINTS } from '../services/apiEndpoints';
import { fetchCcpLeadHistory, fetchCcpLeads } from '../services/ccpApi';
import { mergeLeadSources } from '../features/clientMaster/clientMaster.utils';
import { inferPiboParent, normalizeLegacyPiboCategory } from '../constants/piboCategories';

const emptyLead = {
  sourceLeadId: '',
  communicationMode: '',
  status: '',
  company: '',
  industryType: '',
  eprCategory: '',
  piboParent: '',
  piboCategoryParent: '',
  piboCategory: '',
  servicesOffered: '',
  addressLine1: '',
  addressLine2: '',
  addressLine3: '',
  landmark: '',
  state: '',
  city: '',
  pinCode: '',
  existingClient: 'No',
  website: '',
  salutation: '',
  contactPerson: '',
  designation: '',
  emails: '',
  emailsSentCount: '',
  lastEmailSent: '',
  mobileNo1: '',
  mobileNo2: '',
  businessCardUrl: '',
  referredBy: '',
  source: '',
  notes: '',
  assignedTo: '',
  assignedToText: '',
  assignedBy: '',
  importedCreatedBy: '',
  updatedBy: '',
  closedBy: '',
  closedByText: '',
  closedByEmail: '',
  leadDate: '',
  nextFollowUpDate: '',
  nextFollowUpTime: '',
  followUpRemarks: '',
  importedCreatedAt: '',
  importedUpdatedAt: ''
};

const tabs = [
  { id: 'basic', label: 'Company', icon: Building2 },
  { id: 'address', label: 'Address', icon: MapPin },
  { id: 'contact', label: 'Contact', icon: ContactRound },
  { id: 'assign', label: 'Assign', icon: UserCheck }
];
const options = {
  communicationMode: ['TeleCalling', 'Referral', 'Physical Visit', 'Campaign', 'Existing Client' , 'Web Database'],
  status: ['Potential - Interested', 'Potential - Not Interested', 'Need Assistance', 'Lost', 'Existing Client'],
  industryType: ["Automotive", "Chemicals", "Construction", "Consumer Goods", "E-commerce" , "Electronics" , "Energy" , "FMCG","Financial Services" , "Healthcare" , "Hospitality", "IT & Software" , "Logistics" , "Manufacturing","Pharmaceuticals", "Renewables", "Retail", "Telecom", "Waste Management", "Other" , "Food Manufacturing" , "Mechinical Industry" ,"Petrochemical", "Packaging Manufacture" , "Plastic Recycling" , "E-Waste Recycler" , "E-Waste Recycling"],
  eprCategory:  ["EPR - Plastic Waste", "EPR - E-Waste", "EPR - Battery Waste", "EPR - Paper Waste", "EPR - Water Waste", "EPR - C&D Waste", "EPR - Tyre Waste" , "EPR - Used Oil Waste" , "EPR - End of Life Vehicles" , "EPR - Non Ferrous"],
  servicesOffered:["EPR - Plastic Compliance", "Monthly Patraka", "ISO Certification", "N/A" , "CTE-CTO/CCA" , "EPR - E-Waste Compliance", "EPR - Battery Waste Compliance" , "C & D WASTE CONSULTANCY" , "EPR DIGITAL CREDIT" , "EPR - Used Oil Compliance" , "EPR - Waster Waste Compliance" , "EPR ETP Portal handling" , "Registration for Compositable Plastic"],
  states: [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Lakshadweep",
  "Puducherry"
],
  cities: ['Ahmedabad', 'Bengaluru', 'Delhi', 'Jaipur', 'Mumbai', 'Noida', 'Pune'],
    salutations: ["Mr.", "Ms.", "Mrs.", "Dr.", "Prfo." , "ER.","CA", "Adv."],
  designation: ["Manager", "Assistant Manager", "Compliance Head", "Compliance Officer", "Director", "Managing Director", "Partner" , "Proprietor" , "Operations Head" , "Sales Head" , "Purchase Head" , "Owner" , "CEO" , "CTO" , "CFO" , "Consultant" , "Executive" , "Officer" , "ASSITANT MANAGER" , "Other" , "Senior Executive - EHS" , "GENERAL MANAGER" , "Assistant Manager -EHS" , "Chief Accountant" , "HR & ACCOUNTS" , "Plant Accounts Manager" , "Company Secratary (CS)" , "Accounts Manager" , "Sales coordination" , "Purchase" , "AGM-Corporate Quality & MR", "HSE" , "Accountant" , "Manager - Environment Health & Safety" , "Sr Manager Procurement" , "HEAD- PRODUCTION & MAINTAINANCE - OPERATIONS" , "FOUNDER & CEO" , "Sr. Manager, Procurement" , "Global Procurement" , "PepsiCo Positive" , "Executive Purchase" , "HEAD-BUSINESS OPERATIONS" , "EHS" , "Sr. Executive Sustainability" , "Asst. Manager (Supply Chain)" , "Manager Environment" , "VICE PRESIDENT" , "Account Executive" , "EHS Manager – MRS" , "PLANT MANAGER" , "FOUNDER" , "Manager, HR & Admin" , "Business Head" , "Global Head-Collaborative ventures" , "General Service and Supplies, Global Procurement & Logistics, India" , "Commercial Executive" , "Sr. Officer (Eng.)" , "Joint Manager – Engineering Procurement"],
  source: ['Referral', 'Website', 'LinkedIn', 'Cold Call', 'Event', 'Existing Client']
};

const stateCities = {
  Gujarat: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar', 'Bhavnagar'],
  Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Thane', 'Aurangabad'],
  Karnataka: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi'],
  Delhi: ['New Delhi', 'North Delhi', 'South Delhi', 'East Delhi', 'West Delhi'],
  Rajasthan: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer'],
  'Uttar Pradesh': ['Noida', 'Lucknow', 'Kanpur', 'Ghaziabad', 'Varanasi'],
  Haryana: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Sonipat'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Tiruchirappalli'],
  Telangana: ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar'],
  'West Bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Siliguri'],
  Kerala: ['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur'],
  Punjab: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala'],
  Goa: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa']
};

function buildCcpLeadEditUrl(item = {}) {
  const template = import.meta.env.VITE_CCP_LEAD_EDIT_URL || 'https://ccp-henna.vercel.app/lead-generation?edit={id}&leadCode={leadCode}&name={name}';
  const id = item._id || item.id || item.sourceLeadId || item.leadCode || '';
  const leadCode = item.leadCode || item.sourceLeadId || '';
  const name = item.company || '';
  return template
    .replaceAll('{id}', encodeURIComponent(id))
    .replaceAll('{leadCode}', encodeURIComponent(leadCode))
    .replaceAll('{name}', encodeURIComponent(name));
}

function openCcpLeadEdit(item = {}) {
  window.open(buildCcpLeadEditUrl(item), '_blank', 'noopener,noreferrer');
}

function displayLeadId(item = {}) {
  const value = String(item.sourceLeadId || item.leadCode || '').trim();
  const businessMatch = value.match(/^ATPL-LEAD-(\d+)$/i);
  return businessMatch ? `ATPL-${businessMatch[1]}` : (value || '-');
}

export default function LeadGeneration() {
  const [currentUser, setCurrentUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [staff, setStaff] = useState([]);
  const [leads, setLeads] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [piboCategories, setPiboCategories] = useState([]);
  const [piboCategoriesLoading, setPiboCategoriesLoading] = useState(true);
  const [lead, setLead] = useState(emptyLead);
  const [editingLeadId, setEditingLeadId] = useState('');
  const [viewLead, setViewLead] = useState(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [viewMode, setViewMode] = useState('list');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelRows, setExcelRows] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  const resolvedPiboParent = lead.piboParent || lead.piboCategoryParent || inferPiboParent(lead.piboCategory);
  const isFirstStepReady = Boolean(lead.status && lead.company && resolvedPiboParent && lead.piboCategory && lead.servicesOffered);
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);
  const canUseExcelBulkImport = adminRoles.includes(currentUser?.role);

  const staffOptions = useMemo(() => staff.map((user) => ({
    value: user._id || user.id,
    label: `${user.name || user.email} (${user.team || 'Team'})`
  })), [staff]);
  const cityOptions = lead.state ? stateCities[lead.state] || [] : [];

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadPage() {
    setLoading(true);
    try {
      const meResponse = await api.get(API_ENDPOINTS.auth.me);
      const me = meResponse.data.user;
      setCurrentUser(me);
      const [ccpLeadsResult, quotationsResult, piboCategoriesResult] = await Promise.allSettled([
        fetchCcpLeads(),
        api.get(API_ENDPOINTS.quotations.list),
        api.get(API_ENDPOINTS.quotations.piboCategories)
      ]);
      const ccpLeads = ccpLeadsResult.status === 'fulfilled' && ccpLeadsResult.value.data?.ok !== false
        ? (ccpLeadsResult.value.data.leads || [])
        : [];
      setLeads(ccpLeads);
      setQuotations(quotationsResult.status === 'fulfilled' ? (quotationsResult.value.data.quotations || []) : []);
      setPiboCategories(piboCategoriesResult.status === 'fulfilled' ? (piboCategoriesResult.value.data.categories || []) : []);
      setPiboCategoriesLoading(false);
      try {
        const usersResponse = await api.get(API_ENDPOINTS.auth.users);
        setStaff(usersResponse.data.users || []);
      } catch {
        setStaff([meResponse.data.user]);
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to fetch lead data.');
      setLeads([]);
      setQuotations([]);
    } finally {
      setLoading(false);
      setPiboCategoriesLoading(false);
    }
  }

  async function addPiboCategory(parent, name) {
    const response = await api.post(API_ENDPOINTS.quotations.piboCategories, { parent, name });
    const category = response.data.category;
    setPiboCategories((current) => [...current, category]);
    return category;
  }

  function updateField(field, value) {
    setLead((current) => ({
      ...current,
      [field]: value,
      ...(field === 'state' ? { city: '' } : {})
    }));
  }

  function showToast(message, type = 'info') {
    setToast({ message, type });
  }

  function openTab(tabId) {
    if (tabId !== 'basic' && !isFirstStepReady) {
      showToast('First complete Company, Status, PIBO Category and Services Offered.', 'warning');
      return;
    }
    setActiveTab(tabId);
    showToast(`${tabs.find((tab) => tab.id === tabId)?.label || 'Step'} step opened.`, 'success');
  }

  function nextTab() {
    if (!isFirstStepReady) {
      setError('Complete Company, Status, PIBO Category, and Services Offered before moving ahead.');
      showToast('Complete required first-step fields before next step.', 'warning');
      return;
    }
    setError('');
    const next = tabs[Math.min(activeIndex + 1, tabs.length - 1)];
    setActiveTab(next.id);
    showToast(`${next.label} step unlocked.`, 'success');
  }

  function handleBusinessCard(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateField('businessCardUrl', reader.result);
    reader.readAsDataURL(file);
  }

  function resolveUserId(value) {
    const raw = normalizePersonName(value);
    if (!raw) return '';
    const match = staff.find((user) => normalizePersonName(user.name) === raw);
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
        showToast('No sheet found in this file.', 'error');
        return;
      }
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const parsed = rows
        .map((row) => mapExcelRowToLead(row, staff))
        .filter((row) => Object.values(row).some((value) => String(value || '').trim() !== ''));

      if (!parsed.length) {
        showToast('Excel has no usable rows.', 'warning');
        return;
      }

      setExcelRows(parsed);
      setLead({ ...emptyLead, ...parsed[0], assignedTo: resolveUserId(parsed[0].assignedTo) || parsed[0].assignedTo });
      setActiveTab('basic');
      showToast(`Loaded ${parsed.length} lead${parsed.length === 1 ? '' : 's'} from Excel. First row applied to form.`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Unable to read Excel file. Please upload a valid .xlsx file.', 'error');
    }
  }

  async function importExcelRows() {
    if (!excelRows.length) return;
    setImporting(true);
    setError('');
    setNotice('');
    try {
      const payload = excelRows.map((row) => {
        const assignedToText = row.assignedToText || row.assignedTo || '';
        return {
          ...row,
          assignedToText: String(assignedToText || '').trim(),
          assignedBy: String(row.assignedBy || '').trim(),
          importedCreatedBy: String(row.importedCreatedBy || '').trim(),
          existingClient: normalizeExistingClient(row.existingClient),
          assignedTo: resolveUserId(row.assignedTo || assignedToText) || '',
          workflowStatus: 'draft'
        };
      });
      const response = await api.post(API_ENDPOINTS.ccp.bulkCreateLeads, { leads: payload });
      const successCount = Number(response.data?.imported || response.data?.leads?.length || 0);
      const failures = Array.isArray(response.data?.failures) ? response.data.failures : [];

      if (successCount) {
        setNotice(`${successCount} lead${successCount === 1 ? '' : 's'} imported as drafts.`);
        showToast(`${successCount} lead${successCount === 1 ? '' : 's'} imported.`, 'success');
        await loadPage();
      }
      if (failures.length) {
        const message = `${failures.length} row${failures.length === 1 ? '' : 's'} failed. First: row ${failures[0].row} (${failures[0].error})`;
        setError(message);
        showToast(message, 'error');
      }
    } catch (err) {
      const failures = err?.response?.data?.failures || [];
      const message = failures.length
        ? `${failures.length} row${failures.length === 1 ? '' : 's'} failed. First: row ${failures[0].row} (${failures[0].error})`
        : err?.response?.data?.error || 'Unable to import leads';
      setError(message);
      showToast(message, 'error');
    } finally {
      setImporting(false);
    }
  }

  async function saveLead(workflowStatus) {
    if (saving) return;
    const required = workflowStatus === 'submitted' ? ['status', 'company', 'piboCategory', 'servicesOffered', 'addressLine1', 'state', 'city', 'pinCode'] : [];
    const missing = required.find((field) => !String(lead[field] ?? '').trim());
    if (missing) { setError(`${missing.replace(/([A-Z])/g, ' $1')} is required before submit.`); return; }
    if (workflowStatus === 'submitted' && !resolvedPiboParent) { setError('Applicant Type is required before submit.'); return; }
    const invalidEmail = String(lead.emails || '').split(',').map((email) => email.trim()).filter(Boolean).find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (invalidEmail) { setError(`Invalid email: ${invalidEmail}`); return; }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const leadPayload = {
        ...lead,
        piboParent: lead.piboParent || lead.piboCategoryParent || inferPiboParent(lead.piboCategory),
        workflowStatus
      };
      const response = editingLeadId ? await api.put(API_ENDPOINTS.ccp.updateLead(editingLeadId), leadPayload) : await api.post(API_ENDPOINTS.ccp.createLead, leadPayload);
      const savedLead = response.data.lead || response.data.data?.lead || response.data.data;
      if (!savedLead || typeof savedLead !== 'object') throw new Error('CCP did not return the saved lead.');
      setNotice(workflowStatus === 'submitted' ? 'Lead submitted successfully.' : 'Lead draft saved successfully.');
      showToast(workflowStatus === 'submitted' ? 'Lead submitted successfully.' : 'Lead draft saved successfully.', 'success');
      if (workflowStatus === 'submitted') setLead(emptyLead);
      setEditingLeadId('');
      setActiveTab('basic');
      await loadPage();
      if (workflowStatus === 'submitted') setViewMode('list');
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to save lead');
      showToast(err?.response?.data?.error || 'Unable to save lead', 'error');
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

  if (viewMode === 'list') {
    if (viewLead) {
      return (
        <DashboardShell currentUser={currentUser} onOpenProfile={() => setProfileOpen(true)} onLogout={handleLogout}>
          <LeadDetailView
            lead={viewLead}
            quotations={quotations}
            onBack={() => setViewLead(null)}
            onLeadUpdated={(updatedLead) => {
              setViewLead(updatedLead);
              setLeads((current) => current.map((item) => String(item._id || item.id) === String(updatedLead._id || updatedLead.id) ? updatedLead : item));
            }}
            onAddQuotation={(quotationId) => {
              if (quotationId) navigate('/sales/quotations', { state: { editQuotationId: quotationId } });
              else navigate('/sales/quotations?mode=add', {
                state: {
                  quotationContext: {
                    sourceType: 'lead',
                    leadId: viewLead._id || viewLead.id || viewLead.sourceLeadId || '',
                    leadCode: viewLead.leadCode || '',
                    company: viewLead.company || '',
                    contactPerson: viewLead.contactPerson || '',
                    designation: viewLead.designation || '',
                    mobileNo1: viewLead.mobileNo1 || '',
                    mobileNo2: viewLead.mobileNo2 || '',
                    addressLine1: viewLead.addressLine1 || '',
                    addressLine2: viewLead.addressLine2 || '',
                    addressLine3: viewLead.addressLine3 || '',
                    state: viewLead.state || '',
                    city: viewLead.city || '',
                    pinCode: viewLead.pinCode || '',
                    eprCategory: viewLead.eprCategory || '',
                    piboCategory: viewLead.piboCategory || ''
                  }
                }
              });
            }}
            onEdit={() => {
              setLead({
                ...emptyLead,
                ...viewLead,
                assignedTo: viewLead.assignedTo?._id || viewLead.assignedTo?.id || viewLead.assignedTo || '',
                closedBy: viewLead.closedBy?._id || viewLead.closedBy?.id || viewLead.closedBy || ''
              });
              setEditingLeadId(viewLead._id || viewLead.id || '');
              setViewLead(null);
              setActiveTab('basic');
              setViewMode('form');
            }}
          />
          {profileOpen && <ProfileModal user={currentUser} saving={false} onClose={() => setProfileOpen(false)} onLogout={handleLogout} onSave={() => {}} onUpdatePassword={() => {}} />}
        </DashboardShell>
      );
    }

    return (
      <DashboardShell currentUser={currentUser} onOpenProfile={() => setProfileOpen(true)} onLogout={handleLogout}>
        <LeadDirectoryView
          leads={leads}
          staff={staff}
          loading={loading}
          error={error}
          onRefresh={loadPage}
          onView={setViewLead}
          onCreate={() => { setLead({ ...emptyLead }); setEditingLeadId(''); setActiveTab('basic'); setViewMode('form'); }}
        />
        {profileOpen && <ProfileModal user={currentUser} saving={false} onClose={() => setProfileOpen(false)} onLogout={handleLogout} onSave={() => {}} onUpdatePassword={() => {}} />}
      </DashboardShell>
    );
  }

  return (
    <DashboardShell currentUser={currentUser} onOpenProfile={() => setProfileOpen(true)} onLogout={handleLogout}>
      {toast && (
        <div className="fixed right-5 top-24 z-[70] w-[min(430px,calc(100vw-40px))]">
          <ToastMessage type={toast.type} actionLabel="Close" onAction={() => setToast(null)}>{toast.message}</ToastMessage>
        </div>
      )}
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 shadow-sm ring-1 ring-emerald-100 sm:p-5 lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => setViewMode('list')} className="btn-lift inline-flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-100 bg-white text-emerald-700 shadow-sm">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">Sales</p>
                <h1 className="mt-1 text-3xl font-black text-slate-950">Lead Generation</h1>
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Step {activeIndex + 1} of {tabs.length}</p>
              <p className="mt-1 font-black text-emerald-700">{isFirstStepReady ? 'Workflow unlocked' : 'Complete first step'}</p>
            </div>
          </div>

          {canUseExcelBulkImport && <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-950">Excel upload (Lead Import)</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                Upload .xlsx with headers: Company, Status, Applicant Type, PIBO Subcategory, Services Offered, Address, City, PIN, State, Contact Person. Old “PIBO Category” files remain supported.
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
          </div>}

          <section className="mt-6 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-3 shadow-lg shadow-emerald-900/5">
            <div className="grid gap-2 sm:grid-cols-4">
              {tabs.map((tab, index) => {
                const Icon = tab.icon;
                const locked = tab.id !== 'basic' && !isFirstStepReady;
                const active = activeTab === tab.id;
                const complete = index === 0 && isFirstStepReady;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => openTab(tab.id)}
                    aria-disabled={locked}
                    title={locked ? 'Complete first step to unlock this tab' : tab.label}
                    className={`group relative min-h-14 overflow-hidden rounded-xl px-4 font-black transition duration-300 ${
                      active
                        ? 'bg-[#30737B] text-white shadow-lg shadow-teal-900/15'
                        : locked
                          ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                          : 'bg-white text-slate-600 hover:bg-teal-50 hover:text-[#30737B]'
                    }`}
                  >
                    <span className={`absolute inset-x-0 bottom-0 h-1 transition ${active ? 'bg-cyan-200' : 'bg-transparent'}`} />
                    <span className="relative flex items-center justify-center gap-2">
                      {complete ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Icon className="h-5 w-5" />}
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {error && <ToastMessage type="error" className="mt-5">{error}</ToastMessage>}
          {notice && <ToastMessage type="success" className="mt-5">{notice}</ToastMessage>}

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {activeTab === 'basic' && (
              <div className="grid gap-7">
                <LeadSection title="Client Communication Mode">
                  <SelectLike label="Client Communication Mode" value={lead.communicationMode} options={options.communicationMode} onChange={(value) => updateField('communicationMode', value)} />
                  <SelectLike required label="Status" value={lead.status} options={options.status} onChange={(value) => updateField('status', value)} />
                </LeadSection>
                <LeadSection title="Company Information">
                  <Field label="Lead ID"><input className="form-input bg-slate-100" value={displayLeadId(lead) === '-' ? 'Generated by CCP after save' : displayLeadId(lead)} readOnly /></Field>
                  <Field required label="Company"><input className="form-input" value={lead.company} onChange={(event) => updateField('company', event.target.value)} /></Field>
                  <SelectLike label="Industry Type" value={lead.industryType} options={options.industryType} onChange={(value) => updateField('industryType', value)} />
                  <SelectLike label="EPR Category" value={lead.eprCategory} options={options.eprCategory} onChange={(value) => updateField('eprCategory', value)} />
                  <div className="lg:col-span-2">
                    <PiboDependentSelect
                      required
                      parent={lead.piboParent || lead.piboCategoryParent || inferPiboParent(lead.piboCategory)}
                      value={lead.piboCategory}
                      categories={piboCategories}
                      loading={piboCategoriesLoading}
                      onChange={(parent, child) => setLead((current) => ({ ...current, piboParent: parent, piboCategoryParent: '', piboCategory: child }))}
                      onAddCategory={addPiboCategory}
                    />
                  </div>
                  <SelectLike required label="Services Offered" value={lead.servicesOffered} options={options.servicesOffered} onChange={(value) => updateField('servicesOffered', value)} />
                </LeadSection>
              </div>
            )}

            {activeTab === 'address' && (
              <LeadSection title="Address Information">
                <Field required label="Address Line 1"><input className="form-input" value={lead.addressLine1} onChange={(event) => updateField('addressLine1', event.target.value)} /></Field>
                <Field label="Address Line 2"><input className="form-input" value={lead.addressLine2} onChange={(event) => updateField('addressLine2', event.target.value)} /></Field>
                <Field label="Address Line 3"><input className="form-input" value={lead.addressLine3} onChange={(event) => updateField('addressLine3', event.target.value)} /></Field>
                <Field label="Landmark"><input className="form-input" value={lead.landmark} onChange={(event) => updateField('landmark', event.target.value)} /></Field>
                <SelectLike required label="State" value={lead.state} options={options.states} onChange={(value) => updateField('state', value)} />
                <SelectLike required label="City" value={lead.city} options={cityOptions} disabled={!lead.state} placeholder={lead.state ? 'Select or type to create new' : 'Select state first'} onChange={(value) => updateField('city', value)} />
                <Field required label="PIN Code"><input className="form-input" value={lead.pinCode} onChange={(event) => updateField('pinCode', event.target.value)} /></Field>
                <Field label="Existing Client?"><SearchableSelect value={lead.existingClient} options={['No', 'Yes']} onChange={(value) => updateField('existingClient', value)} placeholder="Select client status" /></Field>
                <Field label="Website"><input className="form-input" placeholder="https://example.com" value={lead.website} onChange={(event) => updateField('website', event.target.value)} /></Field>
              </LeadSection>
            )}

            {activeTab === 'contact' && (
              <div className="grid gap-7">
                <LeadSection title="Contact Information">
                  <SelectLike label="Salutation" value={lead.salutation} options={options.salutations} onChange={(value) => updateField('salutation', value)} />
                  <Field label="Contact Person"><input className="form-input" value={lead.contactPerson} onChange={(event) => updateField('contactPerson', event.target.value)} /></Field>
                  <SelectLike label="Designation" value={lead.designation} options={options.designation} onChange={(value) => updateField('designation', value)} />
                  <Field label="Email(s)"><input className="form-input" placeholder="email@example.com, email2@example.com" value={lead.emails} onChange={(event) => updateField('emails', event.target.value)} /></Field>
                  <Field label="Mobile No. 1"><input className="form-input" value={lead.mobileNo1} onChange={(event) => updateField('mobileNo1', event.target.value)} /></Field>
                  <Field label="Mobile No. 2"><input className="form-input" value={lead.mobileNo2} onChange={(event) => updateField('mobileNo2', event.target.value)} /></Field>
                  <Field label="Business Card">
                    <div className="grid gap-3">
                      <input className="form-input" placeholder="Business Card URL" value={lead.businessCardUrl} onChange={(event) => updateField('businessCardUrl', event.target.value)} />
                      <div className="flex flex-wrap gap-2">
                        <label className="btn-lift inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 font-black text-slate-800 hover:bg-slate-50">
                          <Upload className="h-4 w-4" /> Upload
                          <input type="file" accept="image/*,.pdf" onChange={handleBusinessCard} className="sr-only" />
                        </label>
                        {lead.businessCardUrl && (
                          <button type="button" onClick={() => window.open(lead.businessCardUrl, '_blank', 'noopener,noreferrer')} className="btn-lift inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 font-black text-emerald-700 hover:bg-emerald-100">
                            <Eye className="h-4 w-4" /> View
                          </button>
                        )}
                      </div>
                    </div>
                  </Field>
                </LeadSection>
                <LeadSection title="Additional Information" columns="lg:grid-cols-2">
                  <SelectLike label="Referred By" value={lead.referredBy} options={staffOptions.map((item) => item.label)} onChange={(value) => updateField('referredBy', value)} />
                  <SelectLike label="Source" value={lead.source} options={options.source} onChange={(value) => updateField('source', value)} />
                  <Field label="Emails Sent Count"><input className="form-input" value={lead.emailsSentCount} onChange={(event) => updateField('emailsSentCount', event.target.value)} /></Field>
                  <Field label="Last Email Sent"><PremiumDatePicker value={lead.lastEmailSent} onChange={(event) => updateField('lastEmailSent', event.target.value)} /></Field>
                  <Field label="Lead Date"><PremiumDatePicker value={lead.leadDate} onChange={(event) => updateField('leadDate', event.target.value)} /></Field>
                  <Field label="Next Follow-Up Date"><PremiumDatePicker value={lead.nextFollowUpDate} onChange={(event) => updateField('nextFollowUpDate', event.target.value)} /></Field>
                  <Field label="Next Follow-Up Time"><input className="form-input" value={lead.nextFollowUpTime} onChange={(event) => updateField('nextFollowUpTime', event.target.value)} /></Field>
                  <Field label="Follow-Up Remarks"><input className="form-input" value={lead.followUpRemarks} onChange={(event) => updateField('followUpRemarks', event.target.value)} /></Field>
                  <Field label="Notes" className="lg:col-span-2"><textarea className="form-input min-h-[120px] resize-y py-3" value={lead.notes} onChange={(event) => updateField('notes', event.target.value)} /></Field>
                </LeadSection>
              </div>
            )}

            {activeTab === 'assign' && (
              <LeadSection title="Assign Lead" columns="grid-cols-1">
                <SelectLike label="Assign To Staff" value={lead.assignedTo} options={staffOptions} placeholder="Select staff member" onChange={(value) => {
                  const user = staff.find((item) => String(item._id || item.id) === String(value));
                  setLead((current) => ({ ...current, assignedTo: value, assignedToCrmUserId: value, assignedToEmail: user?.email || '', assignedToText: user?.name || user?.email || '', assignedBy: currentUser?.name || currentUser?.email || '' }));
                }} />
                <SelectLike label="Lead Closed By" value={lead.closedBy} options={staffOptions} placeholder="Select user who closed the lead" onChange={(value) => {
                  const user = staff.find((item) => String(item._id || item.id) === String(value));
                  setLead((current) => ({ ...current, closedBy: value, closedByCrmUserId: value, closedByText: user?.name || user?.email || '', closedByEmail: user?.email || '' }));
                }} />
              </LeadSection>
            )}

            <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setViewMode('list')} className="btn-lift min-h-11 rounded-xl border border-slate-200 px-8 font-black text-slate-700">Cancel</button>
              <button type="button" disabled={saving} onClick={() => saveLead('draft')} className="btn-lift min-h-11 rounded-xl border border-orange-200 px-8 font-black text-orange-600 hover:bg-orange-50">Save Draft</button>
              {activeTab === 'assign' ? (
                <button type="button" disabled={saving} onClick={() => saveLead('submitted')} className="btn-lift min-h-11 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-8 font-black text-white shadow-lg shadow-orange-600/20">Submit</button>
              ) : (
                <button type="button" onClick={nextTab} className="btn-lift min-h-11 rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 px-8 font-black text-white shadow-lg shadow-emerald-700/20">Next Step</button>
              )}
            </div>
          </section>
        </div>
      </div>
      {profileOpen && <ProfileModal user={currentUser} saving={false} onClose={() => setProfileOpen(false)} onLogout={handleLogout} onSave={() => {}} onUpdatePassword={() => {}} />}
    </DashboardShell>
  );
}

function LeadSection({ title, children, columns = 'sm:grid-cols-2 xl:grid-cols-3' }) {
  return (
    <section>
      <h2 className="text-2xl font-black text-slate-950">{title}</h2>
      <div className={`mt-5 grid gap-5 ${columns}`}>{children}</div>
    </section>
  );
}

function StaffFilterSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef(null);
  const selected = options.find((option) => String(option.value) === String(value));
  const filtered = options.filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  function choose(nextValue) {
    onChange(nextValue);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={rootRef} className={`lead-staff-filter ${open ? 'is-open' : ''}`}>
      <button type="button" className="lead-staff-trigger" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="lead-staff-icon"><UserCheck className="h-4 w-4" /></span>
        <span className="lead-staff-copy"><small>Staff filter</small><strong>{selected?.label || 'All Staff'}</strong></span>
        <ChevronDown className="lead-staff-chevron h-4 w-4" />
      </button>
      {open && (
        <div className="lead-staff-menu">
          <div className="lead-staff-search">
            <Search className="h-4 w-4" />
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff..." />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X className="h-4 w-4" /></button>}
          </div>
          <div className="lead-staff-options" role="listbox">
            {!search && <button type="button" role="option" aria-selected={!value} className="lead-staff-option" onClick={() => choose('')}><span className="lead-staff-option-avatar"><UsersRound className="h-4 w-4" /></span><strong>All Staff</strong>{!value && <CheckCircle2 className="h-4 w-4" />}</button>}
            {filtered.map((option) => (
              <button key={option.value} type="button" role="option" aria-selected={String(option.value) === String(value)} className="lead-staff-option" onClick={() => choose(option.value)}>
                <span className="lead-staff-option-avatar">{option.label.slice(0, 1).toUpperCase()}</span>
                <strong>{option.label}</strong>
                {String(option.value) === String(value) && <CheckCircle2 className="h-4 w-4" />}
              </button>
            ))}
            {!filtered.length && search && <div className="lead-staff-empty">No staff member found</div>}
          </div>
          <div className="lead-staff-foot">{filtered.length} staff member{filtered.length === 1 ? '' : 's'}</div>
        </div>
      )}
    </div>
  );
}

function LeadDirectoryView({ leads, staff, loading, error, onRefresh, onView, onCreate }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [staffFilter, setStaffFilter] = useState('');
  const [metricFilter, setMetricFilter] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(1);

  const filteredLeads = useMemo(() => {
    const term = query.trim().toLowerCase();
    return leads.slice().sort(compareLeadCode).filter((item) => {
      const assignedId = item.assignedTo?._id || item.assignedTo?.id || item.assignedTo || '';
      const isExisting = item.existingClient === 'Yes' || item.status === 'Existing Client';
      const isNew = item.existingClient !== 'Yes' && item.status !== 'Existing Client';
      const haystack = [
        item.leadCode,
        item.company,
        item.addressLine1,
        item.city,
        item.pinCode,
        item.piboCategory,
        item.eprCategory,
        item.state,
        item.contactPerson,
        item.mobileNo1,
        item.emails,
        item.status
      ].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !term || haystack.includes(term);
      const matchesStatus = !statusFilter || item.status === statusFilter;
      const selectedStaff = staff.find((user) => String(user._id || user.id) === String(staffFilter));
      const assignedName = normalizePersonName(item.assignedTo?.name || item.assignedToText || item.assignedTo);
      const matchesStaff = !staffFilter ||
        String(assignedId) === String(staffFilter) ||
        (String(staffFilter).startsWith('name:') && assignedName === normalizePersonName(String(staffFilter).slice(5))) ||
        Boolean(selectedStaff && assignedName === normalizePersonName(selectedStaff.name));
      const matchesMetric =
        !metricFilter ||
        metricFilter === 'all' ||
        (metricFilter === 'converted' && isExisting) ||
        (metricFilter === 'existing' && isExisting) ||
        (metricFilter === 'new' && isNew);
      return matchesSearch && matchesStatus && matchesStaff && matchesMetric;
    });
  }, [leads, metricFilter, query, staff, staffFilter, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [metricFilter, query, rowsPerPage, staffFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / rowsPerPage));
  const visibleLeads = filteredLeads.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const staffFilterOptions = useMemo(() => {
    const optionsMap = new Map();
    staff.forEach((user) => {
      const value = String(user._id || user.id || user.name || user.email || '');
      const label = user.name || user.email;
      if (value && label) optionsMap.set(value, { value, label });
    });
    leads.forEach((item) => {
      const label = item.assignedTo?.name || item.assignedToText || (typeof item.assignedTo === 'string' ? item.assignedTo : '');
      if (label) optionsMap.set(`name:${label.toLowerCase()}`, { value: `name:${label}`, label });
    });
    return [...optionsMap.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [leads, staff]);
  const existingClients = leads.filter((item) => item.existingClient === 'Yes' || item.status === 'Existing Client').length;
  const newLeads = leads.filter((item) => item.existingClient !== 'Yes' && item.status !== 'Existing Client').length;
  const converted = existingClients;
  const metricStats = [
    { label: 'Total Leads', value: leads.length, note: 'Complete lead universe', icon: UsersRound, tone: 'emerald', filter: 'all' },
    { label: 'Converted to Sales', value: converted, note: 'Sales-ready conversions', icon: TrendingUp, tone: 'sky', filter: 'converted' },
    { label: 'Existing Clients', value: existingClients, note: 'Existing or converted clients', icon: CheckCircle2, tone: 'teal', filter: 'existing' },
    { label: 'New Leads', value: newLeads, note: 'Fresh non-client records', icon: UserPlus, tone: 'violet', filter: 'new' }
  ];
  const selectedMetric = metricStats.find((stat) => stat.filter === metricFilter);

  function exportExcel() {
    const rows = filteredLeads.map((item) => ({
      'Lead ID': displayLeadId(item),
      'Excel Lead ID': item.sourceLeadId || '',
      Company: item.company || '',
      Industry: item.industryType || '',
      Status: item.status || '',
      'Applicant Type': item.piboParent || item.piboCategoryParent || inferPiboParent(item.piboCategory),
      'PIBO Subcategory': item.piboCategory || '',
      'EPR Category': item.eprCategory || '',
      'Services Offered': item.servicesOffered || '',
      Address: item.addressLine1 || '',
      City: item.city || '',
      PIN: item.pinCode || '',
      State: item.state || '',
      'Contact Person': item.contactPerson || '',
      Designation: item.designation || '',
      'Mobile 1': item.mobileNo1 || '',
      'Mobile 2': item.mobileNo2 || '',
      Email: item.emails || '',
      Website: item.website || '',
      'Emails Sent Count': item.emailsSentCount || '',
      'Last Email Sent': item.lastEmailSent || '',
      'Referred By': item.referredBy || '',
      Source: item.source || '',
      Notes: item.notes || '',
      'Assigned To': item.assignedTo?.name || item.assignedToText || '',
      'Assigned By': item.assignedBy || '',
      'Created By': item.importedCreatedBy || '',
      'Lead Date': item.leadDate || '',
      'Next Follow-Up Date': item.nextFollowUpDate || '',
      'Next Follow-Up Time': item.nextFollowUpTime || '',
      'Follow-Up Remarks': item.followUpRemarks || '',
      'Created At': item.importedCreatedAt || item.createdAt || '',
      'Updated At': item.importedUpdatedAt || item.updatedAt || '',
      'Business Card URL': item.businessCardUrl || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
    const suffix = selectedMetric?.label || statusFilter || 'All Leads';
    XLSX.writeFile(workbook, `${suffix.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'leads'}.xlsx`);
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-7">
        <LeadStoryStats
          activeFilter={metricFilter}
          onFilterChange={(filter) => setMetricFilter((current) => (current === filter ? '' : filter))}
          stats={metricStats} 
        />

        {selectedMetric && (
          <MetricOutputCard
            stat={selectedMetric}
            leads={filteredLeads}
            onClose={() => setMetricFilter('')}
            onExport={exportExcel}
          />
        )}

        {error && <ToastMessage type="error">{error}</ToastMessage>}

        <div className="grid gap-3 rounded-2xl border border-slate-100 bg-white/70 p-3 shadow-sm xl:grid-cols-[minmax(220px,1.1fr)_minmax(190px,0.9fr)_minmax(190px,0.9fr)_auto] xl:items-center">
          <div className="relative min-w-0">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-12 w-full rounded-lg border border-slate-200 bg-white px-5 pr-12 text-base font-black text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100" />
            <Search className="pointer-events-none absolute right-6 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400" />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="form-input min-h-12 rounded-lg xl:max-w-none">
            <option value="">All Status</option>
            {options.status.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <StaffFilterSelect value={staffFilter} options={staffFilterOptions} onChange={setStaffFilter} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex xl:justify-end">
            <button type="button" onClick={onCreate} className="btn-lift inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#30737B] px-4 text-sm font-black text-white shadow-lg shadow-teal-900/20"><Plus className="h-4 w-4" />Add Lead</button>
            <button type="button" onClick={() => { setQuery(''); setStatusFilter(''); setStaffFilter(''); setMetricFilter(''); setPage(1); }} className="btn-lift inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" />Clear</button>
            <button type="button" onClick={onRefresh} className="btn-lift inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-orange-200 bg-white px-4 text-sm font-black text-orange-600 hover:bg-orange-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
            <button type="button" onClick={exportExcel} className="btn-lift inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-lg shadow-emerald-600/20"><Download className="h-4 w-4" />Export</button>
          </div>
        </div>

        <DirectoryTableHeader showing={visibleLeads.length} total={filteredLeads.length} label="leads" rowsPerPage={rowsPerPage} setRowsPerPage={setRowsPerPage} page={page} setPage={setPage} totalPages={totalPages} />
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="lead-directory-scroll max-h-[520px] overflow-auto">
            <table className="crm-data-table w-full min-w-[2150px] table-fixed text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-black uppercase tracking-[0.06em] text-slate-500 shadow-sm">
                <tr>
                  {[
                    ['Lead ID', 'w-[190px]'],
                    ['Company', 'w-[170px]'],
                    ['Address', 'w-[250px]'],
                    ['City', 'w-[130px]'],
                    ['PIN', 'w-[95px]'],
                    ['State', 'w-[130px]'],
                    ['PIBO Category', 'w-[150px]'],
                    ['EPR Category', 'w-[170px]'],
                    ['Contact Person', 'w-[170px]'],
                    ['Mobile 1', 'w-[130px]'],
                    ['Email', 'w-[210px]'],
                    ['Assigned To', 'w-[150px]'],
                    ['Assigned By', 'w-[150px]'],
                    ['Created By', 'w-[150px]'],
                    ['Status', 'w-[140px]'],
                    ['Actions', 'w-[110px]']
                  ].map(([header, width]) => <th key={header} className={`px-5 py-4 ${width}`}>{header}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {visibleLeads.length === 0 ? (
                  <tr><td colSpan={16} className="px-5 py-12 text-center font-black text-slate-400">{loading ? 'Loading CCP leads...' : 'No leads found.'}</td></tr>
                ) : visibleLeads.map((item) => (
                  <tr key={item._id || item.id} className="transition hover:bg-orange-50/60">
                    <td className="lead-directory-id-cell px-5 py-4 font-black text-slate-900"><span title={displayLeadId(item)}>{displayLeadId(item)}</span></td>
                    <td className="px-5 py-4 font-black uppercase text-slate-600"><span className="cell-clamp">{item.company || '-'}</span></td>
                    <td className="px-5 py-4 font-black uppercase text-slate-500"><span className="cell-clamp">{item.addressLine1 || '-'}</span></td>
                    <td className="px-5 py-4 font-black uppercase text-slate-500"><span className="cell-clip">{item.city || '-'}</span></td>
                    <td className="px-5 py-4 font-black text-slate-500"><span className="cell-clip">{item.pinCode || '-'}</span></td>
                    <td className="px-5 py-4 font-black uppercase text-slate-500"><span className="cell-clip">{item.state || '-'}</span></td>
                    <td className="px-5 py-4 font-black uppercase text-slate-500"><span className="cell-clamp">{item.piboCategory || '-'}</span></td>
                    <td className="px-5 py-4 font-black uppercase text-slate-500"><span className="cell-clamp">{item.eprCategory || '-'}</span></td>
                    <td className="px-5 py-4 font-black uppercase text-slate-500"><span className="cell-clamp">{item.contactPerson || '-'}</span></td>
                    <td className="px-5 py-4 font-black text-slate-500"><span className="cell-clip">{item.mobileNo1 || '-'}</span></td>
                    <td className="px-5 py-4 font-black text-slate-500"><span className="cell-clip normal-case">{item.emails || '-'}</span></td>
                    <td className="px-5 py-4 font-black uppercase text-slate-600"><span className="cell-clamp">{item.assignedTo?.name || item.assignedToText || '-'}</span></td>
                    <td className="px-5 py-4 font-black uppercase text-slate-600"><span className="cell-clamp">{item.assignedBy || '-'}</span></td>
                    <td className="px-5 py-4 font-black uppercase text-slate-600"><span className="cell-clamp">{item.importedCreatedBy || '-'}</span></td>
                    <td className="px-5 py-4"><span className="rounded-lg bg-lime-50 px-3 py-1 text-xs font-black text-lime-700 ring-1 ring-lime-200">{item.status || 'Draft'}</span></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => onView(item)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="View"><Eye className="h-4 w-4" /></button>
                        <button type="button" onClick={() => openCcpLeadEdit(item)} className="grid h-9 w-9 place-items-center rounded-lg border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100" title="Edit in CCP"><Edit3 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="btn-lift min-h-11 rounded-lg border border-slate-200 bg-white px-5 font-black text-slate-600 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
          <span className="rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600">Page {page} of {totalPages}</span>
          <button type="button" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="btn-lift min-h-11 rounded-lg border border-slate-200 bg-white px-5 font-black text-slate-600 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-black text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function SelectLike({ label, required, value, options = [], onChange, disabled = false, placeholder = 'Select or type to create new' }) {
  return (
    <Field label={label} required={required}>
      <SearchableSelect value={value} options={options} onChange={onChange} disabled={disabled} placeholder={placeholder} />
    </Field>
  );
}

function useCountUp(value, active, duration = 850) {
  const [displayValue, setDisplayValue] = useState(active ? value : 0);

  useEffect(() => {
    if (!active) {
      setDisplayValue(0);
      return undefined;
    }

    const start = performance.now();
    const from = 0;
    const to = Number(value) || 0;
    let frameId;

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(from + (to - from) * eased));
      if (progress < 1) frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active, duration, value]);

  return displayValue;
}

function LeadStoryStats({ stats, activeFilter, onFilterChange }) {
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    setVisibleCount(1);
    const timers = stats.slice(1).map((_, index) =>
      window.setTimeout(() => setVisibleCount(index + 2), 900 * (index + 1))
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [stats.length]);

  return (
    <section className="lead-story-panel">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Lead Performance Flow</p>
          <h2 className="mt-2 text-3xl font-black text-slate-950">Live lead movement</h2>
        </div>
        <p className="max-w-xl text-sm font-bold text-slate-500">
          Each number opens in sequence so the dashboard feels alive while still staying clear and scan-friendly.
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:gap-6">
        {stats.map((stat, index) => (
          <LeadStoryCard
            key={stat.label}
            stat={stat}
            index={index}
            active={index < visibleCount}
            selected={Boolean(stat.filter && activeFilter === stat.filter)}
            onSelect={stat.filter ? () => onFilterChange(stat.filter) : undefined}
            showArrow={index < stats.length - 1}
            arrowActive={index < visibleCount - 1}
          />
        ))}
      </div>
    </section>
  );
}

function LeadStoryCard({ stat, index, active, selected, onSelect, showArrow, arrowActive }) {
  const Icon = stat.icon;
  const value = useCountUp(stat.value, active);
  const Component = onSelect ? 'button' : 'article';

  return (
    <Component type={onSelect ? 'button' : undefined} onClick={onSelect} className={`lead-story-card lead-story-${stat.tone} ${active ? 'lead-story-card-active' : ''} ${selected ? 'lead-story-card-selected' : ''}`} style={{ '--delay': `${index * 110}ms` }}>
      {showArrow && <span className={`lead-story-arrow ${arrowActive ? 'lead-story-arrow-active' : ''}`} />}
      <div className="lead-story-topline" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-black uppercase tracking-[0.14em] text-slate-500">{stat.label}</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
        </div>
        <span className="lead-story-icon">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-[11px] font-black uppercase leading-4 text-slate-500">{stat.note}</p>
    </Component>
  );
}

function MetricOutputCard({ stat, leads, onClose, onExport }) {
  const Icon = stat.icon;
  const preview = leads.slice(0, 10);

  return (
    <section className={`metric-output-card lead-story-${stat.tone}`}>
      <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="lead-story-icon">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Selected Output</p>
            <h3 className="truncate text-xl font-black text-slate-950">{stat.label}</h3>
          </div>
          <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">{leads.length} records</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onExport} className="btn-lift inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-lg shadow-emerald-600/20">
            <Download className="h-4 w-4" /> Export
          </button>
          <button type="button" onClick={onClose} className="btn-lift inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 hover:bg-slate-50">
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </div>

      <div className="hidden-scrollbar max-h-[320px] overflow-auto">
        <table className="crm-data-table w-full min-w-[980px] table-fixed text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-black uppercase tracking-[0.06em] text-slate-500">
            <tr>
              {['Lead ID', 'Company', 'City', 'State', 'Contact', 'Mobile', 'Status'].map((header) => (
                <th key={header} className="px-4 py-3">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {preview.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center font-black text-slate-400">No records found.</td></tr>
            ) : preview.map((item) => (
              <tr key={item._id || item.id} className="transition hover:bg-orange-50/60">
                <td className="px-4 py-3 font-black text-slate-900"><span className="cell-clip">{displayLeadId(item)}</span></td>
                <td className="px-4 py-3 font-black uppercase text-slate-600"><span className="cell-clamp">{item.company || '-'}</span></td>
                <td className="px-4 py-3 font-black uppercase text-slate-500"><span className="cell-clip">{item.city || '-'}</span></td>
                <td className="px-4 py-3 font-black uppercase text-slate-500"><span className="cell-clip">{item.state || '-'}</span></td>
                <td className="px-4 py-3 font-black uppercase text-slate-500"><span className="cell-clip">{item.contactPerson || '-'}</span></td>
                <td className="px-4 py-3 font-black text-slate-500"><span className="cell-clip">{item.mobileNo1 || '-'}</span></td>
                <td className="px-4 py-3"><span className="rounded-lg bg-lime-50 px-3 py-1 text-xs font-black text-lime-700 ring-1 ring-lime-200">{item.status || 'Draft'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {leads.length > preview.length && (
        <p className="border-t border-slate-100 px-4 py-3 text-sm font-bold text-slate-500">
          Showing first {preview.length} records here. Export includes all {leads.length} filtered records.
        </p>
      )}
    </section>
  );
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatFollowUpDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function buildLeadFollowUpRows(lead = {}) {
  const rows = [];
  if (lead.nextFollowUpDate || lead.nextFollowUpTime || lead.followUpRemarks) {
    rows.push({
      id: 'current-follow-up',
      scheduledDate: lead.nextFollowUpDate || '',
      scheduledTime: lead.nextFollowUpTime || '',
      remarks: lead.followUpRemarks || '',
      reason: 'Current follow-up',
      createdAt: lead.updatedAt || lead.createdAt || ''
    });
  }
  (Array.isArray(lead.followUpHistory) ? lead.followUpHistory : []).forEach((item, index) => {
    rows.push({
      id: item.id || `history-${index}`,
      scheduledDate: item.scheduledDate || item.nextFollowUpDate || '',
      scheduledTime: item.scheduledTime || item.nextFollowUpTime || '',
      remarks: item.remarks || item.followUpRemarks || '',
      reason: item.reason || item.updateReason || '',
      createdAt: item.createdAt || ''
    });
  });
  return rows;
}

function LeadDetailView({ lead, quotations = [], onBack, onEdit, onAddQuotation, onLeadUpdated }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [detailLead, setDetailLead] = useState(lead);
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [followUpError, setFollowUpError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState({ events: [], summary: {} });
  const [historyFilter, setHistoryFilter] = useState('all');
  const [followUpDraft, setFollowUpDraft] = useState({
    scheduledDate: todayDateKey(),
    scheduledTime: '',
    remarks: '',
    reason: ''
  });
  useEffect(() => {
    setDetailLead(lead);
  }, [lead]);
  const activeLead = detailLead || lead;
  const hasBusinessCard = Boolean(activeLead.businessCardUrl);
  const companyName = activeLead.company || 'Lead Details';
  const initials = companyName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'LD';
  const location = [activeLead.city, activeLead.state, activeLead.pinCode].filter(Boolean).join(', ');
  const leadQuotations = quotations.filter((quotation) => {
    const normalize = (value) => String(value || '').trim().toLowerCase();
    const crmLeadIds = [activeLead._id, activeLead.id].map(normalize).filter(Boolean);
    const ccpLeadIds = [activeLead.sourceLeadId, activeLead.ccpLeadId, activeLead.externalLeadId, activeLead._id, activeLead.id].map(normalize).filter(Boolean);
    const quotationLeadId = normalize(quotation.leadId?._id || quotation.leadId?.id || quotation.leadId);
    const quotationCcpLeadId = normalize(quotation.ccpLeadId || quotation.sourceLeadId || quotation.externalLeadId);
    const quotationLeadCode = normalize(quotation.leadCode);
    return Boolean(
      (quotationLeadId && crmLeadIds.includes(quotationLeadId))
      || (quotationCcpLeadId && ccpLeadIds.includes(quotationCcpLeadId))
      || (quotationLeadCode && quotationLeadCode === normalize(activeLead.leadCode))
    );
  });
  const followUpRows = buildLeadFollowUpRows(activeLead);
  const todayKey = todayDateKey();
  const upcomingFollowUps = followUpRows
    .filter((item) => item.scheduledDate && item.scheduledDate >= todayKey)
    .sort((a, b) => `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`));
  const previousFollowUps = followUpRows
    .filter((item) => !item.scheduledDate || item.scheduledDate < todayKey)
    .sort((a, b) => `${b.scheduledDate} ${b.scheduledTime}`.localeCompare(`${a.scheduledDate} ${a.scheduledTime}`));
  const basicInfoRows = [
    ['Lead ID', displayLeadId(activeLead), FileText],
    ['Company', activeLead.company, Building2],
    ['Industry', activeLead.industryType, Building2],
    ['Status', activeLead.status, CheckCircle2, 'pill'],
    ['EPR Category', activeLead.eprCategory, FileText],
    ['PIBO Category', activeLead.piboCategory, FileText],
    ['Services Offered', activeLead.servicesOffered, CheckCircle2],
    ['Source', activeLead.source, FileText]
  ];
  const addressInfoRows = [
    ['Address Line 1', activeLead.addressLine1, MapPin],
    ['Address Line 2', activeLead.addressLine2, MapPin],
    ['Address Line 3', activeLead.addressLine3, MapPin],
    ['State', activeLead.state, MapPin],
    ['City', activeLead.city, MapPin],
    ['PIN', activeLead.pinCode, MapPin],
    ['Website', activeLead.website, Eye],
    ['Notes', activeLead.notes || 'Not specified', FileText]
  ];
  const contactInfoRows = [
    ['Contact Person', activeLead.contactPerson, ContactRound],
    ['Designation', activeLead.designation, ContactRound],
    ['Mobile 1', activeLead.mobileNo1, Phone],
    ['Mobile 2', activeLead.mobileNo2, Phone],
    ['Email', activeLead.emails, Mail],
    ['Emails Sent', activeLead.emailsSentCount || 0, Mail],
    ['Last Email Sent', activeLead.lastEmailSent || 'No emails sent yet', Mail],
    ['Referred By', activeLead.referredBy, UserCheck]
  ];
  const assignedRows = [
    ['Assigned To', activeLead.assignedTo?.name || activeLead.assignedToText],
    ['Assigned Email', activeLead.assignedTo?.email],
    ['Assigned By', activeLead.assignedBy],
    ['Lead Closed By', activeLead.closedBy?.name || activeLead.closedByText],
    ['Closed By Email', activeLead.closedBy?.email || activeLead.closedByEmail],
    ['Lead Date', activeLead.leadDate],
    ['Next Follow-Up Date', activeLead.nextFollowUpDate],
    ['Next Follow-Up Time', activeLead.nextFollowUpTime],
    ['Follow-Up Remarks', activeLead.followUpRemarks]
  ];
  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'assigned', label: 'Assigned Users', icon: UserCheck },
    { id: 'business', label: 'Business Card', icon: CreditCard },
    { id: 'quotation', label: 'Quotations', icon: FileText }
  ];

  async function sendIntroMail() {
    const email = String(activeLead.emails || '').split(/[,\s;]+/).find(Boolean);
    // A mailto handoff cannot confirm delivery, so no success audit is recorded here.
    if (email) window.location.href = `mailto:${email}?subject=${encodeURIComponent(`Introduction from Anant Tattva`)}`;
  }

  async function openHistory() {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryFilter('all');
    const leadId = activeLead._id || activeLead.id || activeLead.sourceLeadId;
    const identifiers = Object.fromEntries(Object.entries({ leadCode: activeLead.leadCode, company: activeLead.company }).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== ''));
    const fallbackEvents = [
        { id: 'lead-created', type: 'lead_created', title: 'Lead created', description: `${activeLead.leadCode || 'Lead'} created for ${activeLead.company || 'the company'}`, actor: activeLead.importedCreatedBy || activeLead.assignedBy || 'Imported user', at: activeLead.createdAt || activeLead.importedCreatedAt || activeLead.leadDate },
        ...leadQuotations.map((item) => ({ id: `quote-${item._id || item.id}`, type: 'quotation_created', title: 'Quotation created', description: `${item.quotationNumber || 'Quotation'} added`, actor: item.createdBy?.name || item.createdBy?.email || 'CRM User', at: item.createdAt })),
        ...followUpRows.map((item, index) => ({ id: `follow-${index}`, type: 'follow_up', title: 'Lead follow-up', description: item.remarks || 'Follow-up updated', actor: item.updatedBy || 'CRM User', at: item.createdAt || item.updatedAt || item.scheduledDate }))
      ].filter((item) => item.at);
    try {
      const [crmResult, ccpResult] = await Promise.allSettled([
        api.get(API_ENDPOINTS.leads.history(leadId), { params: identifiers }),
        fetchCcpLeadHistory(leadId, identifiers)
      ]);
      const remoteEvents = [crmResult, ccpResult].flatMap((result) => result.status === 'fulfilled' ? (result.value.data?.events || []) : []);
      const unique = new Map();
      [...remoteEvents, ...fallbackEvents].forEach((event) => { if (event?.id && !unique.has(String(event.id))) unique.set(String(event.id), event); });
      const events = [...unique.values()].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
      const group = (type = '') => type.includes('quotation') || type.includes('approval') ? 'quotation' : type.includes('follow') ? 'followup' : type.includes('todo') ? 'todo' : type.includes('email') ? 'email' : 'lead';
      setHistoryData({ lead: { leadCode: activeLead.leadCode, company: activeLead.company }, events, summary: { total: events.length, quotations: events.filter((event) => group(event.type) === 'quotation').length, followUps: events.filter((event) => group(event.type) === 'followup').length, todos: events.filter((event) => group(event.type) === 'todo').length, emails: events.filter((event) => group(event.type) === 'email').length }, sourceStatus: { crm: crmResult.status, ccp: ccpResult.status } });
    } finally {
      setHistoryLoading(false);
    }
  }

  function openFollowUpModal() {
    setFollowUpDraft({
      scheduledDate: activeLead.nextFollowUpDate || todayDateKey(),
      scheduledTime: activeLead.nextFollowUpTime || '',
      remarks: '',
      reason: ''
    });
    setFollowUpError('');
    setFollowUpModalOpen(true);
  }

  async function saveFollowUp() {
    if (!followUpDraft.scheduledDate || !followUpDraft.remarks.trim()) {
      setFollowUpError('Scheduled date and follow-up remarks are required.');
      return;
    }
    const leadId = activeLead._id || activeLead.id;
    if (!leadId) {
      setFollowUpError('This lead cannot be updated because its CRM id is missing.');
      return;
    }
    const previousCurrent = activeLead.nextFollowUpDate || activeLead.nextFollowUpTime || activeLead.followUpRemarks
      ? [{
          id: `previous-${Date.now()}`,
          scheduledDate: activeLead.nextFollowUpDate || '',
          scheduledTime: activeLead.nextFollowUpTime || '',
          remarks: activeLead.followUpRemarks || '',
          reason: 'Previous current follow-up',
          createdAt: new Date().toISOString()
        }]
      : [];
    const newEntry = {
      id: `follow-up-${Date.now()}`,
      scheduledDate: followUpDraft.scheduledDate,
      scheduledTime: followUpDraft.scheduledTime,
      remarks: followUpDraft.remarks.trim(),
      reason: followUpDraft.reason.trim(),
      createdAt: new Date().toISOString()
    };
    const payload = {
      ...activeLead,
      assignedTo: activeLead.assignedTo?._id || activeLead.assignedTo?.id || activeLead.assignedTo || '',
      nextFollowUpDate: newEntry.scheduledDate,
      nextFollowUpTime: newEntry.scheduledTime,
      followUpRemarks: newEntry.remarks,
      followUpHistory: [newEntry, ...previousCurrent, ...(Array.isArray(activeLead.followUpHistory) ? activeLead.followUpHistory : [])]
    };
    setFollowUpSaving(true);
    setFollowUpError('');
    try {
      const response = await api.put(API_ENDPOINTS.ccp.updateLead(leadId), payload);
      const updatedLead = response.data?.lead || payload;
      setDetailLead(updatedLead);
      onLeadUpdated?.(updatedLead);
      setFollowUpModalOpen(false);
    } catch (err) {
      setFollowUpError(err?.response?.data?.error || 'Unable to save follow-up.');
    } finally {
      setFollowUpSaving(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#f3f8f6] px-4 py-5 sm:px-6 lg:px-8">
      <div className="-mx-4 -mt-5 border-b border-slate-200/80 bg-white/90 px-4 py-4 shadow-sm backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onBack} className="btn-lift grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-orange-600 shadow-sm" title="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#30737B]">Lead Details</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => onAddQuotation()} className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-500 px-5 text-sm font-black text-white shadow-lg shadow-slate-500/20"><Plus className="h-4 w-4" />Add New Quotations</button>
          <button type="button" className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-lg bg-violet-600 px-5 text-sm font-black text-white shadow-lg shadow-violet-600/20"><Edit3 className="h-4 w-4" />Change Status</button>
          <button type="button" onClick={openHistory} className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-600/20"><RefreshCw className="h-4 w-4" />View History</button>
          <button type="button" onClick={sendIntroMail} className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-600/20"><Mail className="h-4 w-4" />Send Introduction Mail</button>
          <button type="button" onClick={onEdit} className="btn-lift inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-500 px-5 text-sm font-black text-white shadow-lg shadow-orange-500/20"><Edit3 className="h-4 w-4" />Edit</button>
        </div>
        </div>
      </div>

      <div className="mt-6 w-full max-w-none">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/6">
          <div className="bg-[linear-gradient(135deg,#ffffff_0%,#f0fdfa_58%,#fff7ed_100%)] p-5 sm:p-6">
            <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-center">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border border-white bg-[#30737B] text-2xl font-black text-white shadow-lg shadow-teal-900/20">{initials}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-black uppercase text-white">{activeLead.status || 'Draft'}</span>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black uppercase text-violet-700">{activeLead.eprCategory || 'EPR Not Set'}</span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black uppercase text-blue-700">{activeLead.piboCategory || 'PIBO Not Set'}</span>
                  </div>
                  <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">{companyName}</h1>
                  <p className="mt-2 max-w-4xl text-sm font-bold text-slate-500">{location || 'Location not set'}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm shadow-teal-900/5 backdrop-blur xl:min-w-[640px]">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <LeadInlineMeta label="Lead ID" value={displayLeadId(activeLead)} icon={FileText} />
                  <LeadInlineMeta label="Contact" value={activeLead.contactPerson} icon={ContactRound} />
                  <LeadInlineMeta label="Mobile" value={activeLead.mobileNo1} icon={Phone} />
                  <LeadInlineMeta label="Quotations" value={leadQuotations.length} icon={FileText} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
          <div className="grid border-b border-slate-200 sm:grid-cols-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex min-h-14 items-center justify-center gap-2 border-b border-slate-100 px-3 text-sm font-black transition sm:border-b-0 sm:border-r last:border-r-0 ${active ? 'bg-emerald-50 text-[#30737B] shadow-inner' : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                  <Icon className="h-4 w-4" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {activeTab === 'overview' && (
            <div className="p-6">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#30737B]">Overview</p>
                  <h2 className="text-2xl font-black text-slate-950">Lead intelligence</h2>
                </div>
                <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black uppercase text-slate-600">Updated {activeLead.importedUpdatedAt || activeLead.updatedAt || 'Recently'}</span>
              </div>
              <div className="space-y-4">
                <LeadDetailGroup title="Basic Information" icon={Building2} rows={basicInfoRows} defaultOpen />
                <LeadDetailGroup title="Registered & Communication Address" icon={MapPin} rows={addressInfoRows} defaultOpen />
                <LeadDetailGroup title="Contact Matrix" icon={ContactRound} rows={contactInfoRows} defaultOpen />
              </div>
            </div>
          )}

          {activeTab === 'assigned' && (
            <div className="p-6">
              <LeadDetailRows rows={assignedRows} />
            </div>
          )}

          {activeTab === 'business' && (
            <div className="p-6">
              {hasBusinessCard ? (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <img src={activeLead.businessCardUrl} alt="Business card" className="max-h-[560px] w-full object-contain" />
                </div>
              ) : (
                <EmptyDetailState title="No business card uploaded." />
              )}
            </div>
          )}

          {activeTab === 'quotation' && (
            <div className="p-6">
              {leadQuotations.length ? (
                <div className="space-y-5">
                  {leadQuotations.map((quotation) => (
                    <QuotationPreviewCard key={quotation._id || quotation.id} quotation={quotation} onOpen={onAddQuotation} />
                  ))}
                </div>
              ) : (
                <EmptyDetailState title="No quotation preview mapped yet." actionLabel="Add New Quotation" onAction={() => onAddQuotation()} />
              )}
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-slate-500" />
              <h2 className="text-xl font-black text-slate-900">Follow-Up Tracker</h2>
            </div>
            <button type="button" onClick={openFollowUpModal} className="btn-lift min-h-10 rounded-lg bg-orange-500 px-5 text-sm font-black text-white">Add Follow-Up</button>
          </div>
          <div className="space-y-5 p-6">
            <FollowUpBox title="Upcoming Follow-Ups" tone="orange" items={upcomingFollowUps} emptyMessage="No upcoming follow-ups." />
            <FollowUpBox title="Previous Follow-Ups" tone="slate" items={previousFollowUps} emptyMessage="No past follow-ups." />
          </div>
        </aside>
        </div>
      </div>
      {historyOpen && <LeadHistoryDrawer data={historyData} loading={historyLoading} filter={historyFilter} onFilter={setHistoryFilter} onRefresh={openHistory} onClose={() => setHistoryOpen(false)} />}
      {followUpModalOpen && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm" onClick={() => !followUpSaving && setFollowUpModalOpen(false)}>
          <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">Follow-Up</p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">Add Lead Follow-Up</h3>
              </div>
              <button type="button" disabled={followUpSaving} onClick={() => setFollowUpModalOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <Field label="Scheduled Date" required><PremiumDatePicker value={followUpDraft.scheduledDate} onChange={(event) => setFollowUpDraft((current) => ({ ...current, scheduledDate: event.target.value }))} /></Field>
              <Field label="Scheduled Time"><input type="time" className="form-input" value={followUpDraft.scheduledTime} onChange={(event) => setFollowUpDraft((current) => ({ ...current, scheduledTime: event.target.value }))} /></Field>
              <Field label="Follow-Up Remarks" required className="sm:col-span-2"><textarea className="form-input min-h-28 resize-y" value={followUpDraft.remarks} onChange={(event) => setFollowUpDraft((current) => ({ ...current, remarks: event.target.value }))} placeholder="Enter follow-up note or outcome" /></Field>
              <Field label="Update Reason" className="sm:col-span-2"><textarea className="form-input min-h-20 resize-y" value={followUpDraft.reason} onChange={(event) => setFollowUpDraft((current) => ({ ...current, reason: event.target.value }))} placeholder="Why is this follow-up being added?" /></Field>
              {followUpError && <p className="sm:col-span-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-black text-red-600">{followUpError}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button type="button" disabled={followUpSaving} onClick={() => setFollowUpModalOpen(false)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-5 font-black text-slate-700">Cancel</button>
              <button type="button" disabled={followUpSaving || !followUpDraft.scheduledDate || !followUpDraft.remarks.trim()} onClick={saveFollowUp} className="min-h-10 rounded-lg bg-orange-500 px-5 font-black text-white disabled:cursor-not-allowed disabled:opacity-60">{followUpSaving ? 'Saving...' : 'Save Follow-Up'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function LeadHistoryDrawer({ data, loading, filter, onFilter, onRefresh, onClose }) {
  const events = data.events || [];
  const groupFor = (type = '') => type.includes('quotation') || type.includes('approval') ? 'quotation' : type.includes('follow') ? 'followup' : type.includes('todo') ? 'todo' : type.includes('email') ? 'email' : 'lead';
  const visible = filter === 'all' ? events : events.filter((event) => groupFor(event.type) === filter);
  const tones = { quotation: 'violet', followup: 'orange', todo: 'blue', email: 'emerald', lead: 'slate' };
  const filters = [['all', 'All Activity'], ['lead', 'Lead'], ['quotation', 'Quotation'], ['followup', 'Follow-Ups'], ['todo', 'Todos'], ['email', 'Email']];

  return (
    <div className="lead-history-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="lead-history-drawer">
        <header className="lead-history-head">
          <div><p>Complete activity trail</p><h2><Clock3 className="h-5 w-5" />Lead History</h2><span>{data.lead?.leadCode || ''} {data.lead?.company ? `• ${data.lead.company}` : ''}</span></div>
          <div><button type="button" onClick={onRefresh} title="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button><button type="button" onClick={onClose} title="Close"><X className="h-5 w-5" /></button></div>
        </header>
        <section className="lead-history-stats"><div><strong>{data.summary?.total || events.length}</strong><span>Activities</span></div><div><strong>{data.summary?.quotations || 0}</strong><span>Quotations</span></div><div><strong>{data.summary?.followUps || 0}</strong><span>Follow-Ups</span></div><div><strong>{data.summary?.todos || 0}</strong><span>Todos</span></div><div><strong>{data.summary?.emails || 0}</strong><span>Emails</span></div></section>
        <nav className="lead-history-filters">{filters.map(([id, label]) => <button type="button" key={id} className={filter === id ? 'active' : ''} onClick={() => onFilter(id)}>{label}<small>{id === 'all' ? events.length : events.filter((event) => groupFor(event.type) === id).length}</small></button>)}</nav>
        <div className="lead-history-body">
          {loading ? <div className="lead-history-loading"><RefreshCw className="h-6 w-6 animate-spin" /><strong>Building activity timeline...</strong></div> : data.error ? <div className="lead-history-empty"><strong>History unavailable</strong><p>{data.error}</p></div> : visible.length ? <div className="lead-history-timeline">{visible.map((event) => {
            const group = groupFor(event.type); const date = event.at ? new Date(event.at) : null;
            return <article key={event.id} className={`is-${tones[group]}`}><i>{group === 'quotation' ? <FileText /> : group === 'email' ? <Mail /> : group === 'followup' ? <Phone /> : group === 'todo' ? <CheckCircle2 /> : <Edit3 />}</i><div><header><span>{String(event.type || 'activity').replace(/_/g, ' ')}</span><time>{date && !Number.isNaN(date.getTime()) ? `${date.toLocaleDateString('en-GB')} • ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Date unavailable'}</time></header><h3>{event.title}</h3><p>{event.description}</p><footer><UserCheck className="h-3.5 w-3.5" />By {event.actor || 'CRM User'}</footer></div></article>;
          })}</div> : <div className="lead-history-empty"><Clock3 className="h-8 w-8" /><strong>No activity found</strong><p>No events match this filter yet.</p></div>}
        </div>
        <footer className="lead-history-footer"><span>Audit timeline • newest activity first</span><button type="button" onClick={onClose}>Close History</button></footer>
      </aside>
    </div>
  );
}

function LeadDetailRows({ rows }) {
  return (
    <dl className="grid gap-4 md:grid-cols-2">
      {rows.map(([label, value, kind]) => (
        <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <dt className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</dt>
          <dd className="mt-2 break-words text-sm font-black uppercase text-slate-950">
            {kind === 'pill' ? <span className="rounded-full bg-blue-600 px-3 py-1 text-xs text-white">{value || 'Draft'}</span> : value || '-'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function LeadDetailGroup({ title, icon: Icon, rows, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-h-12 w-full items-center justify-between border-b border-emerald-100 bg-emerald-50/60 px-4 py-3 text-left transition hover:bg-emerald-50">
        <span className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-[#30737B] shadow-sm">
            <Icon className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-black text-slate-900">{title}</span>
            <span className="mt-0.5 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{rows.length} fields</span>
          </span>
        </span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#30737B] text-white shadow-sm">
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      <div className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            {rows.map(([label, value, ValueIcon, kind]) => (
              <LeadDetailValue key={label} label={label} value={value} icon={ValueIcon} kind={kind} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LeadDetailValue({ label, value, icon: Icon, kind }) {
  return (
    <div className="grid min-h-12 grid-cols-[auto_130px_minmax(0,1fr)] items-center gap-3 border-b border-r border-emerald-50 px-4 py-3 last:border-b-0">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-[#30737B]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</span>
      <span className="break-words text-xs font-black uppercase text-slate-950">
        {kind === 'pill' ? <span className="rounded-full bg-blue-600 px-3 py-1 text-[11px] text-white">{value || 'Draft'}</span> : value || '-'}
      </span>
    </div>
  );
}

function LeadInlineMeta({ label, value, icon: Icon }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="mt-2 truncate text-sm font-black text-slate-900">{value || '-'}</p>
    </div>
  );
}

function EmptyDetailState({ title, actionLabel, onAction }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
      <div>
        <p className="font-black text-slate-500">{title}</p>
        {actionLabel && (
          <button type="button" onClick={onAction} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-black text-white">
            <Plus className="h-4 w-4" />{actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function QuotationPreviewCard({ quotation, onOpen }) {
  const items = Array.isArray(quotation.items) ? quotation.items : [];
  const created = quotation.createdAt ? new Date(quotation.createdAt).toLocaleDateString('en-GB') : '-';
  const quotationNumber = quotation.quotationNumber || 'Quotation';
  const quotationId = quotation._id || quotation.id;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-slate-950">{quotationNumber}</h3>
          <p className="mt-1 text-xs font-black text-slate-500">Created: {created}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onOpen(quotationId)} className="btn-lift min-h-9 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-600">Open</button>
          <button type="button" onClick={() => onOpen(quotationId)} className="btn-lift min-h-9 rounded-lg px-4 text-sm font-black text-orange-600 hover:bg-orange-50">View Details</button>
          <button type="button" onClick={() => onOpen(quotationId)} className="btn-lift min-h-9 rounded-lg border border-orange-300 bg-white px-4 text-sm font-black text-orange-600">Revise</button>
        </div>
      </div>

      <div className="mt-8">
        <h4 className="font-black text-slate-900">Quotation Items</h4>
        <div className="mt-3 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                {['#', 'Service Category', 'Services for the Year', 'EPR Category', 'PIBO Category', 'Unit', 'Basic Amount (Rs)'].map((header) => (
                  <th key={header} className="border-r border-slate-200 px-4 py-3 last:border-r-0">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center font-black text-slate-400">No quotation items added.</td></tr>
              ) : items.map((item, index) => (
                <tr key={index} className="font-black text-slate-950">
                  <td className="border-r border-slate-200 px-4 py-3 text-center">{index + 1}</td>
                  <td className="border-r border-slate-200 px-4 py-3 uppercase">{item.serviceCategory || '-'}</td>
                  <td className="border-r border-slate-200 px-4 py-3">{item.servicesForYear || '-'}</td>
                  <td className="border-r border-slate-200 px-4 py-3 uppercase">{item.eprCategory || '-'}</td>
                  <td className="border-r border-slate-200 px-4 py-3 uppercase">{item.piboCategory || '-'}</td>
                  <td className="border-r border-slate-200 px-4 py-3 uppercase">{item.unit || '-'}</td>
                  <td className="px-4 py-3 text-right text-orange-600">{formatInr(item.basicAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function formatInr(value) {
  const amount = Number(value) || 0;
  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function FollowUpBox({ title, tone, items = [], emptyMessage }) {
  const colors = tone === 'orange'
    ? 'border-orange-200 bg-orange-50 text-orange-900'
    : 'border-slate-200 bg-slate-50 text-slate-900';

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200">
      <div className={`border-b px-5 py-4 ${colors}`}>
        <h3 className="font-black">{title}</h3>
      </div>
      <div className="min-h-32 p-5">
        {items.length ? (
          <div className="space-y-3">
            {items.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm shadow-slate-900/5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm font-black text-slate-950">{formatFollowUpDate(item.scheduledDate)}{item.scheduledTime ? ` at ${item.scheduledTime}` : ''}</strong>
                  {item.reason && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase text-slate-500">{item.reason}</span>}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-600">{item.remarks || 'No remarks added.'}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid min-h-24 place-items-center text-center">
            <p className="font-black text-slate-500">{emptyMessage}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function DirectoryMetric({ label, value, note }) {
  return (
    <div className="min-h-32 rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
      <p className="text-sm font-black text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
      {note && <p className="mt-5 text-xs font-black uppercase text-slate-500">{note}</p>}
    </div>
  );
}

function DirectoryTableHeader({ showing, total, label, rowsPerPage, setRowsPerPage, page, setPage, totalPages }) {
  const start = total ? (page - 1) * rowsPerPage + 1 : 0;
  const end = total ? start + showing - 1 : 0;
  const [draftPage, setDraftPage] = useState(String(page));

  useEffect(() => {
    setDraftPage(String(page));
  }, [page]);

  function jumpToPage(event) {
    event.preventDefault();
    const nextPage = Math.min(totalPages, Math.max(1, Number.parseInt(draftPage, 10) || 1));
    setPage(nextPage);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="font-black text-slate-600">Showing {showing} of {total} {label} <span className="ml-2">(Page {page} of {totalPages})</span></p>
      <div className="flex flex-wrap items-center gap-3 font-black text-slate-600">
        <span>{start} - {end} of {total}</span>
        <form onSubmit={jumpToPage} className="inline-flex items-center gap-2">
          <span>Go to:</span>
          <input value={draftPage} onChange={(event) => setDraftPage(event.target.value)} className="h-11 w-20 rounded-lg border border-slate-200 bg-white px-3 text-center font-black outline-none focus:border-emerald-400" inputMode="numeric" />
        </form>
        <span>Rows per page:</span>
        <select value={rowsPerPage} onChange={(event) => setRowsPerPage(Number(event.target.value))} className="h-11 rounded-lg border border-slate-200 bg-white px-3 font-black outline-none">
          {[5, 10, 25, 50, 100].map((count) => <option key={count} value={count}>{count}</option>)}
        </select>
      </div>
    </div>
  );
}

function normalizeHeaderKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s._-]+/g, '')
    .trim();
}

function normalizeExistingClient(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'No';
  if (raw === 'yes' || raw === 'y' || raw === 'true' || raw === '1') return 'Yes';
  return 'No';
}

function normalizePersonName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function compareLeadCode(a, b) {
  const left = Number.parseInt(String(a.leadCode || '').replace(/\D/g, ''), 10) || 0;
  const right = Number.parseInt(String(b.leadCode || '').replace(/\D/g, ''), 10) || 0;
  if (left !== right) return left - right;
  return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
}

function formatExcelValue(value, field) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const iso = value.toISOString();
    return field === 'nextFollowUpTime' ? iso.slice(11, 16) : iso.slice(0, 10);
  }
  if (typeof value === 'number' && ['lastEmailSent', 'leadDate', 'nextFollowUpDate', 'importedCreatedAt', 'importedUpdatedAt'].includes(field)) {
    return XLSX.SSF.format('yyyy-mm-dd', value);
  }
  if (typeof value === 'number' && field === 'nextFollowUpTime') {
    return XLSX.SSF.format('hh:mm', value);
  }
  return typeof value === 'string' ? value.trim() : value;
}

function mapExcelRowToLead(row, staff) {
  const mapping = {
    communicationmode: 'communicationMode',
    leadid: 'sourceLeadId',
    status: 'status',
    company: 'company',
    industry: 'industryType',
    industrytype: 'industryType',
    eprcategory: 'eprCategory',
    applicanttype: 'piboParent',
    pibocategorytype: 'piboParent',
    pibosubcategory: 'piboCategory',
    pibocategoryparent: 'piboParent',
    piboparent: 'piboParent',
    pibocategory: 'piboCategory',
    servicesoffered: 'servicesOffered',
    address: 'addressLine1',
    addressline1: 'addressLine1',
    address1: 'addressLine1',
    addressline2: 'addressLine2',
    address2: 'addressLine2',
    addressline3: 'addressLine3',
    address3: 'addressLine3',
    landmark: 'landmark',
    state: 'state',
    city: 'city',
    pincode: 'pinCode',
    pin: 'pinCode',
    existingclient: 'existingClient',
    website: 'website',
    salutation: 'salutation',
    contactperson: 'contactPerson',
    designation: 'designation',
    emails: 'emails',
    email: 'emails',
    emailssentcount: 'emailsSentCount',
    lastemailsent: 'lastEmailSent',
    mobileno1: 'mobileNo1',
    mobile1: 'mobileNo1',
    phone1: 'mobileNo1',
    mobileno2: 'mobileNo2',
    mobile2: 'mobileNo2',
    phone2: 'mobileNo2',
    businesscardurl: 'businessCardUrl',
    referredby: 'referredBy',
    source: 'source',
    notes: 'notes',
    assignedto: 'assignedToText',
    assignto: 'assignedToText',
    assignedtotext: 'assignedToText',
    assignedby: 'assignedBy',
    createdby: 'importedCreatedBy',
    leaddate: 'leadDate',
    nextfollowupdate: 'nextFollowUpDate',
    nextfollowuptime: 'nextFollowUpTime',
    followupremarks: 'followUpRemarks',
    createdat: 'importedCreatedAt',
    updatedat: 'importedUpdatedAt'
  };

  const data = {};

  Object.entries(row || {}).forEach(([key, value]) => {
    const normalized = normalizeHeaderKey(key);
    const field = mapping[normalized];
    if (!field) return;
    const clean = formatExcelValue(value, field);
    if (field === 'pinCode') data.pinCode = String(clean || '').trim();
    else if (field === 'emailsSentCount') data.emailsSentCount = Number(clean) || 0;
    else if (field === 'existingClient') data.existingClient = normalizeExistingClient(clean);
    else data[field] = clean === null || clean === undefined ? '' : clean;
  });

  if (data.assignedToText && Array.isArray(staff) && staff.length) {
    const raw = normalizePersonName(data.assignedToText);
    const match = staff.find((user) => normalizePersonName(user.name) === raw);
    if (match) data.assignedTo = match._id || match.id;
  }

  if (data.piboCategory) {
    const normalizedPibo = normalizeLegacyPiboCategory(data.piboCategory);
    data.piboParent = data.piboParent || normalizedPibo.parent;
    data.piboCategory = normalizedPibo.child;
  }

  return data;
}
