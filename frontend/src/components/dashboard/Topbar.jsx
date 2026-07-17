import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarCheck2, CheckCircle2, Clock3, FileText, Info, LogOut, Menu, UserRound, X } from 'lucide-react'
import { brand } from '../../constants/brand'
import { roleLabels } from '../../constants/dashboard'
import api from '../../services/api'
import { API_ENDPOINTS } from '../../services/apiEndpoints'

const NOTIFICATIONS_STORAGE_KEY = 'crm.notifications.v1'
const CALENDAR_STORAGE_KEY = 'crm.calendar.todos.v1'
const notificationSoundUrl = '/audio/Notifications%20sound.wav'
const clickSoundUrl = '/audio/click%20scound.wav'

function readStorageArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase()
}

function getUserTokens(user = {}) {
  const safeUser = user || {}
  return [safeUser._id, safeUser.id, safeUser.crmUserId, safeUser.userId, safeUser.ccpUserId, safeUser.email, safeUser.name]
    .map(normalizeToken)
    .filter(Boolean)
}

function getItemAssigneeTokens(item = {}) {
  return [
    item.assignedTo,
    item.assignedToName,
    item.assignedToEmail,
    item.assignedToId,
    item.owner,
    item.scheduledBy,
    item.createdBy
  ].map(normalizeToken).filter(Boolean)
}

function formatReminderDate(item = {}) {
  if (!item.scheduledDate) return 'No date'
  const date = new Date(item.scheduledDate)
  const label = Number.isNaN(date.getTime())
    ? item.scheduledDate
    : new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' }).format(date)
  return item.scheduledTime ? `${label}, ${item.scheduledTime}` : label
}

function getReminderTone(item = {}, todayKey = '') {
  if (item.scheduledDate && item.scheduledDate < todayKey) return 'overdue'
  if (item.scheduledDate === todayKey) return 'today'
  return 'upcoming'
}

function readBellData(currentUser) {
  const userTokens = getUserTokens(currentUser)
  const todayKey = new Date().toISOString().slice(0, 10)
  const calendarItems = readStorageArray(CALENDAR_STORAGE_KEY)
  const reminders = calendarItems
    .filter((item) => item.status !== 'completed')
    .filter((item) => {
      const assigneeTokens = getItemAssigneeTokens(item)
      if (!assigneeTokens.length || !userTokens.length) return true
      return assigneeTokens.some((token) => userTokens.includes(token))
    })
    .sort((a, b) => {
      const dateCompare = String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || ''))
      if (dateCompare) return dateCompare
      return String(a.scheduledTime || '').localeCompare(String(b.scheduledTime || ''))
    })
    .slice(0, 8)
    .map((item) => ({ ...item, reminderTone: getReminderTone(item, todayKey) }))
  const announcements = readStorageArray(NOTIFICATIONS_STORAGE_KEY)
    .filter((item) => item.status !== 'Inactive')
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, 3)
  return { reminders, announcements, count: reminders.length + announcements.length }
}

