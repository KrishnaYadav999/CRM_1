import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  ArrowRight, BadgeCheck, BarChart3, CircleCheckBig, Factory, FileCheck2,
  Globe2, Headphones, Leaf, Menu, ShieldCheck, Sparkles, UsersRound, X, Zap
} from 'lucide-react'
import { brand } from '../constants/brand'
import '../styles/landing.css'

gsap.registerPlugin(ScrollTrigger)

const clientLogos = Array.from({ length: 58 }, (_, index) => ({
  id: index + 1,
  src: `https://ananttattva.com/wp-content/uploads/2025/08/${index + 1}.png`
}))

const solutions = [
  { icon: UsersRound, accent: 'blue', eyebrow: 'Sales CRM', title: 'Turn every lead into a relationship.', copy: 'Capture enquiries, assign owners, follow every conversation and move opportunities forward from one clear pipeline.' },
  { icon: FileCheck2, accent: 'orange', eyebrow: 'EPR Compliance', title: 'Never miss a filing milestone.', copy: 'Keep registrations, documents, returns and approvals organised with action-ready compliance workflows.' },
  { icon: BarChart3, accent: 'green', eyebrow: 'Operations', title: 'See work clearly. Act faster.', copy: 'Give teams one source of truth for daily tasks, productivity, ownership and real-time business visibility.' }
]

const capabilities = [
  { icon: Zap, title: 'Automated workflows', copy: 'Move routine work forward with smart reminders, approvals and guided next actions.' },
  { icon: ShieldCheck, title: 'Secure by design', copy: 'Role-based access and OTP verification keep sensitive client operations protected.' },
  { icon: Headphones, title: 'Built for your team', copy: 'A focused workspace for sales, compliance, operations and leadership.' }
]

function BrandMark({ compact = false }) {
  return <span className={`lp-brand ${compact ? 'is-compact' : ''}`}><span className="lp-brand-logo"><img src={brand.logoUrl} alt="Anant Tattva" /></span><span className="lp-brand-copy"><b>ANANT TATTVA</b><small>Business CRM</small></span></span>
}

function ProductPreview() {
  return <div className="lp-product-wrap" aria-label="Anant Tattva CRM dashboard preview">
    <div className="lp-orbit lp-orbit-one" /><div className="lp-orbit lp-orbit-two" />
    <div className="lp-product-card">
      <div className="lp-product-topbar"><BrandMark compact /><span className="lp-preview-search">Search anything...</span><span className="lp-preview-avatar">AT</span></div>
      <div className="lp-product-body">
        <aside><span className="active"><BarChart3 /> Overview</span><span><UsersRound /> Leads</span><span><FileCheck2 /> Compliance</span><span><Factory /> Clients</span></aside>
        <div className="lp-product-main">
          <div className="lp-preview-heading"><span><small>GOOD MORNING</small><b>Your business, at a glance.</b></span><i>Live overview</i></div>
          <div className="lp-stat-row"><div><small>Active clients</small><b>248</b><em>+12 this month</em></div><div><small>Open leads</small><b>86</b><em>24 progressing</em></div><div><small>Compliance</small><b>94%</b><em>On track</em></div></div>
          <div className="lp-chart-panel"><span><b>Performance</b><small>Last 6 months</small></span><svg viewBox="0 0 520 150" role="img" aria-label="Rising performance chart"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#159f8c" stopOpacity=".3"/><stop offset="1" stopColor="#159f8c" stopOpacity="0"/></linearGradient></defs><path className="chart-fill" d="M0,132 C52,115 61,127 105,102 S180,110 220,74 S300,83 340,51 S425,72 520,15 L520,150 L0,150 Z"/><path className="chart-line" d="M0,132 C52,115 61,127 105,102 S180,110 220,74 S300,83 340,51 S425,72 520,15"/></svg></div>
        </div>
      </div>
    </div>
    <div className="lp-floating-card lp-floating-task"><CircleCheckBig /><span><b>24 tasks completed</b><small>Today</small></span></div><div className="lp-floating-card lp-floating-growth"><Sparkles /><span><b>+32%</b><small>Team growth</small></span></div>
  </div>
}

