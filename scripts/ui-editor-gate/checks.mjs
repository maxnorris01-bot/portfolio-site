// The pure parts of the UI Editor gate: line diffs, the P2 and P3 comparisons over element dumps, and the outcome of one action.
// Rules: docs/ui-editor-gate-rules.md. Nothing here knows about the page or the engine.

/** Lines removed and added between two texts (common head and tail kept, the middle compared as a multiset-friendly LCS). */
export function diffLines(a, b) {
  const x = a.split('\n'), y = b.split('\n')
  let p = 0
  while (p < x.length && p < y.length && x[p] === y[p]) p++
  let s = 0
  while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++
  const m = x.slice(p, x.length - s), n = y.slice(p, y.length - s)
  // Longest common subsequence of the middle, so a moved block shows as removed plus added lines and an unchanged line in between does not.
  const L = Array.from({ length: m.length + 1 }, () => new Array(n.length + 1).fill(0))
  for (let i = m.length - 1; i >= 0; i--) for (let j = n.length - 1; j >= 0; j--) L[i][j] = m[i] === n[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const removed = [], added = []
  let i = 0, j = 0
  while (i < m.length && j < n.length) {
    if (m[i] === n[j]) { i++; j++ } else if (L[i + 1][j] >= L[i][j + 1]) removed.push(m[i++])
    else added.push(n[j++])
  }
  while (i < m.length) removed.push(m[i++])
  while (j < n.length) added.push(n[j++])
  return { removed, added }
}

/** Whether two line lists hold the same lines (a pure permutation). */
export const sameShape = (a, b) => a.length === b.length && [...a].sort().every((l, i) => l === [...b].sort()[i])

const LAYOUT = new Set(['width', 'height', 'inline-size', 'block-size', 'perspective-origin', 'transform-origin'])
const nums = (s) => (String(s).match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) ?? []).map(Number)
const shape = (s) => String(s).replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi, '#')
/** Equal, or the same text with every number within `tol`. */
const close = (a, b, tol) => a === b || (shape(a) === shape(b) && nums(a).every((v, i) => Math.abs(v - nums(b)[i]) <= tol))
const rectDiff = (a, b, tol = 1) => a.some((v, i) => Math.abs(v - b[i]) > tol)

/** P2: the preview's dump against the fresh page's dump of the exported files. Returns the violations. */
export function p2Violations(preview, fresh) {
  const out = []
  if (preview.length !== fresh.length) return [`${preview.length} elements in the preview, ${fresh.length} in the exported page`]
  for (let i = 0; i < preview.length; i++) {
    const a = preview[i], b = fresh[i]
    const sheetSwap = (a.tag === 'style' && b.tag === 'link') || (a.tag === 'link' && b.tag === 'style')
    if (a.tag !== b.tag && !sheetSwap) { out.push(`element ${i}: <${a.tag}> against <${b.tag}>`); continue }
    if (sheetSwap) continue
    if (rectDiff(a.rect, b.rect)) out.push(`${a.key} box [${a.rect.map((v) => v.toFixed(1))}] against [${b.rect.map((v) => v.toFixed(1))}]`)
    for (const k of Object.keys(a.props)) {
      const same = LAYOUT.has(k) ? close(a.props[k], b.props[k], 1) : a.props[k] === b.props[k]
      if (!same) { out.push(`${a.key} ${k}: ${a.props[k]} against ${b.props[k]}`); break }
    }
  }
  return out
}

/** P3: nothing else changed. `before` and `after` are dumps of the same document at one width. */
export function p3Violations(before, after, { targetKey, class: cls, pair }) {
  const out = []
  let b = before, a = after
  // Pair by index, or by key when the document order changed (a reorder).
  if (pair === 'key') {
    const byKey = new Map(after.map((r) => [r.key, r]))
    if (byKey.size !== after.length) return ['element keys are not unique']
    a = before.map((r) => byKey.get(r.key))
    if (a.some((r) => !r)) return ['an element of the original has no counterpart after the action']
    if (after.length !== before.length) return [`${before.length} elements before, ${after.length} after`]
  } else if (before.length !== after.length) return [`${before.length} elements before, ${after.length} after`]
  const idxOf = b.findIndex((r) => r.key === targetKey)
  if (idxOf < 0) return [`target ${targetKey} not found`]
  const kids = (i) => b.filter((r) => r.parent === i).map((r) => r.i)
  const parentOf = (i) => b[i].parent
  const descendants = new Set()
  const down = (i) => { for (const k of kids(i)) { descendants.add(k); down(k) } }
  down(idxOf)
  const ancestors = []
  for (let p = parentOf(idxOf); p >= 0; p = parentOf(p)) ancestors.push(p)
  const allIn = (set, i) => { set.add(i); for (const k of kids(i)) allIn(set, k) }
  const layoutOnly = new Set() // elements that may differ in box and layout-resolved properties
  const boxOnly = new Set()
  const followingOf = (i) => { const par = parentOf(i); if (par < 0) return []; const sibs = kids(par); return sibs.slice(sibs.indexOf(i) + 1) }
  const precedingOf = (i) => { const par = parentOf(i); if (par < 0) return []; const sibs = kids(par); return sibs.slice(0, sibs.indexOf(i)) }
  const displayOf = (i) => b[i].props.display ?? ''
  if (cls === 'flow' || cls === 'reorder') {
    for (const an of ancestors) layoutOnly.add(an)
    for (const i of [idxOf, ...ancestors]) for (const f of followingOf(i)) allIn(layoutOnly, f)
    if (cls === 'reorder') {
      const par = parentOf(idxOf)
      if (par >= 0) for (const c of kids(par)) allIn(layoutOnly, c)
    }
    // Amendment 1: preceding siblings in a table row or a flex or grid container.
    for (const i of [idxOf, ...ancestors]) {
      const par = parentOf(i)
      if (par < 0) continue
      const d = displayOf(par)
      if (b[par].tag === 'tr' || /^(inline-)?(flex|grid)$/.test(d)) for (const s of precedingOf(i)) allIn(layoutOnly, s)
    }
  }
  if (cls === 'svg-ancestors') for (const an of ancestors) boxOnly.add(an)
  for (let i = 0; i < b.length; i++) {
    if (cls !== 'none' && i === idxOf) continue
    if (descendants.has(i) && cls !== 'none') continue
    const x = b[i], y = a[i]
    const boxChanged = rectDiff(x.rect, y.rect)
    const changed = Object.keys(x.props).filter((k) => !close(x.props[k], y.props[k], 1) || (x.props[k] !== y.props[k] && !LAYOUT.has(k)))
    const onlyLayout = changed.every((k) => LAYOUT.has(k))
    if (layoutOnly.has(i) && onlyLayout) continue
    if (boxOnly.has(i) && changed.length === 0) continue
    if (!boxChanged && changed.length === 0) continue
    out.push(`${x.key}: ${boxChanged ? 'box moved or resized' : ''}${boxChanged && changed.length ? ', ' : ''}${changed.slice(0, 3).map((k) => `${k} ${x.props[k]} -> ${y.props[k]}`).join('; ')}`)
    if (out.length >= 8) break
  }
  return out
}

/** The outcome of one action from its recorded checks. */
export function outcomeOf(r) {
  if (r.notes.length || r.setup.some((c) => !c.ok)) return 'FAIL'
  const allOk = [...r.P1, ...r.P5].every((c) => c.ok) && r.P2?.ok && r.P3?.ok && r.P4?.ok
  if (!allOk) return 'FAIL'
  return r.expected === 'REFUSED' ? 'REFUSED' : 'PASS'
}
