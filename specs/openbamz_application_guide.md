# Building Applications on Open BamZ

This guide explains, from the codebase, how an **application** is structured on Open BamZ
and how to build one. It is grounded in the platform source (`src/`) and the bundled
example app (`apps/mypoolexpert`).

---

## 1. What an application is

An Open BamZ application is the combination of (`doc/README.md:24-33`):

1. **A dedicated PostgreSQL database** — named after the application `code`.
2. **A file directory** — `"$DATA_DIR/apps/<code>/public"` — holding the application's
   **front-end source** (HTML/CSS/JS/assets). Server-side logic lives in the database
   (functions/triggers) or in plugins, *not* in this directory
   (`doc/README.md:35-43`).

You never write a Node.js server for an application. You write:

- **Front-end files** served statically (with BamZ runtime auto-injected).
- **Database objects** (tables, functions, triggers) that PostGraphile turns into a
  GraphQL API automatically.
- Optionally, you **activate plugins** that add capabilities.

---

## 2. Creating an application

### 2.1 Prerequisites: have an account

To create an application you need a user account in `private.account`
(`doc/README.md:18-22`). Accounts are created through the platform UI
(`src/open-bamz-front/views/create_account/`) which calls the in-database function
`public.create_account(email, name, password)` (`src/database/_openbamz.sql:173-197`).

### 2.2 Create the app record (this triggers everything)

Applications are created by inserting a row into `public.app`. The simplest path is the
helper function, which sanitizes and de-duplicates the code:

```sql
SELECT * FROM public.create_application('My Pool Expert');
-- returns the created app row, code e.g. 'my_pool_expert'
```

Evidence: `public.create_application` at `src/database/_openbamz.sql:281-297`. The UI does
this via GraphQL from `src/open-bamz-front/views/create_app/`.

**What happens automatically** when the row is inserted (all via `plv8` triggers →
`graphile-worker`):

1. `app_create_database` trigger forces `owner = current_user`, validates the code is not
   reserved, and enqueues the `createDatabase` job. — `src/database/_openbamz.sql:300-331`
2. `createDatabase` task: creates the database, applies `init_base.sql`, creates the
   owner's admin role grant, prepares privileges, and creates
   `apps/<code>/public/index.html`. — `src/database/tasks/createDatabase.js`,
   `src/database/init.js:567-583`
3. `app_update_admins` / `app_update_permissions` triggers resolve admin emails to account
   ids and grant/revoke the `<code>_admin` role. — `src/database/_openbamz.sql:335-403`
4. `updateHostnameCache` keeps the hostname→app routing map current. —
   `src/database/tasks/updateHostnameCache.js`

> The application `code` becomes the **database name**, the **directory name**, and the
> **GraphQL path segment** (`/graphql/<code>`). Codes are normalized to
> `^[a-z][a-z0-9_]*$` and a numeric suffix is appended on collision
> (`src/database/_openbamz.sql:286-292`).

### 2.3 Reach the application

The platform resolves which app a request targets in this order
(`src/index.js:229-291`):

1. **Hostname** — if a host is registered in `app.hosts` (`[{ "hostname": "..." }]`).
2. **`app-name` HTTP header.**
3. **`?appName=` query parameter.**
4. Default to the platform app (`DB_NAME`).

To bind a custom domain, set `app.hosts`:

```sql
UPDATE public.app
SET hosts = '[{"hostname":"mypoolexpert.example.com"}]'::jsonb
WHERE code = 'mypoolexpert';
```

---

## 3. The database side of an application

Each app database starts with (`src/database/init_base.sql`):

- Extensions: `plv8`, `pgcrypto`, `http`, `citext`.
- Custom domains: `email`, `phone`, `color`, `multiline`, `html` (use these as column
  types for richer admin tooling). — `src/database/init_base.sql:9-56`
- Schema `openbamz` with the `plugins` table and helper functions
  (`run_transaction`, `list_schema_and_tables`). — `src/database/init_base.sql:58-324`
- Schema `public` for **your** tables.

### 3.1 Add your tables

Create tables in `public`; PostGraphile exposes them automatically through
`/graphql/<code>`:

