# Building Plugins for Open BamZ

Almost all Open BamZ features beyond account/app/GraphQL/file-serving are delivered by
**plugins** (`doc/README.md:223-230`). This guide documents the plugin contract exactly as
the platform implements it, with `file:line` evidence.

---

## 1. What a plugin is

A plugin is a **Node.js project** placed in the `PLUGINS_DIR` directory
(`src/pluginManager.js:10`, `docker-compose.yml:56` mounts `~/open-bamz-plugins`). Each
subdirectory of `PLUGINS_DIR` is one plugin; its directory name is the **plugin id**
(`src/pluginManager.js:149-157`).

A plugin can extend the platform on three planes:

- **Database** — create schemas/tables/functions per application (`prepareDatabase` /
  `cleanDatabase`).
- **Server** — add Express routes, background tasks, CORS, GraphQL schemas
  (`initPlugin`).
- **Front-end** — serve static files, auto-load a JS lib, add menu entries, expose
  extension slots.

---

## 2. Plugin project layout

```
myplugin/                     # directory name = plugin id
  package.json                # main, type, openbamz.depends
  index.mjs                   # entry point (or index.js for CommonJS)
  front-end/                  # served at /plugin/myplugin/
    lib/my-plugin-lib.mjs     # auto-loaded into window.BAMZ_PLUGINS["myplugin"]
    admin/...                 # settings screens, etc.
  tasks/                      # graphile-worker task files (optional)
    do-something.mjs
```

Evidence for the shape: `doc/README.md:258-300`.

### 2.1 `package.json`

```json
{
  "name": "myplugin",
  "version": "1.0.0",
  "type": "module",
  "main": "index.mjs",
  "openbamz": { "depends": ["other-plugin"] }
}
```

- `type: "module"` → loaded via dynamic `import`; otherwise via `require`
  (`src/pluginManager.js:46-52`).
- `main` → the entry module (`src/pluginManager.js:46-52`).
- `openbamz.depends` → ids this plugin must load **after**; plugins are topologically
  sorted (`src/pluginManager.js:156`, `:432-486`). Circular dependencies are logged and
  the cyclic plugins are ignored (`src/pluginManager.js:480-485`).
- `version` → compared to the version stored in `openbamz.plugins.version`;
  `prepareDatabase` re-runs on each startup only when it changed
  (`src/database/init.js:210-213`).

---

## 3. The three exported lifecycle functions

A plugin entry module should export `prepareDatabase`, `cleanDatabase`, and `initPlugin`
(`doc/README.md:262-290`).

### 3.1 `prepareDatabase({ client, options, grantSchemaAccess, filesDirectory, appFileSystems, logger })`

Called **when the plugin is added** to an application and **on each startup** (if the
version changed). Prepare the DB structure the plugin needs. Use idempotent
`CREATE ... IF NOT EXISTS` patterns (`doc/README.md:268-280`).

Params (`src/database/init.js:188-256`, `doc/README.md:282-291`):

| Param | Meaning |
|-------|---------|
| `client` | A `pg` client (`client.query(sql, params)`); released by the platform. |
| `options` | Connection options; `options.database` is the application/database name. |
| `grantSchemaAccess(schema, roleLevels?)` | Grant the default admin/user/readonly grants to a schema you create (`src/database/init.js:195-201`, `:371-404`). |
| `filesDirectory` | `"$DATA_DIR/apps/<app>"` (`src/database/init.js:208`). |
| `appFileSystems` | Helper to write app files (`src/appFileSystems.js`). |
| `logger` | Winston logger. |

