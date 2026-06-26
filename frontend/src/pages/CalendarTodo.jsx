import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Edit3, Eye, History, ListChecks, Plus, Search, UserPlus, X } from 'lucide-react';
import DashboardShell from '../components/dashboard/DashboardShell';
import api from '../services/api';
import { fetchCcpClients, fetchCcpLeads } from '../services/ccpApi';
import { getClientUniqueId, mergeClientSources, mergeLeadSources, readCachedOrFreshList, readClientData } from '../features/clientMaster/clientMaster.utils';

const STORAGE_KEY = 'crm.calendar.todos.v1';
const ccpCacheKeys = {
  clients: 'crm.ccp.clients.cache.v1',
  leads: 'crm.ccp.leads.cache.v1'
};
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const priorities = ['Low', 'Medium', 'High', 'Urgent'];
const categories = ['General', 'Sales', 'Support', 'Development', 'Manager', 'Follow-Up'];
const DAY_PANEL_PAGE_SIZE = 3;
const springSoft = { type: 'spring', stiffness: 420, damping: 32, mass: 0.85 };
const fadeUp = {
  hidden: { opacity: 0, y: 18, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSoft }
};
const staggerGroup = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.06 } }
};
const calendarCellMotion = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } }
};
const modalBackdropMotion = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.18 } }
};
const modalPanelMotion = {
  hidden: { opacity: 0, y: 22, scale: 0.965 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSoft }
};
const drawerPanelMotion = {
  hidden: { opacity: 0, x: 42 },
  show: { opacity: 1, x: 0, transition: springSoft }
};

function readCalendarItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCalendarItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('crm-calendar-items-updated'));
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatHumanDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function makeMonthCells(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function emptyTodo(date = new Date()) {
  return {
    title: '',
    description: '',
    clientNumber: '',
    clientName: '',
    leadNumber: '',
    priority: 'Medium',
    category: 'General',
    scheduledDate: dateKey(date),
    scheduledTime: '',
    assignedTo: '',
    status: 'open',
    history: [],
    type: 'todo'
  };
}

function getClientData(client = {}) {
  return readClientData(client);
}

function getClientOption(client = {}) {
  const data = getClientData(client);
  const uniqueId = getClientUniqueId(client) || data.importMeta?.uniqueId || data.importMeta?.ccpClientId || client.clientCode || client.code || client._id || client.id || 'CLIENT';
  const company = data.basic?.clientLegalName || data.basic?.tradeName || client.clientName || client.companyName || 'Untitled Client';
  const category = data.basic?.piboCategory || data.basic?.eprCategory || '';
  return {
    value: String(uniqueId),
    label: [uniqueId, company, category].filter(Boolean).join(' - '),
    company,
    id: String(client._id || client.id || uniqueId)
  };
}

function getLeadOption(lead = {}) {
  const code = lead.leadCode || lead.leadNumber || lead['Lead Number'] || lead.code || lead._id || lead.id || 'LEAD';
  const company = lead.company || lead.companyName || lead.clientName || lead['Company Name'] || lead.Company || 'Untitled Lead';
  const category = lead.piboCategory || lead['PIBO Category'] || lead.eprCategory || lead['EPR Category'] || lead.status || '';
  return {
    value: String(code),
    label: [code, company, category].filter(Boolean).join(' - '),
    company,
    id: String(lead._id || lead.id || code)
  };
}

function getItemTone(item, todayKey) {
  if (item.status === 'completed') return 'done';
  if (item.scheduledDate && item.scheduledDate < todayKey) return 'overdue';
  if ((item.history || []).length) return 'revised';
  return 'open';
}

function getItemStatusLabel(item, todayKey) {
  const tone = getItemTone(item, todayKey);
  if (tone === 'done') return 'Completed';
  if (tone === 'overdue') return 'Overdue';
  if (tone === 'revised') return 'Revised';
  return 'Open';
}

function extractList(response, key) {
  const data = response?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

export default function CalendarTodo() {
  const storedUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }, []);
  const today = new Date();
  const [items, setItems] = useState(() => readCalendarItems());
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewDate, setViewDate] = useState(today);
  const [modalDate, setModalDate] = useState(null);
  const [todoDraft, setTodoDraft] = useState(() => emptyTodo(today));
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [clients, setClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [drawerDate, setDrawerDate] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [bucketPopup, setBucketPopup] = useState(null);
  const [calendarView, setCalendarView] = useState('month');
  const [dayPanelTab, setDayPanelTab] = useState('agenda');
  const [assignmentTarget, setAssignmentTarget] = useState(null);
  const [assignmentDraft, setAssignmentDraft] = useState({ assignedTo: '', reason: '' });
  const [historyTarget, setHistoryTarget] = useState(null);
  const [completionTarget, setCompletionTarget] = useState(null);
  const [completionRemarks, setCompletionRemarks] = useState('');
  const [reviseDraft, setReviseDraft] = useState('');
  const [followUpPage, setFollowUpPage] = useState(1);
  const [todoPage, setTodoPage] = useState(1);
  const [timelinePage, setTimelinePage] = useState(1);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = useMemo(() => makeMonthCells(year, month), [month, year]);
  const selectedKey = dateKey(selectedDate);
  const todayKey = dateKey(today);
  const selectedWeekStart = useMemo(() => {
    const date = new Date(selectedDate);
    date.setDate(selectedDate.getDate() - selectedDate.getDay());
    return date;
  }, [selectedDate]);
  const selectedWeekEnd = useMemo(() => {
    const date = new Date(selectedWeekStart);
    date.setDate(selectedWeekStart.getDate() + 6);
    return date;
  }, [selectedWeekStart]);
  const visibleCalendarCells = useMemo(() => {
    if (calendarView === 'day') return [new Date(selectedDate)];
    if (calendarView === 'week') {
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(selectedWeekStart);
        date.setDate(selectedWeekStart.getDate() + index);
        return date;
      });
    }
    return cells;
  }, [calendarView, cells, selectedDate, selectedWeekStart]);
  const visibleWeekdays = calendarView === 'day'
    ? [new Intl.DateTimeFormat('en', { weekday: 'short' }).format(selectedDate)]
    : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const calendarTitle = calendarView === 'day'
    ? new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(selectedDate)
    : calendarView === 'week'
      ? `${formatHumanDate(selectedWeekStart)} - ${formatHumanDate(selectedWeekEnd)}`
      : `${months[month]} ${year}`;
  const clientOptions = useMemo(() => clients.map(getClientOption), [clients]);
  const leadOptions = useMemo(() => leads.map(getLeadOption), [leads]);
  const userOptions = useMemo(() => users.map((user) => ({
    value: user.name || user.email || user._id || user.id,
    label: `${user.name || user.email || 'User'}${user.email ? ` (${user.email})` : ''}`
  })), [users]);
  const userLookup = useMemo(() => new Map(users.flatMap((user) => {
    const keys = [user.name, user.email, user._id, user.id, user.crmUserId, user.userId, user.ccpUserId]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());
    return keys.map((key) => [key, user]);
  })), [users]);

  useEffect(() => {
    let mounted = true;
    async function loadOptions() {
      const [clientsResult, ccpClientsResult, leadsResult, ccpLeadsResult, usersResult, adminUsersResult] = await Promise.allSettled([
        api.get('/clients'),
        fetchCcpClients(),
        api.get('/leads'),
        fetchCcpLeads(),
        api.get('/auth/users'),
        api.get('/auth/admin/users')
      ]);
      if (!mounted) return;
      const crmClients = clientsResult.status === 'fulfilled' ? extractList(clientsResult.value, 'clients') : [];
      const ccpClients = readCachedOrFreshList(ccpClientsResult, 'clients', ccpCacheKeys.clients);
      const crmLeads = leadsResult.status === 'fulfilled' ? extractList(leadsResult.value, 'leads') : [];
      const ccpLeads = readCachedOrFreshList(ccpLeadsResult, 'leads', ccpCacheKeys.leads);
      const apiUsers = usersResult.status === 'fulfilled' ? extractList(usersResult.value, 'users') : [];
      const adminUsers = adminUsersResult.status === 'fulfilled' ? extractList(adminUsersResult.value, 'users') : [];
      const mergedUsers = [...new Map([
        ...adminUsers,
        ...apiUsers,
        ...(storedUser ? [storedUser] : [])
      ].map((user) => [String(user?._id || user?.id || user?.email || user?.name || Math.random()), user])).values()].filter(Boolean);
      setClients(mergeClientSources(crmClients, ccpClients));
      setLeads(mergeLeadSources(crmLeads, ccpLeads));
      setUsers(mergedUsers);
    }
    loadOptions();
    return () => { mounted = false; };
  }, [storedUser]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      const haystack = [item.title, item.description, item.clientName, item.leadNumber, item.category, item.assignedTo].filter(Boolean).join(' ').toLowerCase();
      return (!term || haystack.includes(term))
        && (!priorityFilter || item.priority === priorityFilter)
        && (!statusFilter || item.status === statusFilter)
        && (!categoryFilter || item.category === categoryFilter);
    }).sort((a, b) => `${a.scheduledDate || ''} ${a.scheduledTime || ''}`.localeCompare(`${b.scheduledDate || ''} ${b.scheduledTime || ''}`));
  }, [categoryFilter, items, priorityFilter, query, statusFilter]);
  const viewFilteredItems = useMemo(() => {
    return filteredItems.filter((item) => {
      if (!item.scheduledDate) return false;
      const itemDate = new Date(item.scheduledDate);
      if (Number.isNaN(itemDate.getTime())) return false;
      if (calendarView === 'day') return item.scheduledDate === selectedKey;
      if (calendarView === 'week') return itemDate >= selectedWeekStart && itemDate <= selectedWeekEnd;
      return itemDate.getFullYear() === year && itemDate.getMonth() === month;
    });
  }, [calendarView, filteredItems, month, selectedKey, selectedWeekEnd, selectedWeekStart, year]);

  const itemCountByDate = useMemo(() => {
    return items.reduce((map, item) => {
      if (!item.scheduledDate) return map;
      map.set(item.scheduledDate, (map.get(item.scheduledDate) || 0) + 1);
      return map;
    }, new Map());
  }, [items]);

  const itemGroupsByDate = useMemo(() => {
    return items.reduce((map, item) => {
      if (!item.scheduledDate) return map;
      const dayItems = map.get(item.scheduledDate) || [];
      dayItems.push(item);
      map.set(item.scheduledDate, dayItems);
      return map;
    }, new Map());
  }, [items]);

  const todayItems = items.filter((item) => item.scheduledDate === todayKey);
  const selectedDateItems = items
    .filter((item) => item.scheduledDate === selectedKey)
    .sort((a, b) => String(a.scheduledTime || '').localeCompare(String(b.scheduledTime || '')));
  const drawerKey = drawerDate ? dateKey(drawerDate) : '';
  const drawerItems = items
    .filter((item) => item.scheduledDate === drawerKey)
    .sort((a, b) => String(a.scheduledTime || '').localeCompare(String(b.scheduledTime || '')));
  const currentDetailItem = detailItem ? items.find((item) => item.id === detailItem.id) || detailItem : null;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekItems = items.filter((item) => {
    const date = new Date(item.scheduledDate);
    return !Number.isNaN(date.getTime()) && date >= weekStart && date <= weekEnd;
  });
  const completedCount = items.filter((item) => item.status === 'completed').length;
  const revisedCount = items.filter((item) => (item.history || []).length && item.status !== 'completed').length;
  const overdueCount = items.filter((item) => getItemTone(item, todayKey) === 'overdue').length;
  const upcomingCount = items.filter((item) => getItemTone(item, todayKey) === 'open' && item.scheduledDate >= todayKey).length;
  const selectedFollowUps = selectedDateItems.filter((item) => item.type === 'follow-up' || item.category === 'Follow-Up');
  const selectedTodos = selectedDateItems.filter((item) => !(item.type === 'follow-up' || item.category === 'Follow-Up'));
  const selectedTimeline = selectedDateItems
    .flatMap((item) => ([
      {
        id: `${item.id}-created`,
        time: item.scheduledTime || 'All day',
        tone: getItemTone(item, todayKey),
        text: `${item.type === 'follow-up' || item.category === 'Follow-Up' ? 'Follow-up' : 'Todo'} "${item.title}" scheduled`
      },
      ...(item.history || []).map((entry, index) => ({
        id: `${item.id}-history-${index}`,
        time: formatHumanDate(entry.changedAt),
        tone: 'revised',
        text: `Date revised from ${formatHumanDate(entry.fromDate)} to ${formatHumanDate(entry.toDate)}`
      }))
    ]))
    .slice(0, 24);
  const followUpTotalPages = Math.max(1, Math.ceil(selectedFollowUps.length / DAY_PANEL_PAGE_SIZE));
  const todoTotalPages = Math.max(1, Math.ceil(selectedTodos.length / DAY_PANEL_PAGE_SIZE));
  const timelineTotalPages = Math.max(1, Math.ceil(selectedTimeline.length / DAY_PANEL_PAGE_SIZE));
  const visibleFollowUps = selectedFollowUps.slice((followUpPage - 1) * DAY_PANEL_PAGE_SIZE, followUpPage * DAY_PANEL_PAGE_SIZE);
  const visibleTodos = selectedTodos.slice((todoPage - 1) * DAY_PANEL_PAGE_SIZE, todoPage * DAY_PANEL_PAGE_SIZE);
  const visibleTimeline = selectedTimeline.slice((timelinePage - 1) * DAY_PANEL_PAGE_SIZE, timelinePage * DAY_PANEL_PAGE_SIZE);
  const bucketPopupItems = useMemo(() => {
    if (!bucketPopup?.dateKey) return [];
    const dayItems = items
      .filter((item) => item.scheduledDate === bucketPopup.dateKey)
      .sort((a, b) => String(a.scheduledTime || '').localeCompare(String(b.scheduledTime || '')));
    if (bucketPopup.type === 'follow-ups') return dayItems.filter((item) => item.type === 'follow-up' || item.category === 'Follow-Up');
    if (bucketPopup.type === 'todos') return dayItems.filter((item) => !(item.type === 'follow-up' || item.category === 'Follow-Up'));
    if (bucketPopup.type === 'overdue') return dayItems.filter((item) => getItemTone(item, todayKey) === 'overdue');
    return dayItems;
  }, [bucketPopup, items, todayKey]);
  const bucketPopupTitle = bucketPopup?.type === 'follow-ups'
    ? 'Follow-ups'
    : bucketPopup?.type === 'todos'
      ? 'Todos'
      : bucketPopup?.type === 'overdue'
        ? 'Overdue Work'
        : 'Day Work';
  const selectedChartRows = [
    { label: 'Follow-ups', value: selectedFollowUps.length, fill: '#0f766e' },
    { label: 'Todos', value: selectedTodos.length, fill: '#2563eb' },
    { label: 'Overdue', value: selectedDateItems.filter((item) => getItemTone(item, todayKey) === 'overdue').length, fill: '#ef4444' },
    { label: 'Done', value: selectedDateItems.filter((item) => item.status === 'completed').length, fill: '#22c55e' }
  ];

  useEffect(() => {
    setFollowUpPage(1);
    setTodoPage(1);
    setTimelinePage(1);
  }, [dayPanelTab, selectedKey]);

  useEffect(() => {
    setFollowUpPage((page) => Math.min(page, followUpTotalPages));
    setTodoPage((page) => Math.min(page, todoTotalPages));
    setTimelinePage((page) => Math.min(page, timelineTotalPages));
  }, [followUpTotalPages, todoTotalPages, timelineTotalPages]);

  function persist(nextItems) {
    setItems(nextItems);
    writeCalendarItems(nextItems);
  }

  function openAddTodo(date = selectedDate) {
    setModalDate(date);
    setTodoDraft(emptyTodo(date));
  }

  function saveTodo() {
    if (!todoDraft.title.trim()) return;
    const selectedClient = clientOptions.find((option) => option.value === todoDraft.clientNumber);
    const selectedLead = leadOptions.find((option) => option.value === todoDraft.leadNumber);
    const assignedUser = userLookup.get(String(todoDraft.assignedTo || '').trim().toLowerCase());
    persist([
      {
        ...todoDraft,
        id: `todo-${Date.now()}`,
        title: todoDraft.title.trim(),
        clientName: selectedClient?.company || todoDraft.clientName,
        leadCompanyName: selectedLead?.company || '',
        assignedToName: assignedUser?.name || todoDraft.assignedTo,
        assignedToEmail: assignedUser?.email || '',
        assignedToId: assignedUser?._id || assignedUser?.id || assignedUser?.crmUserId || assignedUser?.userId || assignedUser?.ccpUserId || '',
        createdAt: new Date().toISOString(),
        createdBy: storedUser?.name || storedUser?.email || ''
      },
      ...items
    ]);
    setModalDate(null);
  }

  function toggleDone(id) {
    persist(items.map((item) => item.id === id ? { ...item, status: item.status === 'completed' ? 'open' : 'completed', completedAt: item.status === 'completed' ? '' : new Date().toISOString() } : item));
  }

  function requestCompletion(item) {
    if (item.status === 'completed') {
      return;
    }
    setCompletionTarget(item);
    setCompletionRemarks('');
  }

  function saveCompletion() {
    if (!completionTarget || !completionRemarks.trim()) return;
    persist(items.map((item) => item.id === completionTarget.id ? {
      ...item,
      status: 'completed',
      completedAt: new Date().toISOString(),
      completionRemarks: completionRemarks.trim(),
      completionHistory: [
        {
          remarks: completionRemarks.trim(),
          completedBy: storedUser?.name || storedUser?.email || 'Current User',
          completedAt: new Date().toISOString()
        },
        ...(item.completionHistory || [])
      ]
    } : item));
    setCompletionTarget(null);
    setCompletionRemarks('');
  }

  function reviseItem(id, nextDate) {
    if (!nextDate) return;
    persist(items.map((item) => {
      if (item.status === 'completed') return item;
      if (item.id !== id || item.scheduledDate === nextDate) return item;
      return {
        ...item,
        scheduledDate: nextDate,
        status: item.status === 'completed' ? 'completed' : 'open',
        history: [
          ...(item.history || []),
          {
            fromDate: item.scheduledDate,
            toDate: nextDate,
            changedAt: new Date().toISOString(),
            changedBy: storedUser?.name || storedUser?.email || ''
          }
        ]
      };
    }));
    setReviseDraft('');
  }

  function openAssignModal(item) {
    if (item.status === 'completed') return;
    setAssignmentTarget(item);
    setAssignmentDraft({ assignedTo: item.assignedTo || '', reason: '' });
  }

  function saveAssignment() {
    if (!assignmentTarget || assignmentTarget.status === 'completed' || !assignmentDraft.assignedTo) return;
    const assignedBy = storedUser?.name || storedUser?.email || 'Current User';
    const assignedUser = userLookup.get(String(assignmentDraft.assignedTo || '').trim().toLowerCase());
    persist(items.map((item) => {
      if (item.id !== assignmentTarget.id) return item;
      return {
        ...item,
        assignedTo: assignmentDraft.assignedTo,
        assignedToName: assignedUser?.name || assignmentDraft.assignedTo,
        assignedToEmail: assignedUser?.email || '',
        assignedToId: assignedUser?._id || assignedUser?.id || assignedUser?.crmUserId || assignedUser?.userId || assignedUser?.ccpUserId || '',
        assignmentHistory: [
          {
            assignedTo: assignmentDraft.assignedTo,
            assignedBy,
            previousAssignee: item.assignedTo || 'Unknown User',
            reason: assignmentDraft.reason || 'No reason provided',
            changedAt: new Date().toISOString()
          },
          ...(item.assignmentHistory || [])
        ]
      };
    }));
    setAssignmentTarget(null);
    setAssignmentDraft({ assignedTo: '', reason: '' });
  }

  function moveMonth(offset) {
    setViewDate(new Date(year, month + offset, 1));
  }

  function openBucketPopup(event, cell, type) {
    event.stopPropagation();
    setSelectedDate(cell);
    setBucketPopup({ dateKey: dateKey(cell), date: cell.toISOString(), type });
  }

  return (
    <DashboardShell currentUser={storedUser}>
      <main className="calendar-page calendar-page-premium">
        <motion.div className="calendar-pro-header calendar-command-hero" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.36 }}>
          <div>
            <p className="calendar-eyebrow"><CalendarDays className="h-5 w-5" /> Calendar & Todo Management</p>
            <span>Track daily work, client follow-ups, todo history, and revised dates.</span>
          </div>
          <div className="calendar-hero-actions calendar-pro-actions">
            <button type="button" onClick={() => window.history.back()}><ArrowLeft className="h-4 w-4" /> Back</button>
            <button type="button" onClick={() => openAddTodo(selectedDate)}><Plus className="h-4 w-4" /> Add Todo</button>
          </div>
        </motion.div>

        <section className="calendar-kpi-strip calendar-kpi-hidden">
          <MetricCard icon={CalendarDays} label="Due Today" value={todayItems.filter((item) => item.status !== 'completed').length} note={`${todayItems.length} tasks pending`} tone="blue" />
          <MetricCard icon={CheckCircle2} label="Completed" value={completedCount} note="finished work" tone="green" />
          <MetricCard icon={Clock3} label="Revised" value={revisedCount} note="date updated" tone="amber" />
          <MetricCard icon={Clock3} label="Overdue" value={overdueCount} note="needs attention" tone="red" />
          <MetricCard icon={CalendarDays} label="Upcoming" value={upcomingCount} note={`${weekItems.length} this week`} tone="violet" />
        </section>

        <motion.section className="calendar-command-strip" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.34, delay: 0.08 }}>
          <article className="calendar-command-summary">
            <span>Selected Workload</span>
            <strong>{selectedDateItems.length}</strong>
            <small>{new Intl.DateTimeFormat('en', { weekday: 'long', month: 'short', day: '2-digit' }).format(selectedDate)}</small>
          </article>
          <article className="calendar-command-summary calendar-command-summary-follow">
            <span>Follow-ups</span>
            <strong>{selectedFollowUps.length}</strong>
            <small>client touchpoints</small>
          </article>
          <article className="calendar-command-summary calendar-command-summary-overdue">
            <span>Overdue</span>
            <strong>{selectedChartRows[2].value}</strong>
            <small>needs attention</small>
          </article>
          <article className="calendar-workload-chart">
            <div>
              <span>Day Mix</span>
              <strong>{calendarTitle}</strong>
            </div>
            <ResponsiveContainer width="100%" height={82}>
              <BarChart data={selectedChartRows} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(15, 118, 110, 0.06)' }} />
                <Bar dataKey="value" radius={[8, 8, 2, 2]} barSize={28}>
                  {selectedChartRows.map((row) => <Cell key={row.label} fill={row.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </article>
        </motion.section>

        <motion.section className="calendar-workspace-grid calendar-workspace-premium" variants={staggerGroup} initial="hidden" animate="show">
          <motion.div className="calendar-card calendar-month-card" variants={fadeUp} layout>
            <div className="calendar-toolbar">
              <strong>{calendarTitle}</strong>
              <div>
                <motion.button type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} onClick={() => moveMonth(-1)}><ChevronLeft className="h-4 w-4" /></motion.button>
                <motion.button type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} onClick={() => { setViewDate(today); setSelectedDate(today); }}>Today</motion.button>
                <motion.button type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} onClick={() => moveMonth(1)}><ChevronRight className="h-4 w-4" /></motion.button>
                <span className="calendar-view-toggle">
                  {['month', 'week', 'day'].map((view) => (
                    <motion.button type="button" key={view} whileTap={{ scale: 0.96 }} className={calendarView === view ? 'active' : ''} onClick={() => setCalendarView(view)}>
                      {view.charAt(0).toUpperCase() + view.slice(1)}
                    </motion.button>
                  ))}
                </span>
                <select value={year} onChange={(event) => setViewDate(new Date(Number(event.target.value), month, 1))}>
                  {Array.from({ length: 8 }, (_, index) => today.getFullYear() - 2 + index).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={month} onChange={(event) => setViewDate(new Date(year, Number(event.target.value), 1))}>
                  {months.map((label, index) => <option key={label} value={index}>{label}</option>)}
                </select>
              </div>
            </div>
            <div className={`calendar-weekdays calendar-weekdays-${calendarView}`}>{visibleWeekdays.map((day) => <span key={day}>{day}</span>)}</div>
            <motion.div key={`${calendarView}-${calendarTitle}`} className={`calendar-grid calendar-grid-${calendarView}`} variants={staggerGroup} initial="hidden" animate="show">
              {visibleCalendarCells.map((cell) => {
                const key = dateKey(cell);
                const active = key === selectedKey;
                const isToday = key === todayKey;
                const muted = cell.getMonth() !== month;
                const count = itemCountByDate.get(key) || 0;
                const dayItems = itemGroupsByDate.get(key) || [];
                const followUpCount = dayItems.filter((item) => item.type === 'follow-up' || item.category === 'Follow-Up').length;
                const todoCount = dayItems.length - followUpCount;
                const overdueDayCount = dayItems.filter((item) => getItemTone(item, todayKey) === 'overdue').length;
                return (
                  <motion.div
                    key={key}
                    role="button"
                    tabIndex={0}
                    variants={calendarCellMotion}
                    layout
                    whileHover={{ y: -3, scale: 1.012, transition: { duration: 0.16 } }}
                    whileTap={{ scale: 0.985 }}
                    className={`calendar-day-card ${active ? 'calendar-day-active' : ''} ${isToday ? 'calendar-day-today' : ''} ${muted ? 'calendar-day-muted' : ''} ${count ? 'calendar-day-has-work' : ''}`}
                    onClick={() => setSelectedDate(cell)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedDate(cell);
                      }
                    }}
                    title={key}
                  >
                    <strong className="calendar-day-number">{cell.getDate()}</strong>
                    <button
                      type="button"
                      className="calendar-day-add"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedDate(cell);
                        openAddTodo(cell);
                      }}
                      aria-label={`Add todo for ${key}`}
                      title="Add Todo"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    {count > 0 && (
                      <>
                        <span className="calendar-date-dots">
                          {dayItems.slice(0, 4).map((item) => <i key={`${key}-${item.id}`} className={`calendar-dot-${getItemTone(item, todayKey)}`} />)}
                        </span>
                        <span className="calendar-day-pills">
                          {followUpCount > 0 && <small role="button" tabIndex={0} onClick={(event) => openBucketPopup(event, cell, 'follow-ups')} onKeyDown={(event) => { if (event.key === 'Enter') openBucketPopup(event, cell, 'follow-ups'); }}>{followUpCount} Follow-ups</small>}
                          {todoCount > 0 && <small role="button" tabIndex={0} onClick={(event) => openBucketPopup(event, cell, 'todos')} onKeyDown={(event) => { if (event.key === 'Enter') openBucketPopup(event, cell, 'todos'); }}>{todoCount} Todos</small>}
                          {overdueDayCount > 0 && <small role="button" tabIndex={0} className="calendar-day-overdue" onClick={(event) => openBucketPopup(event, cell, 'overdue')} onKeyDown={(event) => { if (event.key === 'Enter') openBucketPopup(event, cell, 'overdue'); }}>{overdueDayCount} Overdue</small>}
                        </span>
                      </>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>

          <motion.aside className="calendar-day-panel" variants={fadeUp} layout>
            <div className="calendar-day-panel-head">
              <div>
                <span>Selected date</span>
                <strong>{new Intl.DateTimeFormat('en', { month: 'long', day: '2-digit', year: 'numeric' }).format(selectedDate)}</strong>
              </div>
              <motion.button type="button" whileHover={{ y: -2, scale: 1.04 }} whileTap={{ scale: 0.94 }} onClick={() => setDrawerDate(selectedDate)}><Eye className="h-4 w-4" /></motion.button>
            </div>
            <div className="calendar-day-tabs">
              <motion.button type="button" whileTap={{ scale: 0.96 }} className={dayPanelTab === 'agenda' ? 'active' : ''} onClick={() => setDayPanelTab('agenda')}>Agenda</motion.button>
              <motion.button type="button" whileTap={{ scale: 0.96 }} className={dayPanelTab === 'follow-ups' ? 'active' : ''} onClick={() => setDayPanelTab('follow-ups')}>Follow-ups <i>{selectedFollowUps.length}</i></motion.button>
              <motion.button type="button" whileTap={{ scale: 0.96 }} className={dayPanelTab === 'todos' ? 'active' : ''} onClick={() => setDayPanelTab('todos')}>Todos <i>{selectedTodos.length}</i></motion.button>
              <motion.button type="button" whileTap={{ scale: 0.96 }} className={dayPanelTab === 'history' ? 'active' : ''} onClick={() => setDayPanelTab('history')}>History</motion.button>
            </div>

            {(dayPanelTab === 'agenda' || dayPanelTab === 'follow-ups') && (
              <PanelSection title="Follow-ups" action="Add Follow-Up" onAction={() => openAddTodo(selectedDate)} footer={selectedFollowUps.length > DAY_PANEL_PAGE_SIZE ? <MiniPager page={followUpPage} totalPages={followUpTotalPages} onPageChange={setFollowUpPage} /> : null}>
                {selectedFollowUps.length ? visibleFollowUps.map((item) => <AgendaCard key={item.id} item={item} todayKey={todayKey} onOpen={() => setDetailItem(item)} />) : <EmptyMini label="No follow-ups for this day" />}
              </PanelSection>
            )}

            {(dayPanelTab === 'agenda' || dayPanelTab === 'todos') && (
              <PanelSection title="Todos" action="Add Todo" onAction={() => openAddTodo(selectedDate)} footer={selectedTodos.length > DAY_PANEL_PAGE_SIZE ? <MiniPager page={todoPage} totalPages={todoTotalPages} onPageChange={setTodoPage} /> : null}>
                {selectedTodos.length ? visibleTodos.map((item) => <AgendaCard key={item.id} item={item} todayKey={todayKey} onOpen={() => setDetailItem(item)} compact />) : <EmptyMini label="No todos for this day" />}
              </PanelSection>
            )}

            {(dayPanelTab === 'agenda' || dayPanelTab === 'history') && (
              <PanelSection title={`Timeline (${new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit' }).format(selectedDate)})`} footer={selectedTimeline.length > DAY_PANEL_PAGE_SIZE ? <MiniPager page={timelinePage} totalPages={timelineTotalPages} onPageChange={setTimelinePage} /> : null}>
                {selectedTimeline.length ? (
                  <div className="calendar-timeline-table-wrap">
                    <table className="calendar-timeline-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Activity</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTimeline.map((entry) => (
                          <tr key={entry.id}>
                            <td><span className={`calendar-timeline-dot calendar-timeline-dot-${entry.tone}`} />{entry.time}</td>
                            <td>{entry.text}</td>
                            <td><em className={`calendar-status calendar-status-${entry.tone}`}>{entry.tone === 'done' ? 'Completed' : entry.tone === 'overdue' ? 'Overdue' : entry.tone === 'revised' ? 'Revised' : 'Open'}</em></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <EmptyMini label="No history for this day" />}
              </PanelSection>
            )}
          </motion.aside>

          <div className="calendar-side-stack">
            <MetricCard icon={CalendarDays} label="Today" value={new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: '2-digit' }).format(today)} note={new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(today)} tone="violet" />
            <MetricCard icon={CheckCircle2} label="Today's Todos" value={`${todayItems.filter((item) => item.status !== 'completed').length} Due`} note={`${todayItems.filter((item) => item.status === 'completed').length} completed`} tone="green" />
            <MetricCard icon={Clock3} label="This Week" value={`${weekItems.filter((item) => item.status !== 'completed').length} Not Due`} note={`${weekItems.filter((item) => item.status === 'completed').length} completed`} tone="pink" />
            <section className="calendar-selected-agenda">
              <div className="calendar-selected-agenda-head">
                <div>
                  <span>Selected Day</span>
                  <strong>{new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: '2-digit' }).format(selectedDate)}</strong>
                </div>
                <button type="button" onClick={() => openAddTodo(selectedDate)}><Plus className="h-4 w-4" /></button>
              </div>
              <div className="calendar-agenda-list">
                {selectedDateItems.length ? selectedDateItems.slice(0, 4).map((item) => (
                  <article key={item.id}>
                    <i className={`calendar-agenda-dot calendar-agenda-${String(item.priority || 'Medium').toLowerCase()}`} />
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.scheduledTime || 'No time'} • {item.category || item.type}</span>
                    </div>
                  </article>
                )) : (
                  <div className="calendar-agenda-empty">
                    <CalendarDays className="h-8 w-8" />
                    <strong>No work scheduled</strong>
                    <span>Pick this date to add a follow-up or todo.</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        </motion.section>

        <motion.section className="calendar-card calendar-table-card" variants={fadeUp} initial="hidden" animate="show" layout>
          <div className="calendar-table-head">
            <div><ListChecks className="h-4 w-4" /><strong>Todo List</strong></div>
            <button type="button" onClick={() => openAddTodo(selectedDate)}><Plus className="h-4 w-4" /> Add Todo</button>
          </div>
          <div className="calendar-filters">
            <label><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search todos..." /></label>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">All Priorities</option>{priorities.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All Categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All Status</option><option value="open">Open</option><option value="completed">Completed</option></select>
            <button type="button" onClick={() => { setQuery(''); setPriorityFilter(''); setStatusFilter(''); setCategoryFilter(''); }}>Clear Filters</button>
          </div>
          <div className="calendar-table-wrap">
            <table>
              <thead><tr><th>Done</th><th>Title</th><th>Status</th><th>Priority</th><th>Scheduled By</th><th>Scheduled Date</th><th>Scheduled Time</th><th>Actions</th></tr></thead>
              <tbody>
                {viewFilteredItems.length ? viewFilteredItems.map((item) => (
                  <motion.tr key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className={item.status === 'completed' ? 'calendar-row-locked' : ''}>
                    <td><button type="button" disabled={item.status === 'completed'} onClick={() => requestCompletion(item)} className={`calendar-check ${item.status === 'completed' ? 'calendar-check-done' : ''}`} title={item.status === 'completed' ? 'Completed tasks are locked' : 'Mark complete'} /></td>
                    <td><strong>{item.title}</strong><span>{[item.clientName, item.leadNumber].filter(Boolean).join(' - ') || item.category || item.type}</span></td>
                    <td><em className={`calendar-status calendar-status-${getItemTone(item, todayKey)}`}>{getItemStatusLabel(item, todayKey)}</em></td>
                    <td><em className={`calendar-priority calendar-priority-${String(item.priority || 'Medium').toLowerCase()}`}>{item.priority || 'Medium'}</em></td>
                    <td>{item.assignedTo || item.createdBy || '-'}</td>
                    <td>{formatHumanDate(item.scheduledDate)}</td>
                    <td>{item.scheduledTime || '-'}</td>
                    <td>
                      <div className="calendar-action-buttons">
                        <button type="button" onClick={() => setDetailItem(item)} title="View details" aria-label="View details"><Eye className="h-4 w-4" /></button>
                        <button type="button" disabled={item.status === 'completed'} onClick={() => openAssignModal(item)} title={item.status === 'completed' ? 'Completed tasks are locked' : 'Assign todo'} aria-label="Assign todo"><UserPlus className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setHistoryTarget(item)} title="Assignment history" aria-label="Assignment history"><History className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </motion.tr>
                )) : <tr><td colSpan={8}><div className="calendar-empty">No todos found for this {calendarView}. Pick a date or add a new task.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </motion.section>

        {bucketPopup && (
          <motion.div className="calendar-bucket-backdrop" variants={modalBackdropMotion} initial="hidden" animate="show" onClick={() => setBucketPopup(null)}>
            <motion.section className={`calendar-bucket-modal calendar-bucket-${bucketPopup.type}`} variants={modalPanelMotion} initial="hidden" animate="show" onClick={(event) => event.stopPropagation()}>
              <div className="calendar-bucket-head">
                <div>
                  <span>{new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: '2-digit', year: 'numeric' }).format(new Date(bucketPopup.date))}</span>
                  <strong>{bucketPopupTitle}</strong>
                  <p>{bucketPopupItems.length} record{bucketPopupItems.length === 1 ? '' : 's'} found for this date</p>
                </div>
                <button type="button" onClick={() => setBucketPopup(null)}><X className="h-5 w-5" /></button>
              </div>
              <div className="calendar-bucket-list">
                {bucketPopupItems.length ? bucketPopupItems.map((item) => {
                  const tone = getItemTone(item, todayKey);
                  return (
                    <motion.article key={item.id} className={`calendar-bucket-card calendar-bucket-card-${tone}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -3 }} transition={springSoft}>
                      <div className="calendar-bucket-card-main">
                        <span className={`calendar-bucket-type calendar-bucket-type-${tone}`}>{getItemStatusLabel(item, todayKey)}</span>
                        <h3>{item.title}</h3>
                        <p>{[item.clientName || item.leadCompanyName, item.leadNumber, item.category].filter(Boolean).join(' - ') || 'No client linked'}</p>
                        <div className="calendar-bucket-meta">
                          <span><Clock3 className="h-3 w-3" /> {item.scheduledTime || 'No time'}</span>
                          <span>{item.priority || 'Medium'} Priority</span>
                          <span>{item.assignedTo || item.createdBy || 'Unassigned'}</span>
                        </div>
                      </div>
                      <div className="calendar-bucket-actions">
                        <button type="button" onClick={() => { setDetailItem(item); setReviseDraft(item.scheduledDate || ''); }}><Eye className="h-4 w-4" /> View</button>
                        <button type="button" disabled={item.status === 'completed'} onClick={() => requestCompletion(item)}><CheckCircle2 className="h-4 w-4" /> {item.status === 'completed' ? 'Locked' : 'Complete'}</button>
                      </div>
                    </motion.article>
                  );
                }) : (
                  <div className="calendar-bucket-empty">
                    <CalendarDays className="h-10 w-10" />
                    <strong>No data found</strong>
                    <span>This date has no {bucketPopupTitle.toLowerCase()}.</span>
                  </div>
                )}
              </div>
              <div className="calendar-bucket-footer">
                <button type="button" onClick={() => setBucketPopup(null)}>Close</button>
                <button type="button" onClick={() => openAddTodo(new Date(bucketPopup.date))}><Plus className="h-4 w-4" /> Add Todo</button>
              </div>
            </motion.section>
          </motion.div>
        )}

        {assignmentTarget && (
          <motion.div className="calendar-assignment-backdrop" variants={modalBackdropMotion} initial="hidden" animate="show" onClick={() => setAssignmentTarget(null)}>
            <motion.section className="calendar-assignment-modal" variants={modalPanelMotion} initial="hidden" animate="show" onClick={(event) => event.stopPropagation()}>
              <div className="calendar-assignment-head">
                <div><UserPlus className="h-5 w-5" /><strong>Assign Todo to User</strong></div>
                <button type="button" onClick={() => setAssignmentTarget(null)}><X className="h-5 w-5" /></button>
              </div>
              <div className="calendar-assignment-summary">
                <strong>Todo: {assignmentTarget.title}</strong>
                <span><b>Priority:</b> <em className={`calendar-priority calendar-priority-${String(assignmentTarget.priority || 'Medium').toLowerCase()}`}>{assignmentTarget.priority || 'Medium'}</em></span>
                <span><b>Currently assigned to:</b> {assignmentTarget.assignedTo || 'Unknown User'}</span>
              </div>
              <div className="calendar-assignment-form">
                <Field label="Assign To" required>
                  <SearchSelect
                    value={assignmentDraft.assignedTo}
                    placeholder="Search and select user"
                    options={userOptions}
                    onChange={(value) => setAssignmentDraft((current) => ({ ...current, assignedTo: value }))}
                  />
                </Field>
                <Field label="Reason for Assignment/Reassignment">
                  <textarea value={assignmentDraft.reason} onChange={(event) => setAssignmentDraft((current) => ({ ...current, reason: event.target.value }))} placeholder="Enter reason for assignment (optional)" />
                </Field>
              </div>
              <div className="calendar-assignment-actions">
                <button type="button" onClick={() => setAssignmentTarget(null)}>Cancel</button>
                <button type="button" onClick={saveAssignment}>Assign Todo</button>
              </div>
            </motion.section>
          </motion.div>
        )}

        {historyTarget && (
          <motion.div className="calendar-assignment-backdrop" variants={modalBackdropMotion} initial="hidden" animate="show" onClick={() => setHistoryTarget(null)}>
            <motion.section className="calendar-history-modal" variants={modalPanelMotion} initial="hidden" animate="show" onClick={(event) => event.stopPropagation()}>
              <div className="calendar-assignment-head">
                <div><History className="h-5 w-5" /><strong>Assignment History</strong></div>
                <button type="button" onClick={() => setHistoryTarget(null)}><X className="h-5 w-5" /></button>
              </div>
              <div className="calendar-assignment-timeline">
                {(historyTarget.assignmentHistory || []).length ? historyTarget.assignmentHistory.map((entry, index) => (
                  <motion.article key={`${entry.changedAt}-${index}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, delay: index * 0.035 }} className={index === 0 ? 'latest' : ''}>
                    <i><Clock3 className="h-4 w-4" /></i>
                    <div>
                      <h3>Assigned to: {entry.assignedTo || '-'}</h3>
                      <p><b>Assigned by:</b> {entry.assignedBy || '-'}</p>
                      {entry.previousAssignee && <p><b>Previous assignee:</b> {entry.previousAssignee}</p>}
                      <p><b>Reason:</b> {entry.reason || 'No reason provided'}</p>
                      <time>{new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(entry.changedAt))}</time>
                    </div>
                  </motion.article>
                )) : (
                  <div className="calendar-bucket-empty">
                    <History className="h-10 w-10" />
                    <strong>No assignment history</strong>
                    <span>Assign this todo to a user to create history.</span>
                  </div>
                )}
              </div>
            </motion.section>
          </motion.div>
        )}

        {completionTarget && (
          <motion.div className="calendar-assignment-backdrop" variants={modalBackdropMotion} initial="hidden" animate="show" onClick={() => setCompletionTarget(null)}>
            <motion.section className="calendar-complete-modal" variants={modalPanelMotion} initial="hidden" animate="show" onClick={(event) => event.stopPropagation()}>
              <div className="calendar-assignment-head">
                <div><CheckCircle2 className="h-5 w-5" /><strong>Mark Todo as Complete</strong></div>
                <button type="button" onClick={() => setCompletionTarget(null)}><X className="h-5 w-5" /></button>
              </div>
              <div className="calendar-complete-title">{completionTarget.title}</div>
              <label className="calendar-complete-field">
                <span><i>*</i> Completion Remarks</span>
                <textarea
                  maxLength={500}
                  value={completionRemarks}
                  onChange={(event) => setCompletionRemarks(event.target.value)}
                  placeholder="Enter remarks about the completion of this task (e.g., outcome, results, notes)"
                  autoFocus
                />
                <em>{completionRemarks.length} / 500</em>
              </label>
              <div className="calendar-assignment-actions calendar-complete-actions">
                <button type="button" onClick={() => setCompletionTarget(null)}>Cancel</button>
                <button type="button" disabled={!completionRemarks.trim()} onClick={saveCompletion}><CheckCircle2 className="h-4 w-4" /><span>Mark as Complete</span></button>
              </div>
            </motion.section>
          </motion.div>
        )}

        {modalDate && (
          <motion.div className="calendar-modal-backdrop" variants={modalBackdropMotion} initial="hidden" animate="show" onClick={() => setModalDate(null)}>
            <motion.div className="calendar-modal calendar-todo-modal" variants={modalPanelMotion} initial="hidden" animate="show" onClick={(event) => event.stopPropagation()}>
              <div className="calendar-modal-head">
                <div>
                  <span>Date: {new Intl.DateTimeFormat('en', { month: 'long', day: '2-digit', year: 'numeric' }).format(modalDate)}</span>
                  <strong><Plus className="h-5 w-5" /> Add New Todo</strong>
                </div>
                <button type="button" className="calendar-modal-close" onClick={() => setModalDate(null)} aria-label="Close add todo popup"><X className="h-5 w-5" /></button>
              </div>
              <div className="calendar-form-grid">
                <Field label="Todo Title" required><input value={todoDraft.title} onChange={(event) => setTodoDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Enter todo title" /></Field>
                <Field label="Description"><textarea value={todoDraft.description} onChange={(event) => setTodoDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Enter todo description" /></Field>
                <Field label="Client Number">
                  <SearchSelect
                    value={todoDraft.clientNumber || ''}
                    placeholder="Search and select a client"
                    options={clientOptions}
                    onChange={(value, selected) => setTodoDraft((current) => ({ ...current, clientNumber: value, clientName: selected?.company || '' }))}
                  />
                </Field>
                <Field label="Lead Number">
                  <SearchSelect
                    value={todoDraft.leadNumber || ''}
                    placeholder="Search and select a lead"
                    options={leadOptions}
                    onChange={(value) => setTodoDraft((current) => ({ ...current, leadNumber: value }))}
                  />
                </Field>
                <Field label="Priority"><select value={todoDraft.priority} onChange={(event) => setTodoDraft((current) => ({ ...current, priority: event.target.value }))}>{priorities.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
                <Field label="Category"><select value={todoDraft.category} onChange={(event) => setTodoDraft((current) => ({ ...current, category: event.target.value }))}>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
                <Field label="Reminder Date"><input type="date" value={todoDraft.scheduledDate} onChange={(event) => setTodoDraft((current) => ({ ...current, scheduledDate: event.target.value }))} /></Field>
                <Field label="Reminder Time"><input type="time" value={todoDraft.scheduledTime} onChange={(event) => setTodoDraft((current) => ({ ...current, scheduledTime: event.target.value }))} /></Field>
                <Field label="Assign To User" wide>
                  <SearchSelect
                    value={todoDraft.assignedTo}
                    placeholder="Select user (optional)"
                    options={userOptions}
                    onChange={(value) => setTodoDraft((current) => ({ ...current, assignedTo: value }))}
                  />
                </Field>
              </div>
              <div className="calendar-modal-actions">
                <button type="button" onClick={() => setModalDate(null)}>Cancel</button>
                <button type="button" onClick={saveTodo}>Add Todo</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {drawerDate && (
          <motion.div className="calendar-drawer-backdrop" variants={modalBackdropMotion} initial="hidden" animate="show" onClick={() => { setDrawerDate(null); setDetailItem(null); }}>
            <motion.aside className="calendar-drawer" variants={drawerPanelMotion} initial="hidden" animate="show" onClick={(event) => event.stopPropagation()}>
              <div className="calendar-drawer-head">
                <div>
                  <span>Day Details</span>
                  <strong>{new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: '2-digit', year: 'numeric' }).format(drawerDate)}</strong>
                </div>
                <button type="button" onClick={() => { setDrawerDate(null); setDetailItem(null); }}><X className="h-5 w-5" /></button>
              </div>
              <button type="button" className="calendar-drawer-add" onClick={() => openAddTodo(drawerDate)}><Plus className="h-4 w-4" /> Add Todo / Follow-Up</button>
              <div className="calendar-drawer-list">
                {drawerItems.length ? drawerItems.map((item) => {
                  const tone = getItemTone(item, todayKey);
                  return (
                    <motion.article key={item.id} className={`calendar-drawer-item calendar-drawer-item-${tone}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} whileHover={{ x: -4 }} transition={springSoft}>
                      <button type="button" disabled={item.status === 'completed'} onClick={() => requestCompletion(item)} className={`calendar-check ${item.status === 'completed' ? 'calendar-check-done' : ''}`} title={item.status === 'completed' ? 'Completed tasks are locked' : 'Mark complete'} />
                      <div>
                        <strong>{item.title}</strong>
                        <span>{[item.clientName, item.leadNumber].filter(Boolean).join(' - ') || item.category || '-'}</span>
                        <small>{item.scheduledTime || 'No time'} - {getItemStatusLabel(item, todayKey)} - {item.priority || 'Medium'}</small>
                      </div>
                      <button type="button" onClick={() => { setDetailItem(item); setReviseDraft(item.scheduledDate || drawerKey); }}><Eye className="h-4 w-4" /></button>
                    </motion.article>
                  );
                }) : (
                  <div className="calendar-drawer-empty">
                    <CalendarDays className="h-10 w-10" />
                    <strong>No items on this date</strong>
                    <span>Add a todo or follow-up for this day.</span>
                  </div>
                )}
              </div>
            </motion.aside>
          </motion.div>
        )}

        {currentDetailItem && (
          <motion.div className="calendar-detail-backdrop" variants={modalBackdropMotion} initial="hidden" animate="show" onClick={() => setDetailItem(null)}>
            <motion.aside className="calendar-detail-panel" variants={drawerPanelMotion} initial="hidden" animate="show" onClick={(event) => event.stopPropagation()}>
              <div className="calendar-drawer-head">
                <div>
                  <span>{currentDetailItem.type === 'follow-up' ? 'Follow-Up Detail' : 'Todo Detail'}</span>
                  <strong>{currentDetailItem.title}</strong>
                </div>
                <button type="button" onClick={() => setDetailItem(null)}><X className="h-5 w-5" /></button>
              </div>
              <div className="calendar-detail-grid">
                <Detail label="Company" value={currentDetailItem.clientName || '-'} />
                <Detail label="Client Number" value={currentDetailItem.clientNumber || currentDetailItem.clientKey || '-'} />
                <Detail label="Lead Number" value={currentDetailItem.leadNumber || '-'} />
                <Detail label="Priority" value={currentDetailItem.priority || 'Medium'} />
                <Detail label="Assigned To" value={currentDetailItem.assignedTo || currentDetailItem.createdBy || '-'} />
                <Detail label="Scheduled" value={`${formatHumanDate(currentDetailItem.scheduledDate)} ${currentDetailItem.scheduledTime || ''}`.trim()} />
              </div>
              {currentDetailItem.description && <p className="calendar-detail-description">{currentDetailItem.description}</p>}
              <div className="calendar-revise-box">
                <label>
                  <span>Revise Date</span>
                  <input type="date" disabled={currentDetailItem.status === 'completed'} value={reviseDraft || currentDetailItem.scheduledDate || ''} onChange={(event) => setReviseDraft(event.target.value)} />
                </label>
                <button type="button" disabled={currentDetailItem.status === 'completed'} onClick={() => reviseItem(currentDetailItem.id, reviseDraft)}><Edit3 className="h-4 w-4" /> Save Revision</button>
                <button type="button" disabled={currentDetailItem.status === 'completed'} onClick={() => requestCompletion(currentDetailItem)}><CheckCircle2 className="h-4 w-4" /> {currentDetailItem.status === 'completed' ? 'Completed Locked' : 'Mark Complete'}</button>
              </div>
              <div className="calendar-history">
                <strong>History</strong>
                {(currentDetailItem.history || []).length ? currentDetailItem.history.map((entry, index) => (
                  <div key={`${entry.changedAt}-${index}`}>
                    <span>{formatHumanDate(entry.fromDate)} revised to {formatHumanDate(entry.toDate)}</span>
                    <small>{entry.changedBy || 'User'} - {formatHumanDate(entry.changedAt)}</small>
                  </div>
                )) : <p>No revisions yet.</p>}
              </div>
            </motion.aside>
          </motion.div>
        )}
      </main>
    </DashboardShell>
  );
}

function MetricCard({ icon: Icon, label, value, note, tone }) {
  return (
    <article className={`calendar-metric calendar-metric-${tone}`}>
      <span><Icon className="h-6 w-6" /></span>
      <div><p>{label}</p><strong>{value}</strong><small>{note}</small></div>
    </article>
  );
}

function Field({ label, required = false, wide = false, children }) {
  return <label className={wide ? 'calendar-field-wide' : ''}><span>{required && <i>* </i>}{label}</span>{children}</label>;
}

function SearchSelect({ value, options = [], placeholder, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => String(option.value) === String(value));
  const filtered = options
    .filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 80);

  return (
    <div className="calendar-search-select">
      <button type="button" onClick={() => setOpen((current) => !current)}>
        <span>{selected?.label || placeholder}</span>
        <ChevronRight className={`h-4 w-4 ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="calendar-search-select-menu">
          <div className="calendar-search-select-input">
            <Search className="h-4 w-4" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} autoFocus />
          </div>
          <div className="calendar-search-select-list">
            {filtered.length ? filtered.map((option) => (
              <button
                type="button"
                key={`${option.id || option.value}-${option.label}`}
                className={String(option.value) === String(value) ? 'selected' : ''}
                onClick={() => {
                  onChange(option.value, option);
                  setOpen(false);
                  setQuery('');
                }}
              >
                {option.label}
              </button>
            )) : <p>No records found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function PanelSection({ title, action, onAction, children, footer = null }) {
  return (
    <motion.section className="calendar-panel-section" variants={fadeUp} initial="hidden" animate="show" layout>
      <div className="calendar-panel-section-head">
        <strong>{title}</strong>
        {action && <motion.button type="button" whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} onClick={onAction}><Plus className="h-3 w-3" /> {action}</motion.button>}
      </div>
      <div className="calendar-panel-section-body">{children}</div>
      {footer}
    </motion.section>
  );
}

function MiniPager({ page, totalPages, onPageChange }) {
  return (
    <div className="calendar-mini-pager">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange((value) => Math.max(1, value - 1))}><ChevronLeft className="h-3 w-3" /> Prev</button>
      <span>Page {page} of {totalPages}</span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPageChange((value) => Math.min(totalPages, value + 1))}>Next <ChevronRight className="h-3 w-3" /></button>
    </div>
  );
}

function AgendaCard({ item, todayKey, onOpen, compact = false }) {
  const tone = getItemTone(item, todayKey);
  const date = item.scheduledDate ? new Date(item.scheduledDate) : null;
  const day = date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('en', { day: '2-digit' }).format(date) : '--';
  const month = date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('en', { month: 'short' }).format(date) : '';
  return (
    <motion.button
      type="button"
      className={`calendar-agenda-card calendar-agenda-card-${tone} ${compact ? 'calendar-agenda-card-compact' : ''}`}
      onClick={onOpen}
      layout
      initial={{ opacity: 0, x: 14, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={springSoft}
      whileHover={{ x: 4, y: -2 }}
      whileTap={{ scale: 0.985 }}
    >
      <span className="calendar-agenda-date"><b>{day}</b><i>{month}</i></span>
      <span className="calendar-agenda-card-main">
        <strong>{item.title}</strong>
        <small>{[item.clientName || item.leadCompanyName, item.category].filter(Boolean).join(' - ') || item.leadNumber || 'General'}</small>
      </span>
      <span className={`calendar-status calendar-status-${tone}`}>{getItemStatusLabel(item, todayKey)}</span>
      <em>{item.scheduledTime || 'No time'}</em>
    </motion.button>
  );
}

function EmptyMini({ label }) {
  return <div className="calendar-mini-empty">{label}</div>;
}

function Detail({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