```sql
CREATE TABLE public.pool (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name      text NOT NULL,
    volume_m3 numeric,
    owner_email email          -- custom domain from init_base.sql
);
```

A new table is picked up because PostGraphile runs in **watch mode**
(`src/database/graphileConfig.js:132`) and the exposed schemas are `public` + `openbamz`
(+ plugin schemas) (`src/database/graphql.js:120-139`).

### 3.2 Server-side logic = database functions/triggers

To run server-side code, write PostgreSQL functions (in `plpgsql` or JavaScript via
`plv8`) and triggers (`doc/README.md:38-43`). Examples of this pattern are throughout
`_openbamz.sql` and `init_base.sql`. Functions you expose in `public`/`openbamz` become
GraphQL mutations/queries.

To run **asynchronous** server work, enqueue a graphile-worker job from SQL:

```sql
SELECT graphile_worker.add_job('runPluginTask',
  json_build_object('plugin','myplugin','task','tasks/do.mjs','params', json_build_object('id', NEW.id)));
```

— pattern documented in `src/database/tasks/runPluginTask.js:6-13`.

### 3.3 Access control

Access is enforced by PostgreSQL roles. Every request runs under a role derived from the
JWT (`src/database/graphileConfig.js:150-193`):

- Anonymous requests → role `anonymous`.
- Logged-in users → their account-UUID role, which has been granted `<code>_admin`,
  `<code>_user`, or `<code>_readonly` as appropriate.

Default schema grants (`doc/README.md:55-75`, `src/database/init.js:441-502`):

| Schema | `_admin` | `_user` | `_readonly` |
|--------|----------|---------|-------------|
| `public` | full | read/write + execute | read + execute |
| `openbamz` | full | execute only | execute only |

Use **Row-Level Security** for per-record rules (the platform itself does this for
`public.app`, `src/database/_openbamz.sql:259-278`).

---

## 4. The front-end side of an application

### 4.1 Directory layout

Front-end files live in `apps/<code>/public/`. A freshly created app gets a minimal
`index.html` (`src/database/init.js:573-582`). You then add your own HTML/CSS/JS/assets.

The example app (`apps/mypoolexpert/public/`) shows a realistic layout:

```
public/
  index.html
  viewz.config.json        # client-side routing config (the "viewz" framework)
  manifest.json            # PWA manifest
  sw-template.js           # service worker template (PWA)
  bayrol-style.css
  extensions/              # custom field types & UI widgets (mjs/js)
  images/ , pwa-icons/
  database/schema-bamz.sql # the app's SQL schema kept under source control
```

### 4.2 The injected BamZ runtime

When any `*.html` (or `/`) is served, the platform injects a script block
(`src/index.js:353-430`, `src/utils.js:13-88`) that:

- Sets `window.BAMZ_APP = '<code>'`.
- Defines `window.bamzWaitLoaded()` and `window.bamzGetPlugin(name)`.
- Loads `/_openbamz_admin.js?appName=<code>`, which:
  - loads every activated plugin's front-end lib into `window.BAMZ_PLUGINS`
    (`src/pluginManager.js:388-393`),
  - dispatches the `openbamz.plugin.loaded` event,
  - renders the **admin top bar** if the current user is an admin
    (`src/menu-front/adminMenu.js:42-46`).

Your front-end code should wait for plugins before using them:

```js
await window.bamzWaitLoaded();
const someApi = window.BAMZ_PLUGINS["some-plugin"];
// or:
const someApi = await window.bamzGetPlugin("some-plugin");
```

> You do **not** add the injection script yourself in dev — the server inserts it. When an
> app is exported for `MONO_DATABASE` mode, the sources already embed it and injection is
> skipped (`src/index.js:354-357`).

### 4.3 Server-side Liquid templating

If your HTML contains Liquid tags (`{% ... %}` / `{{ ... }}`), the server renders them at
serve time with the request headers as context (`host` falls back to
`x-forwarded-host`). — `src/utils.js:70-85`. Useful for host-dependent content.

### 4.4 Talking to the GraphQL API

The application database is exposed at **`/graphql/<code>`**. Send standard GraphQL POST
requests; the session cookie sets your role automatically.

