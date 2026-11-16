import { Suspense, lazy, useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import NavBar from './components/NavBar'
import PageHeader from './components/PageHeader'
import { uiEditor } from './data/uiEditor'
import { UI_EDITOR_ON } from './data/uiEditorFlag'
import Home from './pages/Home'
import Resume from './pages/Resume'
import SatelliteTool from './pages/SatelliteTool'

// Unlisted for now: not in the nav yet.
const Shop = lazy(() => import('./pages/Shop'))

// Behind a build-time flag (src/data/uiEditorFlag.ts): with it off there is no route (the NotFound page shows) and the page's chunk is never requested.
const UiEditor = UI_EDITOR_ON ? lazy(() => import('./pages/UiEditor')) : null

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function NotFound() {
  return (
    <main className="page">
      <div className="page-container is-scaled">
        <PageHeader title="Page not found">
          <Link to="/" className="btn btn-secondary not-found-back">
            Back home
          </Link>
        </PageHeader>
      </div>
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
        <Route
          path="/shop"
          element={
            <Suspense fallback={null}>
              <Shop />
            </Suspense>
          }
        />
        {UiEditor && (
          <Route
            path={uiEditor.route}
            element={
              <Suspense fallback={null}>
                <UiEditor />
              </Suspense>
            }
          />
        )}
        <Route path="*" element={<NotFound />} />
      </Routes>
      <footer className="site-footer page-container">
        <p>
          Build {__BUILD_COMMIT__}
          {__BUILD_ENV__ !== 'production' ? ` (${__BUILD_ENV__})` : ''}
        </p>
      </footer>
    </>
  )
}
