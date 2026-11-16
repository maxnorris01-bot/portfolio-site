import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react'
import { codeView as C, labels } from '../data/uiEditor'
import { changeOfLine, counterText, diffHunks, linesOf, stepChange, tickShare } from './diff'

export interface CodeViewHandle {
  /** The code box (for selecting its text by hand when the clipboard is not available). */
  box: () => HTMLElement | null
}

interface Props {
  file: string
  /** The updated file, as exported: the text is shown whole, line by line, and Copy and Download give exactly this. */
  text: string
  /** The file as it was opened: the lines that differ from it are marked. */
  original: string
}

/**
 * The updated code, the whole file, with the lines that changed or were added against the original tinted AND marked with a "+" in the left margin
 * (not colour alone); where lines were removed a thin marker sits between the lines. Previous and Next change walk the changes (wrapping round),
 * scroll to the change and flash it; a narrow change map beside the code has one tick per change, placed in proportion to its line number.
 * Plain: nothing in here is part of the text (the gutter, markers and ticks are not selectable), so selecting the code by hand copies the file.
 */
const CodeView = forwardRef<CodeViewHandle, Props>(function CodeView({ file, text, original }, ref) {
  const box = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => ({ box: () => box.current }), [])
  const [visited, setVisited] = useState(0)
  const [flash, setFlash] = useState(0)
  const flashTimer = useRef(0)
  const lines = useMemo(() => linesOf(text), [text])
  const hunks = useMemo(() => diffHunks(original, text), [original, text])
  const count = hunks.length
  const current = Math.min(visited, count)

  const jump = (k: number) => {
    if (k < 1 || k > count) return
    setVisited(k)
    const el = box.current?.querySelector<HTMLElement>(`[data-line][data-change="${k}"]`) ?? box.current?.querySelector<HTMLElement>(`[data-removed][data-change="${k}"]`)
    const b = box.current
    if (el && b) b.scrollTo({ top: Math.max(0, el.offsetTop - b.clientHeight / 2 + el.offsetHeight / 2), behavior: 'auto' })
    setFlash(k)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(0), 1400)
  }

  const rows: ReactNode[] = []
  lines.forEach((t, i) => {
    const n = i + 1
    hunks.forEach((h, idx) => {
      if (h.removed > 0 && h.after === n - 1) rows.push(<Removed key={`r${idx}`} after={h.after} change={idx + 1} count={h.removed} />)
    })
    const k = changeOfLine(hunks, n)
    rows.push(
      <div key={n} className={`ue-line${k !== null && flash === k ? ' is-flash' : ''}`} data-line={n} data-change={k ?? undefined}>
        <span className="ue-gut" aria-hidden="true">
          {n}
        </span>
        <span className="ue-mk" aria-hidden="true" {...(k !== null ? { 'data-margin-marker': '', title: C.changedLine } : {})}>
          {k !== null ? '+' : ''}
        </span>
        <span className="ue-ct" data-code-text>
          {t}
        </span>
      </div>,
    )
  })
  // Lines removed after the last line.
  hunks.forEach((h, idx) => {
    if (h.removed > 0 && h.after >= lines.length) rows.push(<Removed key={`r${idx}`} after={h.after} change={idx + 1} count={h.removed} />)
  })

  return (
    <div className="ue-codeview">
      <div className="ue-changes">
        <button type="button" className="btn btn-secondary" disabled={count === 0} onClick={() => jump(stepChange(current, count, -1))}>
          {C.previous}
        </button>
        <button type="button" className="btn btn-secondary" disabled={count === 0} onClick={() => jump(stepChange(current, count, 1))}>
          {C.next}
        </button>
        <span className="ue-counter" data-change-counter aria-live="polite">
          {counterText(current, count)}
        </span>
      </div>
      <div className="ue-codebody">
        <div ref={box} className="ue-codebox" data-code-view tabIndex={0} role="region" aria-label={`${labels.code}: ${file}`}>
          {rows}
        </div>
        <div className="ue-map" data-change-map>
          {hunks.map((h, idx) => (
            <button key={idx} type="button" className={`ue-tick${current === idx + 1 ? ' is-current' : ''}`} style={{ top: `${tickShare(h, lines.length) * 100}%` }} aria-label={C.tick(idx + 1, count)} title={C.tick(idx + 1, count)} onClick={() => jump(idx + 1)} />
          ))}
        </div>
      </div>
    </div>
  )
})

/** A thin marker between two lines where lines of the original were removed (they are not shown as text). */
function Removed({ after, change, count }: { after: number; change: number; count: number }) {
  const label = C.removed(count)
  return (
    <div className="ue-removed" data-removed data-removed-after={after} data-change={change} role="img" aria-label={label} title={label}>
      <span className="ue-rm" aria-hidden="true">
        −
      </span>
    </div>
  )
}

export default CodeView
