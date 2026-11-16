// The three samples as text, for the page. The gate reads the same files from this folder (manifest.ts says which files make up each one).
import chartSvg from './chart.svg?raw'
import emailHtml from './email.html?raw'
import landingCss from './landing.css?raw'
import landingHtml from './landing.html?raw'
import type { Doc } from '../intake.ts'
import { SAMPLE_FILES, type SampleId } from './manifest.ts'

const TEXT: Record<string, string> = {
  'landing.html': landingHtml,
  'landing.css': landingCss,
  'email.html': emailHtml,
  'chart.svg': chartSvg,
}

export const SAMPLES: Record<SampleId, Doc> = Object.fromEntries(
  SAMPLE_FILES.map((s) => [
    s.id,
    { name: s.file, kind: s.kind, file: s.file, source: TEXT[s.file], companions: Object.fromEntries(s.companions.map((c) => [c, TEXT[c]])) } satisfies Doc,
  ]),
) as Record<SampleId, Doc>

export { SAMPLE_FILES, type SampleId }
