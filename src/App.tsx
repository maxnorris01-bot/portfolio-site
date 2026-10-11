import { useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import NavBar from './components/NavBar'
import Home from './pages/Home'
import Resume from './pages/Resume'
import SatelliteTool from './pages/SatelliteTool'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function NotFound() {
  return (
    <main className="page container">
      <h1 className="section-title">Page not found</h1>
      <Link to="/" className="btn btn-secondary">
        Back home
      </Link>
    </main>
  )
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/resume" element={<Resume />} />
        <Route path="/satellite-conjunction-screening" element={<SatelliteTool />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <footer className="site-footer container">
        <p>
          Build {__BUILD_COMMIT__}
          {__BUILD_ENV__ !== 'production' ? ` (${__BUILD_ENV__})` : ''}
        </p>
      </footer>
    </>
  )
}
