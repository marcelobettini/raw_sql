# AGENTS.md

Guidance for AI agents (and new contributors) working in this repository.

## What this is

`server04` — a Todo REST API. Express 5, ESM (`"type": "module"`), MySQL via `mysql2` (raw SQL, no ORM), JWT-cookie auth, hand-written OpenAPI spec served with Swagger UI. Requires a running MySQL: `connectDB()` creates a connection pool and applies `src/db/schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`) on every start.

```text
src/index.js  (entry: .env, CORS, cookies, error handlers)
   |
   +-- /api/*        attachUser (resolves req.user, never throws)
   |     +-- /api/auth    register / login / logout  (rate limited)
   |     +-- /api/tasks   CRUD + toggle              (requireAuth on writes)
   |     +-- /api/openapi.json  + Swagger UI at /api
   |
   +-- /health       MySQL ping (deliberately NOT under /api)
   +-- notFound  --> errorHandler  (single error shape for everything)
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | `node --watch src/index.js` — no `.env` needed, but a MySQL server must be reachable |
| `npm test` | **Not set up** (exits 1). There is no test suite. |

No linter or formatter is configured. `package.json` declares `packageManager: yarn@1.22.22`, but a `package-lock.json` exists — both package managers have been used. Prefer `npm run dev` since it is the documented script.

## Invariants — do not break these

1. **Never read `process.env` at module top level.** `process.loadEnvFile()` runs inside `src/index.js` *after* imports are evaluated, so a module-level env read silently ignores `.env`. Env-dependent values must be read inside functions — see `connectionSettings()` in `src/db/mysqlClient.js`, `baseOptions()` in `src/utils/cookies.js` and `getAccessSecret()` in `src/services/authService.js`.

2. **The 12h token lifetime lives in exactly two places that must match:** `ACCESS_TOKEN_TTL_SECONDS` in `src/services/authService.js` and `ACCESS_MAX_AGE_MS` in `src/utils/cookies.js`. It is hardcoded on purpose (not an env var) — see the comment in `authService.js`. If you change one, change the other.

3. **Route handlers never build error responses.** They `throw new AppError(message, status)` (from `src/errors/AppError.js`) and Express 5 forwards everything to `src/middleware/errorHandler.js`, which is the single place that decides status code and the `{ status, error }` response shape. Input validation (including the numeric `:id`) happens in the routes via `AppError`; `errorHandler` only translates native MySQL errors — currently `ER_DUP_ENTRY` (errno 1062) → 409. Do not re-handle those in routes.

4. **`isOperational` is a process-level contract.** `AppError` sets `isOperational: true`. The `uncaughtException`/`unhandledRejection` handlers in `src/index.js` keep the process alive for operational errors and `process.exit(1)` for anything else (a real bug, unknown state). Within a request cycle, Express 5 routes errors to `errorHandler` before they ever reach those handlers.

5. **Two auth middlewares, different contracts** (`src/middleware/auth.js`):
   - `attachUser` — mounted globally on `/api/*`. Resolves `req.user` from the `accessToken` cookie, **never throws, always `next()`**, never refreshes. On invalid/expired token it clears the cookie and continues unauthenticated.
   - `requireAuth` — mounted per-route on protected endpoints. Assumes `attachUser` already ran.
   Session = a single 12h JWT in an httpOnly cookie. **No refresh token, no server-side session state, nothing to revoke.** `logout` intentionally has no `requireAuth` (an expired token must still be clearable).

6. **Password secrecy is layered** (three layers, no Mongoose):
   - `src/services/userService.js` defines a `PUBLIC_COLUMNS` list that never includes `password_hash` (the SQL equivalent of `select: false`); only `findByEmailWithPassword` opts in explicitly.
   - The login route strips it from the object before responding (`const { passwordHash, ...publicUser } = user`), the equivalent of the old `toJSON` transform.
   Keep both. `src/services/userService.js` must stay JWT/cookie-free; `src/services/authService.js` must stay persistence-free.

7. **Cookie options must be set and cleared identically** — always go through `setAccessCookie` / `clearAuthCookies` in `src/utils/cookies.js` (`baseOptions()` exists so path/options can never drift between set and clear).

8. **Route declaration order matters twice:**
   - `PATCH /:id/toggle` is declared *before* `PATCH /:id` in `src/routes/tasks.js`, otherwise Express treats `toggle` as an id.
   - Swagger UI is mounted on `/api` *after* `/api/tasks` in `src/index.js` so specific routes win.

9. **Production requires `JWT_ACCESS_SECRET`.** In dev the server boots anyway with a hardcoded insecure secret (logs a warning once). In `NODE_ENV=production`, `assertProductionSecrets()` refuses to start without it. Cookie `secure` flag is also tied to `NODE_ENV`.

10. **Always close the pool on shutdown.** `connectDB()` creates a `mysql2` connection pool; `SIGINT`/`SIGTERM` in `src/index.js` call `disconnectDB()` (`pool.end()`). Any code path that opens the pool must close it (relevant for future tests).

## Conventions

- **Language:** source comments, README, and commit messages are Spanish (highly explanatory style — comments explain *why*, not *what*). Keep new comments in Spanish to match. This file is English per agent-facing convention; translate if the team prefers.
- **Commits:** Conventional Commits (`feat:`, `docs:`, ...).
- **Layering:** `routes/` = HTTP + validation only; `services/` = business logic **+ raw SQL** (deliberately *no* repository layer — see below); `db/` = pool/connection + `schema.sql`; `middleware/` = cross-cutting; `errors/AppError.js` = operational errors.
- **No repository pattern (on purpose).** The SQL lives directly in `services/` so a request's whole path is readable in one file. This is an educational simplification, not the recommended structure: a real project would extract a repository layer for separation of concerns, testability, swappable storage and centralized row→object mapping. The full rationale is in the header comment of `src/services/taskService.js`. Do not "fix" this without being asked.
- **Validation** is manual in route handlers (trim, check, throw `AppError`) — there is no validation library; input is validated before it reaches SQL.
- **API responses** use `id` (numeric, never `_id`) and camelCase field names — the SQL aliases in `src/services/` guarantee this.
- **Docs:** `README.md` covers only `/tasks` + `/health` (in Spanish). The auth endpoints are documented only in the OpenAPI spec (`src/docs/openapi.js`) — update that file when endpoints change; it is hand-written, not generated.

## Gotchas / known gaps

- No tests, no linter, no formatter, no `engines` field.
- `id` and `userId` are numeric (`INT UNSIGNED AUTO_INCREMENT`), not Mongo ObjectIds. A non-numeric `:id` returns **400** via `parseTaskId` in `src/routes/tasks.js`.
- Data persists across restarts (real MySQL), unlike the previous in-memory `mongodb-memory-server`.
- Empty result on `GET /tasks` returns **404**, not an empty array (documented behavior, easy to mistake for a bug).
- Task reads (`GET`) are public; only writes require auth and ownership. Non-owners get **403**, not 404, on purpose.
- `.env` is gitignored; `.env.example` documents every variable. JWT TTL is intentionally absent from env vars.
- Auth rate limit: 10 requests / 15 min / IP on `register` and `login` only (`src/routes/auth.js`) — watch out for this when manually testing or writing future tests.
