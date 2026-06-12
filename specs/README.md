# Open BamZ — Technical Specification

This folder contains a reverse-engineered technical specification of **Open BamZ**, an
open-source platform that is **both an application runtime and a plugin manager**. Users
create applications, activate plugins, and write their application code; the platform
serves those applications and exposes a GraphQL API for each one.

All documents are grounded in the actual source code (`src/`) with `file:line`
references, and distinguish observed facts from inferences.

## Documents

| Document | Read it to… |
|----------|-------------|
| [`openbamz_reverse_spec.md`](./openbamz_reverse_spec.md) | Understand the whole system: tech stack, architecture, the two-database model, the event-driven control plane, EARS-format requirements, non-functional behavior, environment variables, uncertainties, and recommendations. |
| [`openbamz_application_guide.md`](./openbamz_application_guide.md) | Build an **application** on Open BamZ: create the app, model the database, write front-end files, use the GraphQL API and BamZ runtime, and activate plugins. |
| [`openbamz_plugin_guide.md`](./openbamz_plugin_guide.md) | Build a **plugin**: the `prepareDatabase` / `cleanDatabase` / `initPlugin` contract, routers, front-end libs, background tasks, inter-plugin extension slots, and a complete working example. |

## 30-second mental model

- **Core platform** (`src/`) does four things: manage accounts, create/delete
  applications (DB + directory), expose per-app GraphQL via PostGraphile, and serve app
  files with a runtime + plugins injected. Everything else is a plugin.
- **Main database** (`_openbamz`) holds `private.account`, `private.session`, and
  `public.app`. **Each application** gets its own database (schemas `public`, `openbamz`,
  plus plugin schemas) and its own file directory under `$DATA_DIR/apps/<code>/public`.
- **Control plane is event-driven:** PostgreSQL `plv8` triggers enqueue `graphile-worker`
  jobs (`createDatabase`, `dropDatabase`, `addPlugin`, `removePlugin`,
  `updateHostnameCache`, `runPluginTask`) that the Node.js layer executes.
- **Auth** is JWT (RS256) in HttpOnly cookies; **authorization** is enforced by
  PostgreSQL roles and Row-Level Security, with the request's DB role derived from the
  JWT.

## Source of truth

- Code: `src/` (entry point `src/index.js`).
- Hand-written developer docs (predating this spec): `doc/README.md`.
- Example application: `apps/mypoolexpert/`.
- Deployment: `Dockerfile`, `Dockerfile_pgsql`, `Dockerfile_ssh`, `docker-compose.yml`,
  `.devcontainer/`.
