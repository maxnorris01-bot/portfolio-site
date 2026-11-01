import { Link, NavLink } from 'react-router-dom'
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

function Tabs({ tabs, className, linkClass }: { tabs: Tab[]; className: string; linkClass: string }) {
  return (
    <ul className={className}>
      {tabs.map(({ to, label }) => (
        <li key={to}>
          <NavLink to={to} end className={({ isActive }) => (isActive ? `${linkClass} is-active` : linkClass)}>
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

export default function NavBar() {
  return (
    <header className="nav">
      <div className="page-container nav-inner">
        <Link to="/" className="nav-wordmark">
          MAX NORRIS
        </Link>
        <nav className="nav-main" aria-label="Primary">
          <Tabs tabs={pages} className="nav-links" linkClass="nav-link" />
          <Tabs tabs={tools} className="nav-tools" linkClass="nav-tool" />
        </nav>
      </div>
    </header>
  )
}
