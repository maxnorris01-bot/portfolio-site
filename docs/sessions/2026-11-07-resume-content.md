# Résumé page: real content (2026-11-07)

Branch: feat/resume-content (not pushed).

- `src/pages/Resume.tsx`: placeholder content replaced with the real résumé data (typed consts at the top). Added a Profile section, moved Applied AI Projects above Experience, projects now show a meta line, bullets and an optional link. Rail gained Links, Tools and the two education lines. Page title and description set with `usePageMeta` ("Résumé — Max Norris").
- `src/pages/Resume.css`: removed the project-card and the 1280px two-column main rules (projects with bullets need the full width); added small rules for profile, links and tools heading. Tokens only.
- `public/Max_Norris_Resume.pdf`: copy of the downloadable résumé (PDF not edited). The Download PDF button points at it with `download`.

Checks: `tsc`, `eslint`, `build` clean. Headless screenshots of /resume at 1440x900 and 390x844: no horizontal overflow. No check:layout sweep, as asked.
