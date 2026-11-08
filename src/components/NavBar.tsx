import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import ContactModal from './ContactModal.tsx'
import { CONTACT_LABEL } from './contact.ts'
import './NavBar.css'

type Tab = { to: string; label: string }

/** Pages, next to the name. */
const pages: Tab[] = [
  { to: '/', label: 'Home' },
  { to: '/resume', label: 'Résumé' },
]

/** The two tools, at the right, as buttons. */
const tools: Tab[] = [
  { to: '/satellite-conjunction-screening', label: 'SatPOV' },
  { to: '/shop', label: 'ShopAI' },
]

function Tabs({ tabs, className, linkClass, after }: { tabs: Tab[]; className: string; linkClass: string; after?: ReactNode }) {
  return (
    <ul className={className}>
      {tabs.map(({ to, label }) => (
        <li key={to}>
          <NavLink to={to} end className={({ isActive }) => (isActive ? `${linkClass} is-active` : linkClass)}>
            {label}
          </NavLink>
        </li>
      ))}
      {after}
    </ul>
  )
}

export default function NavBar() {
  const [contactOpen, setContactOpen] = useState(false)
  const contactRef = useRef<HTMLButtonElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  // The header's height (it wraps on narrow windows) as --site-header-height, so scrolled-to elements can leave room under the frozen header.
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const root = document.documentElement
    const set = () => root.style.setProperty('--site-header-height', `${el.offsetHeight}px`)
    set()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--site-header-height')
    }
  }, [])
  const contact = (
    <li>
      <button ref={contactRef} type="button" className="nav-link nav-link-button" aria-haspopup="dialog" onClick={() => setContactOpen(true)}>
        {CONTACT_LABEL}
      </button>
    </li>
  )
  return (
    <header ref={headerRef} className="nav">
      <div className="page-container nav-inner">
        <Link to="/" className="nav-wordmark">
          MAX NORRIS
        </Link>
        <nav className="nav-main" aria-label="Primary">
          <Tabs tabs={pages} className="nav-links" linkClass="nav-link" after={contact} />
          <Tabs tabs={tools} className="nav-tools" linkClass="nav-tool" />
        </nav>
      </div>
      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} returnFocus={contactRef} />}
    </header>
  )
}
