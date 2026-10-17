import { Link, NavLink, useLocation } from 'react-router-dom'
import './NavBar.css'

const links: { to: string; label: string; short?: string }[] = [
  { to: '/', label: 'Home' },
  { to: '/resume', label: 'Resume' },
  { to: '/satellite-conjunction-screening', label: 'Satellite Point-of-View Tool', short: 'Satellite POV Tool' },
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
            {links.map(({ to, label, short }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end
                  className={({ isActive }) =>
                    isActive ? 'nav-link is-active' : 'nav-link'
                  }
                >
                  {short ? (
                    <>
                      <span className="nav-label-full">{label}</span>
                      <span className="nav-label-short" aria-hidden="true">
                        {short}
                      </span>
                    </>
                  ) : (
                    label
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}