A browser HTTP helper is shipped at `/bamz-lib/bamz-client.mjs`
(`src/index.js:451`, `src/lib-client/bamz-client.mjs`). It wraps `fetch` and automatically
adds the `app-name` header:

```js
import BamzClient from "/bamz-lib/bamz-client.mjs";
const client = new BamzClient();

// GraphQL example
const data = await client.post("/graphql/mypoolexpert", {
  query: `query { allPools { nodes { id name volumeM3 } } }`
});
```

> Naming note: the `IdToNodeIdPlugin` preset keeps "real" table/column names (no forced
> pluralization) and maps `-` to `_` (`src/database/graphileConfig.js:9-56`), so your
> GraphQL field names closely match your SQL identifiers.

### 4.5 The "viewz" client framework (optional)

The default platform UI and the example app use **viewz**, a small hash-router /
view-loader loaded from a CDN (`apps/mypoolexpert/public/index.html:13`,
`src/open-bamz-front/index.html`). It is configured by `viewz.config.json`:

```json
{
  "routing": "HASH",
  "viewsPath": "views",
  "routes": [
    { "url": "/", "path": "root", "subRoutes": [
      { "url": "/welcome", "path": "welcome", "defaultChild": true }
    ]},
    { "url": "/login{/:url}", "path": "login" }
  ],
  "extensions": [ { "url": "extensions/open-bamz.mjs" } ]
}
```

— example: `src/open-bamz-front/viewz.config.json`. Each route maps to a folder under
`views/` containing `<name>.html`, `<name>.css`, `<name>.js`. **viewz is a convenience,
not a requirement** — any front-end stack works because the platform only serves static
files and injects the runtime.

### 4.6 Realtime (socket.io)

A socket.io server is available (`src/websocket.js`). Clients can `joinRoom`/`leaveRoom`;
plugins/tasks emit to rooms via the `io` instance
(`src/database/tasks/runPluginTask.js:33`). Connect with the standard socket.io client to
the same origin.

---

## 5. Activating plugins for your application

Plugins are activated **per application** by inserting their id into `openbamz.plugins`
**in the application's database** (`doc/README.md:226-256`):

```sql
-- run against the application database (e.g. database "mypoolexpert")
INSERT INTO openbamz.plugins (plugin_id) VALUES ('binary-storage');
```

This fires the `addPlugin` job, which runs the plugin's `prepareDatabase` and rebuilds the
app's GraphQL (`src/database/init_base.sql:70-80`, `src/database/tasks/addPlugin.js`).
Removing the row runs `cleanDatabase` (`src/database/init_base.sql:83-93`).

To discover installed plugins, the platform exposes `GET /plugin_list`
(`src/index.js:454-462`).

---

## 6. End-to-end checklist

1. Create an account (platform UI or `public.create_account`).
2. Create the app: `SELECT public.create_application('My App');`.
3. Wait for the `createDatabase` worker to provision the DB + directory.
4. (Optional) bind a hostname via `app.hosts`, or use the `app-name` header / `?appName=`.
5. Define tables/functions in the app database (`public` schema).
6. Add front-end files to `apps/<code>/public/` (start from `index.html`).
7. (Optional) activate plugins by inserting rows in `openbamz.plugins`.
8. Query data at `/graphql/<code>`; use `/bamz-lib/bamz-client.mjs` in the browser.

---

## 7. Local / dev environment

- The repo ships a **devcontainer** (`.devcontainer/`) and `docker-compose.yml` that runs
  PostgreSQL (`Dockerfile_pgsql`), an SSH sidecar (for the code-editor plugin), and the
  server (`Dockerfile`) — `docker-compose.yml`.
- Required env vars are listed in `docker-compose.yml:38-53` and in
  `openbamz_reverse_spec.md` §8.
- Generate JWT keys before first run (`README.md:13-19`):
  ```bash
  openssl genrsa -out jwtRS256.key 2048
  openssl rsa -in jwtRS256.key -pubout -out jwtRS256.key.pub
  ```
- Plugins are mounted from `~/open-bamz-plugins` → `/home/node/plugins`
  (`docker-compose.yml:56`), i.e. `PLUGINS_DIR`.