export default function LandingPage() {
  const rootRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const context = gsap.context(() => {
      gsap.from('.lp-nav-inner', { y: -24, opacity: 0, duration: .65, ease: 'power3.out' })
      gsap.from('.lp-hero-copy > *', { y: 35, opacity: 0, duration: .85, stagger: .1, ease: 'power3.out', delay: .15 })
      gsap.from('.lp-product-card', { x: 55, y: 22, rotateY: -7, opacity: 0, duration: 1.05, ease: 'power3.out', delay: .3 })
      gsap.from('.lp-floating-card', { scale: .7, opacity: 0, duration: .7, stagger: .18, ease: 'back.out(1.7)', delay: .9 })
      gsap.to('.lp-floating-task', { y: -10, duration: 2.8, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.to('.lp-floating-growth', { y: 9, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.utils.toArray('.lp-reveal').forEach((element) => gsap.from(element, { y: 46, opacity: 0, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: element, start: 'top 84%', once: true } }))
      gsap.to('.lp-logo-track', { xPercent: -50, duration: 44, repeat: -1, ease: 'none' })
    }, rootRef)
    return () => context.revert()
  }, [])

  return <div ref={rootRef} className="landing-page">
    <header className="lp-nav">
      <div className="lp-nav-inner"><Link to="/" className="lp-brand-link" aria-label="Anant Tattva home"><BrandMark /></Link><nav className={menuOpen ? 'is-open' : ''} aria-label="Main navigation"><a href="#solutions" onClick={() => setMenuOpen(false)}>Solutions</a><a href="#platform" onClick={() => setMenuOpen(false)}>Platform</a><a href="#industries" onClick={() => setMenuOpen(false)}>Industries</a><a href="#customers" onClick={() => setMenuOpen(false)}>Customers</a><a href="#about" onClick={() => setMenuOpen(false)}>Company</a><Link className="lp-mobile-login" to="/login">Login <ArrowRight /></Link></nav><div className="lp-nav-actions"><a className="lp-contact" href="mailto:info@ananttattva.com"><small>Talk to us</small><b>info@ananttattva.com</b></a><Link className="lp-login-link" to="/login"><UsersRound /> Login</Link><a className="lp-primary-button small" href="#contact">Get started</a><button className="lp-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle menu">{menuOpen ? <X /> : <Menu />}</button></div></div>
      <div className="lp-subnav"><div><b>CRM</b><span><a href="#platform">Overview</a><a href="#solutions">What is CRM?</a><a href="#industries">Solutions</a><a href="#customers">Customers</a></span><a className="lp-subnav-cta" href="#contact">Book a consultation <ArrowRight /></a></div></div>
      <div className="lp-announcement"><Sparkles /> Smarter EPR operations start with connected teams. <a href="#platform">Explore the platform <ArrowRight /></a></div>
    </header>
    <main>
      <section className="lp-hero"><div className="lp-hero-glow"/><div className="lp-container lp-hero-grid"><div className="lp-hero-copy"><span className="lp-kicker"><Leaf /> Built for responsible growth</span><h1>The CRM that turns complex work into <span>clear progress.</span></h1><p>Connect sales, EPR compliance and daily operations in one intelligent workspace—built around the way your team actually works.</p><div className="lp-hero-actions"><a className="lp-primary-button" href="#contact">Start growing <ArrowRight /></a><Link className="lp-secondary-button" to="/login">Login to CRM</Link></div><div className="lp-hero-proof"><span><BadgeCheck /> Secure OTP access</span><span><BadgeCheck /> Role-based workflows</span><span><BadgeCheck /> Real-time visibility</span></div></div><ProductPreview /></div><div className="lp-wave" aria-hidden="true"/></section>
      <section id="solutions" className="lp-section lp-solutions"><div className="lp-container"><div className="lp-section-heading lp-reveal"><span>One connected workspace</span><h2>Everything your team needs to move business forward.</h2><p>Less switching, fewer blind spots and a more confident next step for everyone.</p></div><div className="lp-solution-grid">{solutions.map(({ icon: Icon, accent, eyebrow, title, copy }) => <article key={title} className={`lp-solution-card lp-reveal ${accent}`}><div className="lp-solution-visual"><span><Icon /></span><i/><i/><i/></div><small>{eyebrow}</small><h3>{title}</h3><p>{copy}</p><a href="#contact">Discover more <ArrowRight /></a></article>)}</div></div></section>
      <section id="platform" className="lp-section lp-platform"><div className="lp-container lp-platform-grid"><div className="lp-platform-visual lp-reveal"><div className="lp-ring ring-one"/><div className="lp-ring ring-two"/><span className="lp-core"><img src={brand.logoUrl} alt=""/></span><span className="lp-node node-one"><UsersRound/>Sales</span><span className="lp-node node-two"><FileCheck2/>Compliance</span><span className="lp-node node-three"><BarChart3/>Insights</span></div><div className="lp-platform-copy lp-reveal"><span className="lp-section-label">The Anant Tattva advantage</span><h2>One view of your customer. One rhythm for your team.</h2><p>From the first enquiry to ongoing compliance, every handoff stays visible, accountable and ready for action.</p><ul><li><CircleCheckBig/> Centralised customer and document history</li><li><CircleCheckBig/> Clear ownership across every service</li><li><CircleCheckBig/> Dashboards that answer what needs attention now</li></ul><a className="lp-primary-button" href="#contact">See how it works <ArrowRight/></a></div></div></section>
      <section id="industries" className="lp-section lp-capabilities"><div className="lp-container"><div className="lp-section-heading lp-reveal"><span>Designed for momentum</span><h2>Enterprise control, without enterprise complexity.</h2></div><div className="lp-capability-grid">{capabilities.map(({icon:Icon,title,copy})=><article className="lp-reveal" key={title}><span><Icon/></span><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>
      <section id="customers" className="lp-section lp-customers"><div className="lp-container"><div className="lp-section-heading lp-reveal"><span>Trusted partnerships</span><h2>Supporting ambitious teams across India.</h2><p>We help organisations bring clarity, accountability and confidence to their environmental operations.</p></div></div><div className="lp-logo-marquee" aria-label="Anant Tattva clients"><div className="lp-logo-track">{[...clientLogos,...clientLogos].map((logo,index)=><div className="lp-client-logo" key={`${logo.id}-${index}`}><img src={logo.src} alt={`Client ${logo.id}`} loading="lazy" onError={(event)=>{event.currentTarget.parentElement.style.display='none'}}/></div>)}</div></div></section>
      <section id="about" className="lp-section lp-impact"><div className="lp-container lp-impact-card lp-reveal"><div><span className="lp-section-label">Growth with responsibility</span><h2>Build a business that moves forward—and leaves less behind.</h2><p>Anant Tattva combines environmental expertise with practical technology to help teams work cleaner, faster and smarter.</p><a className="lp-light-button" href="#contact">Partner with us <ArrowRight/></a></div><div className="lp-impact-stats"><span><b>360°</b><small>Customer visibility</small></span><span><b>58+</b><small>Trusted organisations</small></span><span><b>1</b><small>Connected platform</small></span></div></div></section>
      <section id="contact" className="lp-section lp-final-cta"><div className="lp-container lp-reveal"><span><Globe2/></span><h2>Ready to make every action count?</h2><p>See how Anant Tattva CRM can bring your sales, compliance and operations together.</p><div><a className="lp-primary-button" href="mailto:info@ananttattva.com">Talk to our team <ArrowRight/></a><Link className="lp-secondary-button" to="/login">Existing user? Login</Link></div></div></section>
    </main>
    <footer className="lp-footer"><div className="lp-container"><BrandMark/><p>Smarter operations for a more responsible future.</p><div><a href="#solutions">Solutions</a><a href="#customers">Customers</a><a href="mailto:info@ananttattva.com">Contact</a><Link to="/login">CRM Login</Link></div><small>© {new Date().getFullYear()} Anant Tattva Private Limited. All rights reserved.</small></div></footer>
  </div>
}