```js
export const prepareDatabase = async ({ client, grantSchemaAccess }) => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS myplugin`);
  await client.query(`CREATE TABLE IF NOT EXISTS myplugin.settings (
    key text PRIMARY KEY, value jsonb
  )`);
  // expose myplugin schema with standard admin/user/readonly grants
  await grantSchemaAccess("myplugin");
};
```

> A schema named exactly like the plugin id (prefix `open-bamz-` stripped) is automatically
> exposed through GraphQL (`src/database/graphql.js:122-124`). Create a `myplugin_private`
> schema for data you do **not** want in GraphQL (`doc/README.md:51-53`).

### 3.2 `cleanDatabase({ client, options, filesDirectory, appFileSystems })`

Called **when the plugin is removed** from an application
(`src/database/init.js:263-275`, `doc/README.md:293-308`). Delete the plugin's data — the
clean way is to drop the schema you created:

```js
export const cleanDatabase = async ({ client }) => {
  await client.query(`DROP SCHEMA IF EXISTS myplugin CASCADE`);
};
```

### 3.3 `initPlugin(params) → pluginData`

Called **once when the platform starts** (not per app) (`doc/README.md:310-315`). This is
where you register routes, static paths, menu entries, CORS, GraphQL schemas, and
extension slots.

**Received params** (`src/pluginManager.js:193`, `doc/README.md:317-340`):

| Param | Meaning |
|-------|---------|
| `contextOfApp(appName)` | Returns `{ pluginsData }` for an app — the merged data of all its activated plugins (`src/pluginManager.js:91-137`). |
| `appFileSystems` | App file helper (`src/appFileSystems.js`). |
| `loadPluginData(listener)` | Register a listener `({pluginsData, appName, client}) => {}` run when an app context is built — the inter-plugin communication hook (`src/pluginManager.js:177-179`). |
| `hasCurrentPlugin(appName)` | `true` if this plugin is activated for `appName` (cached) (`src/pluginManager.js:162-176`). |
| `userLoggedAndHasPlugin(req, res)` | Guard: rejects (401/403) if the user is not logged in or the plugin is not active for the app (`src/pluginManager.js:180-192`). |
| `injectBamz(html, appName)` | Inject the BamZ runtime into HTML (for SSR/custom handlers) (`src/utils.js:13-88`). |
| `app` | The Express app instance (`src/index.js:348`). |
| `logger` | Winston logger. |
| `graphql` | The GraphQL helper module (`runDbGraphql`, `runMainGraphql`, `checkAppAccessMiddleware`, ...) (`src/database/graphql.js`). |
| `runQuery(options, sql, params)` / `runQueryMain` | One-shot SQL helpers (`src/database/dbAccess.js:64-86`). |
| `getDbClient` | Pooled client getter (`src/database/dbAccess.js:20-47`). |
| `io` | The socket.io instance (`src/websocket.js`). |

**Returned `pluginData` structure** (`doc/README.md:342-356`):

| Property | Meaning | Used at |
|----------|---------|---------|
| `frontEndPath` | Directory (relative to plugin root) of front-end statics, served at `/plugin/<id>/`. | `src/pluginManager.js:194-196`, `src/index.js:437-440` |
| `frontEndLib` | One path or array of JS libs (relative to `frontEndPath`) auto-loaded on app start into `window.BAMZ_PLUGINS["<id>"]`. | `src/pluginManager.js:384-393` |
| `frontEndPublic` | Path(s) under the front-end served to **anonymous** users. | `src/index.js:380-399` |
| `graphqlSchemas` | Extra schema name(s) to expose via GraphQL beyond the same-name schema. | `src/database/graphql.js:126-137` |
| `router` | Express router mounted at `/<id>/`. | `src/index.js:443-446` |
| `menu` | Top-menu entries injected into apps. | `src/pluginManager.js:364-379` |
| `pluginSlots` | Named arrays other plugins push extensions into. | `src/pluginManager.js:112`, `doc/README.md:300-356` |
| `cors` | Extra CORS allowed/exposed headers (`:appName` substituted). | `src/index.js:308-324` |

---

## 4. Adding server-side API (Express router)

Create a router in `initPlugin` and return it; it is mounted under `/<pluginId>/`
(`src/index.js:443-446`, `doc/README.md:360-395`):

```js
import express from "express";

