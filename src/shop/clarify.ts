// The clarifying questions' state (stage Q2): what the server last said, and what the visitor has chosen on this page.
// Pure functions, so the reducer, the answer list and the panel's mode are tested without a browser.
import type { Clarify, ClarifyAnswer, ClarifyQuestion } from './types.ts'

export const NO_PREFERENCE = 'no_preference'

/** Why the panel says something quiet: the questions closed under it, the post failed (retry or ignore), or the server stopped taking posts. */
export type ClarifyNote = 'closed' | 'failed' | 'limit' | null

export type ClarifyUi = {
  /** The server's latest clarify object (from a poll or an answers response). */
  server: Clarify
  /** Question id to the chosen option value. null: cleared here. Absent: not touched here (the server's answer, if any, shows). */
  selected: Record<string, string | null>
  /** "Show results" was pressed (or the server says it was). */
  submitted: boolean
  note: ClarifyNote
}

export type ClarifyAction =
  | { type: 'server'; clarify: Clarify }
  | { type: 'select'; id: string; value: string | null }
  | { type: 'submitted'; value: boolean }
  | { type: 'note'; note: ClarifyNote }

export function clarifyReduce(ui: ClarifyUi | null, action: ClarifyAction): ClarifyUi | null {
  switch (action.type) {
    case 'server': {
      const c = action.clarify
      return { server: c, selected: ui?.selected ?? {}, submitted: (ui?.submitted ?? false) || c.submitted, note: ui?.note ?? null }
    }
    case 'select':
      return ui ? { ...ui, selected: { ...ui.selected, [action.id]: action.value } } : ui
    case 'submitted':
      return ui ? { ...ui, submitted: action.value } : ui
    case 'note':
      return ui ? { ...ui, note: action.note } : ui
  }
}

/** The option value chosen for a question: this page's choice, else what the server holds, else none. */
export function chosen(ui: ClarifyUi, questionId: string): string | null {
  if (questionId in ui.selected) return ui.selected[questionId]
  return ui.server.answers.find((a) => a.question_id === questionId)?.option_value ?? null
}

/** The panel is shown only for questions the server is holding the search for. */
export function panelVisible(ui: ClarifyUi | null | undefined): ui is ClarifyUi {
  return !!ui && ui.server.state === 'ready' && ui.server.questions.length > 0
}

/** Tiles are disabled once the answers are final: applied, submitted, or the server said the questions closed. */
export function panelLocked(ui: ClarifyUi): boolean {
  return ui.server.applied || ui.submitted || ui.note === 'closed'
}

/**
 * The answers to post: every question with a choice. A question cleared here that the server has an answer for goes as "no_preference"
 * (the server keeps the last answer, so this is how it is taken back); a cleared question it never had is left out.
 */
export function answersToPost(ui: ClarifyUi, posted: ReadonlySet<string>): ClarifyAnswer[] {
  const out: ClarifyAnswer[] = []
  for (const q of ui.server.questions) {
    const value = chosen(ui, q.id)
    if (value !== null) out.push({ question_id: q.id, option_value: value })
    else if (posted.has(q.id) || ui.server.answers.some((a) => a.question_id === q.id)) out.push({ question_id: q.id, option_value: NO_PREFERENCE })
  }
  return out
}

/** Whether an option is expected to get a picture: while the server is still checking pictures, every option might; afterwards only those with a URL. */
export function expectsPicture(clarify: Clarify, picture: string | null): boolean {
  return picture !== null || clarify.pictures_state === 'pending'
}

/** The one option tile's identity, for keys and ids. */
export const optionKey = (q: ClarifyQuestion, value: string) => `${q.id}:${value}`

/** Whether any question has a tile that is a picture or may become one (the panel reserves picture areas only then). */
export function anyPicture(clarify: Clarify): boolean {
  return clarify.questions.some((q) => q.options.some((o) => expectsPicture(clarify, o.picture_url)))
}
