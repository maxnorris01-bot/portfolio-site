import PageHeader from '../components/PageHeader'
import { credits, how, limits, techStack, uiEditor, uiEditorPage } from '../data/uiEditor'
import { usePageMeta } from '../hooks/usePageMeta'
import { useNoIndex } from '../hooks/useNoIndex'
import UiEditorTool from '../ui-editor/UiEditorTool'
import './UiEditor.css'

/** The UI Editor page: a lazy-loaded tool page, mounted only while its flag is on (App.tsx). */
export default function UiEditor() {
  usePageMeta(uiEditor.pageTitle, uiEditor.pageDescription)
  useNoIndex()
  return (
    <main className="page ue-page">
      <div className="page-container is-scaled">
        <PageHeader
          className="has-chips"
          title={uiEditor.name}
          titleMeta={
            <ul className="chip-list page-chips" aria-label="Tech stack">
              {techStack.map((t) => (
                <li key={t} className="chip">
                  {t}
                </li>
              ))}
            </ul>
          }
          lead={uiEditorPage.lead}
          aside={
            uiEditor.repoUrl ? (
              <a href={uiEditor.repoUrl} className="btn btn-secondary ue-github" target="_blank" rel="noreferrer">
                {uiEditorPage.githubLabel}
              </a>
            ) : undefined
          }
          asideSize="narrow"
          fullLead
        >
          <p className="ue-howlink">
            <a href="#ue-how">{uiEditorPage.howLink}</a>
          </p>
        </PageHeader>
        <UiEditorTool />
      </div>

      <div className="page-container is-scaled">
        <section id="ue-how" className="ue-section" aria-labelledby="ue-how-title">
          <h2 id="ue-how-title" className="section-title">
            {how.title}
          </h2>
          <ol className="ue-pipeline">
            {how.steps.map((s, i) => (
              <li key={s.name} className="card ue-step">
                <span className="ue-step-num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.name}</h3>
                <p>{s.detail}</p>
              </li>
            ))}
          </ol>
          <h3 className="ue-subtitle">{how.measuredTitle}</h3>
          <ul className="ue-list">
            {how.measured.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <section id="ue-limits" className="ue-section" aria-labelledby="ue-limits-title">
          <h2 id="ue-limits-title" className="section-title">
            {limits.title}
          </h2>
          <ul className="ue-list">
            {limits.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <section id="ue-credits" className="ue-section" aria-labelledby="ue-credits-title">
          <h2 id="ue-credits-title" className="section-title">
            {credits.title}
          </h2>
          <ul className="ue-list">
            {credits.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
