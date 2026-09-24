# auditor-frontend

Auditor user interface for the NEXYRA commercial-building energy simulation
and auditing project.

- **Role**: Next.js + React + TypeScript + Tailwind + charts app for CSV/JSON
  upload, analytics, forecasts, comparison, and printable monthly report.
  Calls `auditor-backend` only.
- **Owner**: Mohan.
- **Local port (proposed)**: `3001`. Backend: `http://localhost:4001`.
- **State at F0 (2026-09-24)**: empty repository — documentation only, no code.
  See `docs/HANDOFF.md` for verified state.

Docs:

- [Project context](docs/PROJECT_CONTEXT.md)
- [Workspace map](docs/WORKSPACE_MAP.md)
- [Handoff](docs/HANDOFF.md)
- [Agent start prompt](docs/AGENT_START_PROMPT.md)
- [Active task](docs/ACTIVE_TASK.md)
- [Progress log](docs/PROGRESS_LOG.md)
- [F1 evidence](docs/F1_EVIDENCE.md)
- [Data contract v1](contracts/v1/CONTRACT.md)
- [Service interfaces](contracts/v1/API.md)
- [F2-A evidence](docs/F2_A_EVIDENCE.md)

## Developer setup (F2-A foundation)

Stack: Next.js 16.3.6, React 19.2.8, TypeScript, Tailwind v4, npm.
Requires Node >=20.9 (verified on Node v24.21.0).

```powershell
npm install          # install dependencies
npm run dev          # develop on http://localhost:3001
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (0 errors)
npm run test         # node:test adapter checks (18/18)
npm run verify:contract  # dependency-free contract checks (75/75)
npm run build        # production build
npm run start        # serve production on http://localhost:3001
```

Configuration: copy `.env.example` to `.env` if needed (real `.env` files
stay ignored). `NEXT_PUBLIC_AUDITOR_BACKEND_URL` holds the backend origin
only; full contract route paths (e.g. `/api/v1/health`) are used separately.
No backend requests are made in F2-A; integration belongs to F4.
