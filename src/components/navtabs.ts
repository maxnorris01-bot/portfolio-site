import { uiEditor } from '../data/uiEditor.ts'

export type Tab = { to: string; label: string }

/** The tool buttons, with the UI Editor added as the last one only when its flag is on (the nav is exactly as before with it off). */
export const withUiEditor = (tools: Tab[], uiEditorOn: boolean): Tab[] => (uiEditorOn ? [...tools, { to: uiEditor.route, label: uiEditor.name }] : tools)
