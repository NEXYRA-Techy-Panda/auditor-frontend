# F2-A evidence — auditor-frontend (Agent A)

Written before commit; commit hashes are returned in the F2-A evidence report.

## Status

Foundation complete, review pending. Independently runnable Next.js app on
port 3001. No backend integration, no features.

## Exact versions (installed, identical in both frontends)

- Node v24.21.0, npm 11.19.0 (system; not changed)
- next 16.3.6, react 19.2.8 / react-dom 19.2.8
- typescript 5.9.3, tailwindcss 4.3.3 (+ @tailwindcss/postcss v4),
  eslint 9.39.5 (+ eslint-config-next 16.3.6), @types/node 20 / react 19
- Node 24 satisfies Next 16 (requires >=20.9). `package-lock.json` committed.

## Files added/changed (F2-A)

- Added: `app/` (layout.tsx title "Energy Auditor", page.tsx foundation
  screen, globals.css, favicon.ico), `public/`, `next.config.ts`,
  `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`,
  `next-env.d.ts`, `package.json`, `package-lock.json`,
  `.env.example` (`NEXT_PUBLIC_AUDITOR_BACKEND_URL=http://localhost:4001`,
  origin only).
- Scaffold generated in an isolated temp dir (its `.git` excluded from copy);
  README/.gitignore merged, not replaced.
- Updated: `README.md` (setup/run docs), `.gitignore`, continuity files.
- Layout uses explicit `ReactNode` props (no dependency on generated
  `LayoutProps` global).

## Setup/run commands (all executed except dev)

```powershell
npm install
npm run verify:contract
npm run typecheck
npm run lint
npm run build
npm run start   # serves production on http://localhost:3001
```

## Results

- Contract verifier: 75 passed, 0 failed (unchanged script).
- Typecheck: clean, exit 0. Lint: 0 errors (1 pre-existing warning in the
  untouched verifier).
- Production build: exit 0, `/` prerendered static.
- HTTP: `GET /` → 200; title "Energy Auditor" and "not implemented yet"
  confirmed in served HTML (`next start -p 3001`, PID 9464, stopped by this
  agent; port free afterwards).
- Browser rendering: NOT inspected — no browser capability. HTTP only.
- Env var origin only; no credentials; no backend request made.

## Processes/ports

- Ran `next start -p 3001` (PID 9464, stopped). Port 3001 free at end.
  Nothing left running. No foreign processes touched.

## Commit/push

Authorised F2-A commit + push to `origin/main` (repo-local identity).
Hashes verified via `ls-remote`; reported in the F2-A evidence report.
Backend repos untouched.
