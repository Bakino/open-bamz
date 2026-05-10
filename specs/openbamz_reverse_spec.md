---
name: openbamz_reverse_spec
description: Reverse-engineered specification for the Open BamZ application.
type: project
---

# Open BamZ Application Specification (Reverse-Engineered)

## 1. Technology Stack and Architecture

The Open BamZ application is built primarily with Node.js and Express.js, leveraging a PostgreSQL database (PostGraphile for GraphQL API generation) and WebSocket for real-time communication. It supports a multi-application architecture with a plugin system.

### Key Technologies:
*   **Backend**: Node.js, Express.js
*   **Database**: PostgreSQL
*   **GraphQL API**: PostGraphile
*   **Real-time Communication**: WebSocket (Socket.IO)
*   **Authentication**: JWT (JSON Web Tokens)
*   **Logging**: Morgan, custom logger
*   **Middleware**: cookie-parser, body-parser, cors

## 2. Module/Directory Structure

*   `apps/`: Contains various applications.
*   `doc/`: Documentation files.
*   `jwt_keys/`: JWT key files.
*   `node_modules/`: Node.js dependencies.
*   `src/`: Core application source code.
    *   `src/database/`: Database access, GraphQL configuration, migration scripts, and database tasks.
    *   `src/lib-client/`: Client-side libraries, including TypeScript declaration files.
    *   `src/menu-front/`: Frontend menu related files.
    *   `src/open-bamz-front/`: Main frontend application.
    *   `src/openbamz-front/`: Another frontend application (possibly admin related).
    *   `src/auth.js`: Authentication logic.
    *   `src/pluginManager.js`: Plugin management logic.
    *   `src/appManager.js`: Application management logic.
    *   `src/websocket.js`: WebSocket initialization.
    *   `src/logger.js`, `src/logger-access-log.js`: Logging utilities.
    *   `src/utils.js`: Utility functions (e.g., `injectBamz`).
    *   `src/appCache.js`, `src/appFileSystems.js`: Caching and file system utilities for applications.
    *   `src/index.js`: Main application entry point.

## 3. Observed Requirements (EARS Format)

### Ubiquitous
*   The system shall use Node.js and Express.js for backend services.
*   The system shall expose a GraphQL API via PostGraphile.
*   The system shall provide real-time communication capabilities via WebSockets.
*   The system shall use JWT for user authentication.
*   The API shall return JSON responses.

### Event-driven
*   When the server starts, the system shall initialize the main database (`src/database/init.js`).
*   When the server starts, the system shall load and initialize plugins (`src/pluginManager.js`).
*   When the server starts, the system shall load all registered applications (`src/appManager.js`).
*   When a request is received, the system shall determine the `appName` based on hostname, `app-name` header, or `appName` query parameter.
*   When a request to `/auth` is received (and not in mono-database mode), the system shall handle authentication routes (`src/auth.js`).
*   When an HTML file or root path (`/`) is requested, the system shall inject the `bamz-lib` (`src/utils.js`) and serve the modified HTML.
*   When a request to `/plugin/<pluginName>/<path>` is received, the system shall serve static files from the plugin's frontend directory if authorized, or register the plugin's router.
*   When a request to `/graphql/*any` or `/graphiql/*any` is received, the system shall dynamically load and handle the application's GraphQL instance.
*   When an application's static file is requested, the system shall serve the file, ensuring it is within the application's public directory.
*   When an unhandled request is encountered, the system shall pass it to the next middleware.
*   When a request to `/health` is received, the system shall return a JSON response `{ok: 1}`.

### State-driven
*   While in mono-database mode (`IS_MONO_DB`), the system shall force the `appName` to `process.env.MONO_DATABASE` and skip main database initialization.
*   While an `appName` is determined, the system shall use it for application-specific logic (e.g., loading application data, routing).
*   While a plugin has `frontEndPublic` configured, the system shall allow public access to specified files even if the user is not authenticated.

### Optional
*   Where an access logger is configured (`src/logger-access-log.js`), the system shall log incoming requests with masked sensitive data.
*   Where CORS configuration is dynamically provided by plugins, the system shall update allowed/exposed headers accordingly.

## 4. Non-functional Observations

*   **Performance**: The application uses caching mechanisms (`hostnameCache`, `appCache`) to improve performance for application name resolution. File serving uses `createReadStream` for efficiency.
*   **Security**:
    *   JWT is used for authentication.
    *   Sensitive data in request bodies is masked in access logs (`maskSensitive` function in `src/index.js`).
    *   Static file serving prevents directory traversal attacks by checking `filePath.startsWith(appFilePath)`.
    *   CORS is configured to allow all origins but with specific allowed and exposed headers. Plugins can extend this configuration.
*   **Maintainability**: The application has a modular structure with separate files for authentication, plugin management, app management, and database access. The use of plugins and dynamic application loading suggests extensibility.
*   **Observability**: Uses `morgan` for HTTP request logging, with custom tokens for `appName`, `bamzUser`, `appUser`, and masked `body`.
*   **Scalability**: The modular architecture and use of a database for application and plugin configuration could support scaling to multiple applications. WebSocket integration hints at real-time feature scalability.

## 5. Inferred Acceptance Criteria

*   The application must start successfully and listen on the configured port (3000).
*   Users must be able to authenticate via JWT.
*   Applications must be correctly identified based on hostname, headers, or query parameters.
*   Plugins must be loaded and their static files and routers registered correctly.
*   Static HTML files must have `bamz-lib` injected.
*   GraphQL queries for both main and application-specific instances must function as expected.
*   Static files for applications must be served correctly from their public directories, with path restrictions enforced.
*   The `/health` endpoint must return `{"ok": 1}`.
*   Access logs, if enabled, must correctly log requests with sensitive data masked.
*   WebSocket connections must be established and function correctly.

## 6. Uncertainties and Questions

*   **Database Schema**: The exact schema of the `public.app` table and other application-specific tables is not fully known.
*   **Plugin API**: The precise API for plugins (how they register routes, provide frontend assets, define CORS rules, etc.) needs further investigation.
*   **`injectBamz` function**: The exact functionality and impact of `injectBamz` in `src/utils.js` on HTML content requires deeper analysis.
*   **`bamz-lib`**: The contents and functionalities of `bamz-lib` (`src/lib-client/`) are not fully understood.
*   **Application Manifests**: How applications are defined and configured (e.g., `hasFrontend`) is not clear.
*   **Error Handling**: While some error handling is present (e.g., in database initialization, GraphQL requests), a comprehensive understanding of the error handling strategy across the entire application stack is needed.

## 7. Recommendations

*   **Document Database Schemas**: Generate a detailed schema documentation for `public.app` and other critical tables to improve clarity.
*   **Formalize Plugin API Documentation**: Create explicit documentation for the plugin development API, including available hooks, configuration options, and expected module exports.
*   **Analyze `bamz-lib`**: Investigate `src/lib-client/` and `injectBamz` to fully understand the client-side library's purpose and injection mechanism.
*   **Create OpenAPI/GraphQL Schema Documentation**: Generate and maintain up-to-date OpenAPI specifications for REST endpoints and GraphQL schemas for all exposed APIs.
*   **Enhance Error Monitoring**: Implement a more robust error monitoring and alerting system, potentially integrating with a dedicated error tracking service.
*   **Security Review**: Conduct a thorough security review, especially focusing on input validation, authorization checks in plugins/applications, and potential vulnerabilities in the dynamic GraphQL loading mechanism.
