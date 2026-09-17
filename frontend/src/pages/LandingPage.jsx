import React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BarChart3, Building2, CalendarDays, Check, FileCheck2,
  Leaf, Linkedin, LockKeyhole, Play, ShieldCheck, TrendingUp, Twitter,
  UserRound, UsersRound, Zap
} from 'lucide-react'
import '../styles/landing.css'

const clients = [15, 9, 30, 1, 2, 3, 20, 27, 33]
const services = [
  { icon: UsersRound, tone: 'blue', label: 'Sales CRM', title: 'Turn every lead into a relationship.', copy: 'Capture enquiries, assign owners, follow every conversation and move opportunities forward.' },
  { icon: FileCheck2, tone: 'orange', label: 'EPR Compliance', title: 'Never miss a filing milestone.', copy: 'Keep registrations, documents, returns and approvals organised with action-ready workflows.' },
  { icon: BarChart3, tone: 'green', label: 'Operations', title: 'See work clearly. Act faster.', copy: 'Give teams one source of truth for daily tasks, productivity, ownership and real-time visibility.' }
]

function Wordmark({ inverse = false, compact = false }) {
  return <span className={`lp-wordmark ${inverse ? 'inverse' : ''} ${compact ? 'compact' : ''}`}>
    <span className="lp-wordmark-symbol" aria-hidden="true">अ</span>
    <span><b>ANANT</b><small>TATTVA</small></span>
  </span>
}

function DashboardPreview() {
  return <div className="lp-preview-stage" aria-label="Anant Tattva Business CRM dashboard preview">
    <div className="lp-preview-blob blob-one" /><div className="lp-preview-blob blob-two" />
    <div className="lp-dashboard">
      <header className="lp-dashboard-head"><Wordmark compact /><div className="lp-dash-search">Search anything...</div><span className="lp-dash-avatar">AT</span><span className="lp-dash-welcome"><small>Welcome</small><b>Anant Tattva</b></span></header>
      <div className="lp-dashboard-body">
        <aside className="lp-dash-nav"><span className="active"><BarChart3 />Overview</span><span><UsersRound />Leads</span><span><FileCheck2 />Compliance</span><span><Building2 />Clients</span><span><TrendingUp />Reports</span></aside>
        <section className="lp-dash-content">
          <div className="lp-dash-title"><span><small>Good morning <i>☀</i></small><b>Your business, at a glance.</b><em>Track. Manage. Grow. Together.</em></span><button type="button"><CalendarDays />Last 6 months</button></div>
          <div className="lp-dash-stats">
            <article><span className="aqua"><UsersRound /></span><small>Active clients</small><b>248</b><em>↑ 12% this month</em></article>
            <article><span className="blue"><TrendingUp /></span><small>Open leads</small><b>86</b><em>↑ 24% progressing</em></article>
            <article><span className="purple"><ShieldCheck /></span><small>Compliance</small><b>94%</b><em>On track</em></article>
            <article><span className="mint"><UsersRound /></span><small>Team growth</small><b>+32%</b><em>This quarter</em></article>
          </div>
          <div className="lp-dash-bottom">
            <article className="lp-performance">
              <div><b><BarChart3 /> Performance</b><span><strong>+32%</strong><small>Team growth</small></span></div>
              <svg viewBox="0 0 560 145" role="img" aria-label="Performance improving from January to June"><defs><linearGradient id="lpChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#11a98a" stopOpacity=".28"/><stop offset="1" stopColor="#11a98a" stopOpacity="0"/></linearGradient></defs><path className="lp-chart-grid" d="M0 35H560M0 75H560M0 115H560" /><path className="lp-chart-fill" d="M0 124 C55 116,88 86,145 94 S220 106,270 68 S345 78,392 59 S466 39,560 17 L560 145H0Z" /><path className="lp-chart-line" d="M0 124 C55 116,88 86,145 94 S220 106,270 68 S345 78,392 59 S466 39,560 17" /></svg>
              <div className="lp-chart-months"><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span></div>
            </article>
            <article className="lp-tasks"><div><span className="lp-check"><Check /></span><b>24 tasks completed<small>Today</small></b></div><ul><li><Check />Follow up with client</li><li><Check />Submit compliance docs</li><li><Check />Review new leads</li><li><Check />Update approvals</li></ul><a href="#workspace">View all tasks <ArrowRight /></a></article>
          </div>
        </section>
      </div>
    </div>
  </div>
}

