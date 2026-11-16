import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { labels, sampleDescriptions } from '../data/uiEditor'
import { MINI, miniatureScale } from './miniature'
import { SAMPLES, type SampleId } from './samples'
import { createModel, previewSource } from './vendor/engine.js'

const IDS = Object.keys(SAMPLES) as SampleId[]

/** A live miniature of a sample: the engine's own preview source (a linked stylesheet is inlined), in a frame with scripts off that cannot be clicked. */
function Miniature({ id }: { id: SampleId }) {
  const frame = useRef<HTMLDivElement>(null)
  const doc = SAMPLES[id]
  const source = useMemo(() => previewSource(createModel(doc.source, doc.kind, doc.companions, doc.file)), [doc])
  // An SVG is shown as a document of its own, as the editor's preview does (the HTML parser would lay an inline svg out differently).
  const iframe = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    if (doc.kind !== 'svg' || !iframe.current) return
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }))
    iframe.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [doc, source])
  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const fit = () => el.style.setProperty('--ue-mini-scale', String(miniatureScale(el.clientWidth)))
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={frame} className="ue-mini" aria-hidden="true">
      <iframe
        ref={iframe}
        data-miniature
        title={labels.samples[id]}
        sandbox="allow-same-origin"
        loading="lazy"
        tabIndex={-1}
        width={MINI.width}
        height={MINI.height}
        srcDoc={doc.kind === 'svg' ? undefined : source}
      />
    </div>
  )
}

interface Props {
  /** Over the open document's stage (the Samples button), not in the place of an empty page. */
  overlay: boolean
  onPick: (id: SampleId) => void
  onClose: () => void
}

/** The samples as cards, like templates: a live miniature, the title and one line. A click or Enter opens the sample. */
export default function Gallery({ overlay, onPick, onClose }: Props) {
  const onKey = (e: KeyboardEvent<HTMLElement>, id: SampleId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick(id)
    }
  }
  return (
    <section data-gallery className={`ue-gallery${overlay ? ' is-overlay' : ''}`} aria-label={labels.gallery} onKeyDown={(e) => e.key === 'Escape' && overlay && onClose()}>
      <p className="ue-hint">{labels.galleryHint}</p>
      <div className="ue-cards">
        {IDS.map((id) => (
          <div key={id} data-sample-card={id} className="ue-card" role="button" tabIndex={0} aria-labelledby={`ue-card-t-${id}`} aria-describedby={`ue-card-d-${id}`} onClick={() => onPick(id)} onKeyDown={(e) => onKey(e, id)}>
            <Miniature id={id} />
            <h3 id={`ue-card-t-${id}`} className="ue-card-title">
              {labels.samples[id]}
            </h3>
            <p id={`ue-card-d-${id}`} className="ue-card-desc">
              {sampleDescriptions[id]}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
