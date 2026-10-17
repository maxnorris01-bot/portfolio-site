import { Link, NavLink, useLocation } from 'react-router-dom'
import './NavBar.css'

const links = [
  { to: '/', label: 'Home' },
  { to: '/resume', label: 'Resume' },
  { to: '/satellite-conjunction-screening', label: 'Satellite Screening Tool' },
]

/** The route whose header matches the wide tool layout. */
export const WIDE_PATH = '/satellite-conjunction-screening'

export default function NavBar() {
  // The satellite tool page is wider than the others: its header uses the same gutters and cap as the tool, so the wordmark and nav line up with its content.
  const wide = useLocation().pathname === WIDE_PATH
  return (
    <header className="nav">
      <div className={wide ? 'container nav-inner is-wide' : 'container nav-inner'}>
        <Link to="/" className="nav-wordmark">
          MAX NORRIS
        </Link>
        <nav aria-label="Primary">
          <ul className="nav-links">
            {links.map(({ to, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end
                  className={({ isActive }) =>
                    isActive ? 'nav-link is-active' : 'nav-link'
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}
