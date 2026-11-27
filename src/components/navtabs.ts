import { uiEditor } from '../data/uiEditor.ts'

export type Tab = { to: string; label: string }

/** The tool buttons, with the UI Editor added as the last one. */
export const withUiEditor = (tools: Tab[]): Tab[] => [...tools, { to: uiEditor.route, label: uiEditor.name }]
