import { Link, NavLink } from 'react-router-dom'
import './NavBar.css'

const links = [
  { to: '/', label: 'Home' },
  { to: '/resume', label: 'Resume' },
  { to: '/satellite-conjunction-screening', label: 'Satellite Screening Tool' },
]

export default function NavBar() {
  return (
    <header className="nav">
      <div className="container nav-inner">
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