export const initPlugin = async ({ userLoggedAndHasPlugin, runQuery, logger }) => {
  const router = express.Router();

  // served at /myplugin/api/data/:appName
  router.get("/api/data/:appName", async (req, res) => {
    if (!(await userLoggedAndHasPlugin(req, res))) return; // 401/403 already sent
    const { rows } = await runQuery(
      { database: req.params.appName },
      "SELECT key, value FROM myplugin.settings"
    );
    res.json(rows);
  });

  return { frontEndPath: "front-end", router };
};
```

> Guard data routes with `userLoggedAndHasPlugin` (or `graphql.checkAppAccessMiddleware`)
> and/or `hasCurrentPlugin(appName)`; the platform does not authorize plugin routers for
> you (`src/pluginManager.js:180-192`).

---

## 5. Serving front-end files

Return `frontEndPath` and (optionally) `frontEndLib` / `menu`
(`doc/README.md:397-440`):

```js
return {
  frontEndPath: "front-end",
  frontEndLib: "lib/my-plugin-lib.mjs",      // → window.BAMZ_PLUGINS["myplugin"]
  frontEndPublic: "public",                  // served to anonymous users
  menu: [
    { name: "admin", entries: [
      { name: "My settings", link: "/plugin/:appName/myplugin/admin/screen.html" }
    ]}
  ]
};
```

- Static files resolve from `<pluginDir>/<frontEndPath>` and are reachable at
  `/plugin/<id>/...` (`src/pluginManager.js:194-196`, `src/index.js:437-440`).
- `:appName` placeholders in menu links are substituted client-side.
- The `frontEndLib` module is loaded into `window.BAMZ_PLUGINS["<id>"]` and is available
  to app code via `await window.bamzGetPlugin("<id>")` (`src/utils.js:30-33`).
- Anonymous access to plugin files is denied unless the path is under `frontEndPublic`
  (`src/index.js:380-399`).

---

## 6. Background tasks (graphile-worker)

Drop task files in your plugin (e.g. `tasks/backup.mjs`) and invoke them from SQL through
the built-in `runPluginTask` job (`src/database/tasks/runPluginTask.js`):

```sql
SELECT graphile_worker.add_job('runPluginTask', json_build_object(
  'plugin', 'backup',
  'task',   'tasks/backup.mjs',
  'params', json_build_object('backupId', NEW._id)
));
```

The task module's default export is invoked as `runner(params, { logger, query, appName,
io })` (`src/database/tasks/runPluginTask.js:32-39`; resolved by
`getPluginTaskRunner`, `src/pluginManager.js:61-84`):

```js
// tasks/backup.mjs
export default async (params, { logger, query, appName, io }) => {
  logger.info(`Backup ${appName} #${params.backupId}`);
  // ... do work, query the DB, emit realtime updates via io() ...
};
```

> `.mjs` task files are `import`ed (default export); `.js` files are `require`d
> (`src/pluginManager.js:79-83`).

---

## 7. Inter-plugin extension (slots)

Plugins extend each other through **slots** — named arrays declared by a host plugin and
filled by extender plugins (`doc/README.md:300-470`).

### 7.1 Host plugin declares a slot

```js
export const initPlugin = async () => ({
  frontEndPath: "front-end",
  pluginSlots: { frontEndExtensions: [] }   // declare the slot
});
```

Slots live on the per-app context and are deep-cloned per app
(`src/pluginManager.js:111-113`).

### 7.2 Extender plugin pushes into the slot

Register a `loadPluginData` listener in `initPlugin`; it runs whenever an app context is
built (`src/pluginManager.js:115-125`, `doc/README.md:320-340`):

```js
export const initPlugin = async ({ loadPluginData }) => {
  loadPluginData(async ({ pluginsData }) => {
    pluginsData?.["host-plugin"]?.pluginSlots?.frontEndExtensions?.push({
      plugin: "my-extension",
      extensionPath: "/plugin/:appName/my-extension/extension/ext.mjs"
    });
  });
  return { frontEndPath: "front-end" };
};
```

### 7.3 Host plugin reads the slot

In a router (or anywhere with an appName), read the merged context
(`doc/README.md:341-360`):

```js
router.get("/host-plugin/extensions/:appName", async (req, res, next) => {
  const appName = req.params.appName;
  if (!(await hasCurrentPlugin(appName))) return next();
  const ctx = await contextOfApp(appName);
  const exts = ctx.pluginsData["host-plugin"]?.pluginSlots?.frontEndExtensions ?? [];
  // e.g. generate a JS module that imports each extensionPath
  res.type("application/javascript").end(/* generated ESM importing exts */);
});
```

A common pattern is to generate an ESM file that `import`s each `extensionPath`
(with `:appName` substituted) so the front-end can load all extensions at once
(`doc/README.md:373-470`).

---

## 8. Activating / deactivating a plugin

A plugin is activated **per application** by writing to that app database's
`openbamz.plugins` table (`doc/README.md:226-256`):

```sql
INSERT INTO openbamz.plugins (plugin_id) VALUES ('myplugin');   -- → runs prepareDatabase
DELETE FROM openbamz.plugins WHERE plugin_id = 'myplugin';      -- → runs cleanDatabase
```

These fire the `openbamz_plugin_insert` / `openbamz_plugin_remove` triggers →
`addPlugin` / `removePlugin` jobs, which also rebuild the app's GraphQL
(`src/database/init_base.sql:70-93`, `src/database/tasks/addPlugin.js`,
`src/database/tasks/removePlugin.js`).

Inserting a plugin whose entry declares `dependencies` also inserts those dependency rows
(`ON CONFLICT DO NOTHING`) before running `prepareDatabase`
(`src/database/init.js:230-236`).

---

## 9. Minimal complete plugin example

`~/open-bamz-plugins/hello/package.json`

```json
{ "name": "hello", "version": "1.0.0", "type": "module", "main": "index.mjs" }
```

`~/open-bamz-plugins/hello/index.mjs`

```js
import express from "express";

