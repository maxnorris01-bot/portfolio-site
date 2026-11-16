// The three samples that ship with the UI Editor: which files make up each one. The page loads the text (index.ts, with `?raw`
// imports) and the gate (scripts/ui-editor-gate) reads the same files from this folder. Original text, written for this tool.

export type SampleId = 'landing' | 'email' | 'chart'

export type SampleFiles = {
  id: SampleId
  kind: 'html' | 'svg'
  /** The primary file. */
  file: string
  /** Companion stylesheets the primary file links to, by the href it uses. */
  companions: string[]
}

export const SAMPLE_FILES: SampleFiles[] = [
  { id: 'landing', kind: 'html', file: 'landing.html', companions: ['landing.css'] },
  { id: 'email', kind: 'html', file: 'email.html', companions: [] },
  { id: 'chart', kind: 'svg', file: 'chart.svg', companions: [] },
]