export default function LandingPage() {
  return <div className="landing-page">
    <header className="lp-header"><div className="lp-shell lp-header-inner"><Link to="/" aria-label="Anant Tattva home"><Wordmark /></Link><Link className="lp-login" to="/login"><UserRound />Login</Link></div></header>
    <main>
      <section className="lp-hero"><div className="lp-hero-orb orb-left" /><div className="lp-hero-orb orb-right" />
        <div className="lp-shell lp-hero-grid"><div className="lp-hero-copy"><span className="lp-kicker"><Leaf />Built for responsible growth</span><h1>The CRM that turns complex work into <span>clear progress.</span></h1><p>Connect sales, EPR compliance and daily operations in one intelligent workspace — built around the way your team actually works.</p><div className="lp-hero-actions"><Link className="lp-outline-button" to="/login">Login to CRM</Link></div><div className="lp-proof"><span><LockKeyhole />Secure OTP access</span><span><UsersRound />Role-based workflows</span><span><Zap />Real-time visibility</span></div></div><DashboardPreview /></div>
        <div className="lp-side-words" aria-hidden="true"><span>People</span><span>Processes</span><span>Planet</span><span>Progress</span></div>
      </section>
      <section id="workspace" className="lp-workspace"><div className="lp-shell"><div className="lp-section-heading"><span>One connected workspace</span><h2>Everything your team needs to move business forward.</h2><p>Less switching, fewer blind spots and a more confident next step for everyone.</p></div>
        <div className="lp-service-grid">{services.map(({ icon: Icon, tone, label, title, copy }) => <article className={`lp-service-card ${tone}`} key={label}><span className="lp-service-icon"><Icon /></span><div><small>{label}</small><h3>{title}</h3><p>{copy}</p><a href="mailto:info@ananttattva.com">Discover more <ArrowRight /></a></div><i aria-hidden="true" /></article>)}</div>
        <div className="lp-metrics"><article><span><UsersRound /></span><b>500+<small>Teams empowered</small></b></article><article><span><Zap /></span><b>2x<small>Faster compliance</small></b></article><article><span><ShieldCheck /></span><b>99.9%<small>Reliable &amp; secure</small></b></article><article><span><Building2 /></span><b><small>Trusted by leading organisations<br />across India</small></b></article></div>
      </div></section>
      <section className="lp-partners"><div className="lp-section-heading"><span>Trusted partnerships</span><h2>Supporting ambitious teams across India.</h2></div><div className="lp-logo-row">{clients.map((client) => <div className="lp-client" key={client}><img src={`/clients/${client}.png`} alt="Client logo" loading="lazy" /></div>)}</div></section>
    </main>
    <footer className="lp-footer"><div className="lp-shell lp-footer-main"><div className="lp-footer-brand"><Wordmark inverse /><p>Business CRM</p></div><p className="lp-footer-line">Smarter operations for a more responsible future.</p><address><b>Mumbai Office</b><span>1st Floor, A/25, Technocraft House, Road No. 3, MIDC,<br />Andheri East, Mumbai - 400093</span></address><address><b>Ahmedabad Office</b><span>World Trade Tower (WTT), Office No. 1112, A Block,<br />11th Floor, Makarba, Ahmedabad - 380051</span></address><div className="lp-socials"><a href="https://www.linkedin.com" aria-label="LinkedIn"><Linkedin /></a><a href="https://www.youtube.com" aria-label="YouTube"><Play /></a><a href="https://twitter.com" aria-label="Twitter"><Twitter /></a></div></div><div className="lp-shell lp-footer-bottom"><small>© {new Date().getFullYear()} Anant Tattva Private Limited. All rights reserved.</small><nav><a href="mailto:info@ananttattva.com">Privacy Policy</a><a href="mailto:info@ananttattva.com">Terms of Use</a><a href="mailto:info@ananttattva.com">Contact Us</a></nav></div></footer>
  </div>
}