export default function Topbar({ currentUser, onOpenProfile, onOpenSidebar, onLogout }) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)
  const [bellData, setBellData] = useState(() => readBellData(currentUser))
  const previousNotificationCountRef = useRef(bellData.count)
  const notificationAudioRef = useRef(null)
  const clickAudioRef = useRef(null)
  const initial = (currentUser?.name || currentUser?.email || 'P').slice(0, 1).toUpperCase()
  const avatarUrl = useMemo(() => {
    let storedUser = null
    try { storedUser = JSON.parse(localStorage.getItem('user') || 'null') } catch { storedUser = null }
    return currentUser?.avatarUrl
      || currentUser?.avatar
      || currentUser?.profileImage
      || currentUser?.photoUrl
      || currentUser?.imageUrl
      || storedUser?.avatarUrl
      || storedUser?.avatar
      || storedUser?.profileImage
      || ''
  }, [currentUser])
  const notificationCount = bellData.count
  const reminderSummary = useMemo(() => {
    const overdue = bellData.reminders.filter((item) => item.reminderTone === 'overdue').length
    const today = bellData.reminders.filter((item) => item.reminderTone === 'today').length
    return { overdue, today }
  }, [bellData.reminders])

  useEffect(() => {
    notificationAudioRef.current = new Audio(notificationSoundUrl)
    clickAudioRef.current = new Audio(clickSoundUrl)
    notificationAudioRef.current.preload = 'auto'
    clickAudioRef.current.preload = 'auto'
  }, [])

  function playSound(audioRef) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    audio.play().catch(() => {})
  }

  useEffect(() => {
    function syncNotificationCount() {
      const nextData = readBellData(currentUser)
      setBellData((current) => {
        const serverItems = current.announcements.filter((item) => item.kind && item.kind !== 'announcement-local')
        const mergedAnnouncements = [...serverItems, ...nextData.announcements]
          .map((item) => ({ ...item, id: item.id || item._id || item.title }))
        const uniqueAnnouncements = [...new Map(mergedAnnouncements.map((item) => [String(item.id), item])).values()].slice(0, 5)
        return {
          reminders: nextData.reminders,
          announcements: uniqueAnnouncements,
          count: nextData.reminders.length + uniqueAnnouncements.length
        }
      })
      if (nextData.count > previousNotificationCountRef.current) {
        playSound(notificationAudioRef)
      }
      previousNotificationCountRef.current = nextData.count
    }

    const intervalId = window.setInterval(syncNotificationCount, 3000)
    window.addEventListener('storage', syncNotificationCount)
    window.addEventListener('crm-calendar-items-updated', syncNotificationCount)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('storage', syncNotificationCount)
      window.removeEventListener('crm-calendar-items-updated', syncNotificationCount)
    }
  }, [currentUser])

  useEffect(() => {
    let cancelled = false

    async function syncServerCalendarItems() {
      try {
        const response = await api.get(API_ENDPOINTS.calendarItems.list)
        if (cancelled) return
        const serverItems = Array.isArray(response.data?.items) ? response.data.items : []
        localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(serverItems))
        window.dispatchEvent(new CustomEvent('crm-calendar-items-updated'))
      } catch {
        // Local reminders still work when calendar API is temporarily unavailable.
      }
    }

    async function syncServerNotifications() {
      try {
        const response = await api.get(API_ENDPOINTS.notifications.list)
        if (cancelled) return
        const serverAnnouncements = (response.data?.notifications || [])
          .filter((item) => item.status !== 'Inactive')
          .slice(0, 5)
        setBellData((current) => {
          const mergedAnnouncements = [...serverAnnouncements, ...current.announcements]
            .map((item) => ({ ...item, id: item.id || item._id || item.title }))
          const uniqueAnnouncements = [...new Map(mergedAnnouncements.map((item) => [String(item.id), item])).values()].slice(0, 5)
          return {
            reminders: current.reminders,
            announcements: uniqueAnnouncements,
            count: current.reminders.length + uniqueAnnouncements.length
          }
        })
      } catch {
        // Local reminder data still works when server notifications are temporarily unavailable.
      }
    }

    syncServerCalendarItems()
    syncServerNotifications()
    const intervalId = window.setInterval(() => {
      syncServerCalendarItems()
      syncServerNotifications()
    }, 15000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  function handleProfile() {
    setMenuOpen(false)
    onOpenProfile?.()
  }

  function handleLogout() {
    setMenuOpen(false)
    onLogout?.()
  }

  function handleNotifications() {
    playSound(clickAudioRef)
    setMenuOpen(false)
    setReminderOpen((value) => !value)
  }

  return (
    <>
    <header className="crm-topbar fixed left-0 right-0 top-0 z-[60] border-b border-slate-200 bg-white/90 backdrop-blur-xl">
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-5 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="btn-lift inline-flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal-800 lg:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="btn-lift flex min-w-0 items-center gap-3 rounded-2xl px-1.5 py-1 transition hover:bg-teal-50"
            aria-label="Go to dashboard"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm shadow-slate-950/5">
              <img src={brand.logoUrl} alt="Anant Tattva" className="h-full w-full object-contain" />
            </span>
            <span className="min-w-0 text-left">
              <span className="block truncate text-lg font-black leading-tight text-slate-950">{brand.name}</span>
              <span className="hidden truncate text-xs font-extrabold uppercase tracking-[0.14em] text-teal-700 sm:block">Anant Tattva</span>
            </span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <IconButton icon={Info} label="Anant Tattva Website" onClick={() => { window.location.href = 'https://ananttattva.com/' }} />
          <div className="relative">
            <IconButton icon={Bell} label="Notifications" onClick={handleNotifications} badge={notificationCount} pulse={notificationCount > 0} />
            {reminderOpen && (
              <section className="topbar-reminder-panel" aria-label="Todo reminders">
                <div className="topbar-reminder-arrow" />
                <div className="topbar-reminder-head">
                  <div>
                    <span><Bell className="h-4 w-4" /> Todo Reminders</span>
                    <strong>{notificationCount ? `${notificationCount} active alert${notificationCount === 1 ? '' : 's'}` : 'All clear'}</strong>
                  </div>
                  <button type="button" onClick={() => setReminderOpen(false)} aria-label="Close reminders"><X className="h-4 w-4" /></button>
                </div>
                <div className="topbar-reminder-stats">
                  <span><Clock3 className="h-4 w-4" /> {reminderSummary.today} Today</span>
                  <span><CalendarCheck2 className="h-4 w-4" /> {reminderSummary.overdue} Overdue</span>
                </div>
                <div className="topbar-reminder-list">
                  {bellData.reminders.length ? bellData.reminders.map((item) => {
                    const isFollowUp = item.type === 'follow-up' || item.category === 'Follow-Up'
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`topbar-reminder-item topbar-reminder-${item.reminderTone}`}
                        onClick={() => { setReminderOpen(false); navigate('/calendar') }}
                      >
                        <span>{isFollowUp ? <CalendarCheck2 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</span>
                        <div>
                          <strong>{item.title || (isFollowUp ? 'Follow-up reminder' : 'Todo reminder')}</strong>
                          <small>{[item.clientName, item.leadNumber, formatReminderDate(item)].filter(Boolean).join(' - ')}</small>
                        </div>
                        <em>{isFollowUp ? 'Follow-up' : 'Todo'}</em>
                      </button>
                    )
                  }) : (
                    <div className="topbar-reminder-empty">
                      <CheckCircle2 className="h-10 w-10" />
                      <strong>No reminders</strong>
                      <span>Assigned follow-ups and todos will appear here.</span>
                    </div>
                  )}
                  {bellData.announcements.length > 0 && (
                    <div className="topbar-reminder-notices">
                      <span>Notifications</span>
                      {bellData.announcements.map((item) => (
                        <button type="button" key={item.id} onClick={() => { setReminderOpen(false); navigate('/notifications') }}>
                          <FileText className="h-4 w-4" />
                          <strong>{item.title}</strong>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="topbar-reminder-actions">
                  <button type="button" onClick={() => { setReminderOpen(false); navigate('/calendar') }}>Open Calendar</button>
                  <button type="button" onClick={() => { setReminderOpen(false); navigate('/notifications') }}>Notification Center</button>
                </div>
              </section>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="btn-lift flex items-center gap-3 rounded-full border border-transparent px-1.5 py-1.5 transition hover:border-teal-100 hover:bg-teal-50"
              aria-expanded={menuOpen}
              aria-label="Open account menu"
            >
              <div className="hidden text-right sm:block">
                <p className="font-black text-slate-900">{currentUser?.name || 'CRM User'}</p>
                <p className="text-sm font-semibold text-slate-500">{roleLabels[currentUser?.role] || 'Consultant'}</p>
              </div>
              <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-teal-700 to-sky-600 font-black text-white shadow-lg shadow-teal-700/20 ring-4 ring-teal-50">
                {avatarUrl ? <img src={avatarUrl} alt={currentUser?.name || 'User'} className="h-full w-full object-cover" /> : initial}
              </div>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-14 z-40 w-80 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl shadow-slate-900/15">
                <div className="flex items-center gap-4 bg-gradient-to-br from-teal-50 to-white p-4">
                  <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-teal-700 to-sky-600 text-xl font-black text-white shadow-lg shadow-teal-700/20">
                    {avatarUrl ? <img src={avatarUrl} alt={currentUser?.name || 'User'} className="h-full w-full object-cover" /> : initial}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-950">{currentUser?.name || 'CRM User'}</p>
                    <p className="truncate text-sm font-bold text-slate-500">{currentUser?.email}</p>
                    <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-teal-700">{roleLabels[currentUser?.role] || currentUser?.role}</p>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  <button
                    type="button"
                    onClick={handleProfile}
                    className="flex min-h-12 w-full items-center gap-3 px-4 text-left font-black text-slate-700 transition hover:bg-teal-50 hover:text-teal-800"
                  >
                    <UserRound className="h-4 w-4" />
                    Profile Settings
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex min-h-12 w-full items-center gap-3 px-4 text-left font-black text-red-600 transition hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
    </>
  )
}

function IconButton({ icon: Icon, label, onClick, badge = 0, pulse = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn-lift relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600 transition hover:bg-teal-50 hover:text-teal-700 ${pulse ? 'topbar-notification-pulse' : ''}`}
      aria-label={label}
      title={label}
    >
      <Icon className="h-5 w-5" />
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-black leading-none text-white shadow-lg shadow-red-500/30">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}
