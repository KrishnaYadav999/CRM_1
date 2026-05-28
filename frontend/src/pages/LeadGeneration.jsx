import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, CheckCircle2, ChevronDown, ContactRound, MapPin, Upload, UserCheck, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import DashboardShell from '../components/dashboard/DashboardShell';
import ProfileModal from '../components/dashboard/ProfileModal';
import api from '../services/api';

const emptyLead = {
  communicationMode: '',
  status: '',
  company: '',
  industryType: '',
  eprCategory: '',
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
  mobileNo1: '',
  mobileNo2: '',
  businessCardUrl: '',
  referredBy: '',
  source: '',
  notes: '',
  assignedTo: ''
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
  piboCategory: ["Producer", "Importer", "Brand Owner", "Recycler" , "SIMP (legacy)","SIMP – Producer (Small & Micro)","SIMP – Importer of Raw Material", "SIMP – Manufacturer of Raw Material","SIMP – Seller","PWP","Refurbisher","IMPO"],
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

export default function LeadGeneration() {
  const [currentUser, setCurrentUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [staff, setStaff] = useState([]);
  const [lead, setLead] = useState(emptyLead);
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelRows, setExcelRows] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  const isFirstStepReady = Boolean(lead.status && lead.company && lead.piboCategory && lead.servicesOffered);
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

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
    try {
      const meResponse = await api.get('/auth/me');
      setCurrentUser(meResponse.data.user);
      try {
        const usersResponse = await api.get('/auth/admin/users');
        setStaff(usersResponse.data.users || []);
      } catch {
        setStaff([meResponse.data.user]);
      }
    } catch {
      localStorage.removeItem('token');
      navigate('/', { replace: true });
    }
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
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const match = staff.find((user) => String(user.email || '').toLowerCase() === raw) ||
      staff.find((user) => String(user.name || '').toLowerCase() === raw);
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
    let successCount = 0;
    const failures = [];

    for (let i = 0; i < excelRows.length; i += 1) {
      const row = excelRows[i];
      const payload = {
        ...row,
        existingClient: normalizeExistingClient(row.existingClient),
        assignedTo: resolveUserId(row.assignedTo) || ''
      };

      try {
        await api.post('/leads', { ...payload, workflowStatus: 'draft' });
        successCount += 1;
      } catch (err) {
        failures.push({
          row: i + 2,
          error: err?.response?.data?.error || 'Unable to save lead'
        });
      }
    }

    setImporting(false);

    if (successCount) {
      setNotice(`${successCount} lead${successCount === 1 ? '' : 's'} imported as drafts.`);
      showToast(`${successCount} lead${successCount === 1 ? '' : 's'} imported.`, 'success');
    }
    if (failures.length) {
      const message = `${failures.length} row${failures.length === 1 ? '' : 's'} failed. First: row ${failures[0].row} (${failures[0].error})`;
      setError(message);
      showToast(message, 'error');
    }
  }

  async function saveLead(workflowStatus) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.post('/leads', { ...lead, workflowStatus });
      setNotice(workflowStatus === 'submitted' ? 'Lead submitted successfully.' : 'Lead draft saved successfully.');
      showToast(workflowStatus === 'submitted' ? 'Lead submitted successfully.' : 'Lead draft saved successfully.', 'success');
      if (workflowStatus === 'submitted') setLead(emptyLead);
      setActiveTab('basic');
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

  return (
    <DashboardShell currentUser={currentUser} onOpenProfile={() => setProfileOpen(true)} onLogout={handleLogout}>
      {toast && (
        <div className="fixed right-5 top-24 z-[70] w-[min(360px,calc(100vw-40px))] animate-toast-in rounded-2xl border border-white/70 bg-white p-4 shadow-2xl shadow-slate-900/20">
          <div className="flex items-start gap-3">
            <span className={`mt-1 h-3 w-3 rounded-full ${toast.type === 'error' ? 'bg-red-500' : toast.type === 'warning' ? 'bg-orange-500' : 'bg-emerald-500'}`} />
            <p className="min-w-0 flex-1 text-sm font-black text-slate-800">{toast.message}</p>
            <button type="button" onClick={() => setToast(null)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 shadow-sm ring-1 ring-emerald-100 sm:p-5 lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => navigate('/dashboard')} className="btn-lift inline-flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-100 bg-white text-emerald-700 shadow-sm">
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

          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-950">Excel upload (Lead Import)</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                Upload .xlsx with headers like Company, Status, PIBO Category, Services Offered, Address Line 1, State, City, PIN Code.
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

          {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
          {notice && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p>}

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {activeTab === 'basic' && (
              <div className="grid gap-7">
                <LeadSection title="Client Communication Mode">
                  <SelectLike label="Client Communication Mode" value={lead.communicationMode} options={options.communicationMode} onChange={(value) => updateField('communicationMode', value)} />
                  <SelectLike required label="Status" value={lead.status} options={options.status} onChange={(value) => updateField('status', value)} />
                </LeadSection>
                <LeadSection title="Company Information">
                  <Field required label="Company"><input className="form-input" value={lead.company} onChange={(event) => updateField('company', event.target.value)} /></Field>
                  <SelectLike label="Industry Type" value={lead.industryType} options={options.industryType} onChange={(value) => updateField('industryType', value)} />
                  <SelectLike label="EPR Category" value={lead.eprCategory} options={options.eprCategory} onChange={(value) => updateField('eprCategory', value)} />
                  <SelectLike required label="PIBO Category" value={lead.piboCategory} options={options.piboCategory} onChange={(value) => updateField('piboCategory', value)} />
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
                <Field label="Existing Client?"><select className="form-input" value={lead.existingClient} onChange={(event) => updateField('existingClient', event.target.value)}><option>No</option><option>Yes</option></select></Field>
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
                    <label className="btn-lift inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 font-black text-slate-800 hover:bg-slate-50">
                      <Upload className="h-4 w-4" /> Upload
                      <input type="file" accept="image/*,.pdf" onChange={handleBusinessCard} className="sr-only" />
                    </label>
                  </Field>
                </LeadSection>
                <LeadSection title="Additional Information" columns="lg:grid-cols-2">
                  <SelectLike label="Referred By" value={lead.referredBy} options={staffOptions.map((item) => item.label)} onChange={(value) => updateField('referredBy', value)} />
                  <SelectLike label="Source" value={lead.source} options={options.source} onChange={(value) => updateField('source', value)} />
                  <Field label="Notes" className="lg:col-span-2"><textarea className="form-input min-h-[120px] resize-y py-3" value={lead.notes} onChange={(event) => updateField('notes', event.target.value)} /></Field>
                </LeadSection>
              </div>
            )}

            {activeTab === 'assign' && (
              <LeadSection title="Assign Lead" columns="grid-cols-1">
                <SelectLike label="Assign To Staff" value={lead.assignedTo} options={staffOptions} onChange={(value) => updateField('assignedTo', value)} />
              </LeadSection>
            )}

            <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => navigate('/dashboard')} className="btn-lift min-h-11 rounded-xl border border-slate-200 px-8 font-black text-slate-700">Cancel</button>
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

function Field({ label, required, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-black text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function SelectLike({ label, required, value, options = [], onChange, disabled = false, placeholder = 'Select or type to create new' }) {
  const normalized = Array.isArray(options)
    ? options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option))
    : [];
  const listId = `${label.replace(/\s+/g, '-')}-options`;
  return (
    <Field label={label} required={required}>
      <div className="relative">
        <input
          value={value}
          list={listId}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="form-input pr-12 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        />
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <datalist id={listId}>
          {normalized.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </datalist>
      </div>
    </Field>
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

function mapExcelRowToLead(row, staff) {
  const mapping = {
    communicationmode: 'communicationMode',
    status: 'status',
    company: 'company',
    industrytype: 'industryType',
    eprcategory: 'eprCategory',
    pibocategory: 'piboCategory',
    servicesoffered: 'servicesOffered',
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
    assignedto: 'assignedTo',
    assignto: 'assignedTo'
  };

  const data = {};

  Object.entries(row || {}).forEach(([key, value]) => {
    const normalized = normalizeHeaderKey(key);
    const field = mapping[normalized];
    if (!field) return;
    const clean = typeof value === 'string' ? value.trim() : value;
    if (field === 'pinCode') data.pinCode = String(clean || '').trim();
    else if (field === 'existingClient') data.existingClient = normalizeExistingClient(clean);
    else data[field] = clean === null || clean === undefined ? '' : clean;
  });

  if (data.assignedTo && Array.isArray(staff) && staff.length) {
    const raw = String(data.assignedTo).trim().toLowerCase();
    const match = staff.find((user) => String(user.email || '').toLowerCase() === raw) ||
      staff.find((user) => String(user.name || '').toLowerCase() === raw);
    data.assignedTo = match ? (match._id || match.id) : String(data.assignedTo).trim();
  }

  return data;
}
