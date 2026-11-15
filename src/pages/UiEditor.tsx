import PageHeader from '../components/PageHeader'
import { uiEditor } from '../data/uiEditor'
import { usePageMeta } from '../hooks/usePageMeta'
import { useNoIndex } from '../hooks/useNoIndex'

/** The UI Editor page: a lazy-loaded tool page, mounted only while its flag is on (App.tsx). */
export default function UiEditor() {
  usePageMeta(uiEditor.pageTitle, uiEditor.pageDescription)
  useNoIndex()
  return (
    <main className="page">
      <div className="page-container is-scaled">
        <PageHeader title={uiEditor.name} lead={uiEditor.pageDescription} />
      </div>
    </main>
  )
}