export const prepareDatabase = async ({ client, grantSchemaAccess }) => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS hello`);
  await client.query(`CREATE TABLE IF NOT EXISTS hello.greeting (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), text text NOT NULL
  )`);
  await grantSchemaAccess("hello");          // also makes it GraphQL-visible
};

export const cleanDatabase = async ({ client }) => {
  await client.query(`DROP SCHEMA IF EXISTS hello CASCADE`);
};

export const initPlugin = async ({ userLoggedAndHasPlugin, runQuery }) => {
  const router = express.Router();
  router.get("/say/:appName", async (req, res) => {
    if (!(await userLoggedAndHasPlugin(req, res))) return;
    const { rows } = await runQuery(
      { database: req.params.appName },
      "SELECT text FROM hello.greeting ORDER BY id LIMIT 1"
    );
    res.json({ message: rows[0]?.text ?? "Hello from the hello plugin!" });
  });

  return {
    frontEndPath: "front-end",
    frontEndLib: "lib/hello.mjs",
    router,
    menu: [{ name: "admin", entries: [
      { name: "Hello", link: "/plugin/:appName/hello/admin/index.html" }
    ]}]
  };
};
```

`~/open-bamz-plugins/hello/front-end/lib/hello.mjs`

```js
export async function greet() {
  const r = await fetch(`/hello/say/${window.BAMZ_APP}`, { credentials: "include" });
  return (await r.json()).message;
}
export default { greet };
```

Activate it on an app: `INSERT INTO openbamz.plugins (plugin_id) VALUES ('hello');`
(run against that app's database). Then in app front-end code:

```js
const hello = await window.bamzGetPlugin("hello");
console.log(await hello.greet());
```

---

## 10. Conventions & gotchas (from the code)

- **Plugin id = directory name** — keep it `kebab-case`; it is also the GraphQL schema
  name (after stripping `open-bamz-`) and the route prefix
  (`src/database/graphql.js:122-124`, `src/index.js:443-446`).
- **`prepareDatabase` must be idempotent** — it runs on every version change and is also
  used by `preparePlugins` at startup (`src/database/init.js:204-214`).
- **Authorize your own routes** — nothing authorizes plugin routers automatically; use
  `userLoggedAndHasPlugin` / `hasCurrentPlugin` (`src/pluginManager.js:162-192`).
- **Release DB clients** — when you call `getDbClient`, you must `client.release()`;
  prefer `runQuery` for one-shots (`src/database/dbAccess.js:20-73`).
- **Hot-path cost** — `contextOfApp` opens a DB connection per call
  (`src/pluginManager.js:99`); cache where reasonable and prefer the `client` passed into
  your `loadPluginData` listener over `runQuery` to avoid connection leaks
  (`doc/README.md:323-325`).
- **Front-end recursion guard** — plugin libs are not re-loaded while browsing inside a
  plugin page unless `?forceLoadPlugins` is set (`src/pluginManager.js:381-393`).
- **CORS** — declare extra headers via the `cors` array in your returned `pluginData`;
  `:appName` is substituted at request time (`src/index.js:308-324`).
