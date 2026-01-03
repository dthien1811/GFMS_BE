<!-- Copilot instructions for the GFMS repository -->
# Project-specific guidance for AI coding assistants

This file contains concise, actionable guidance to help an AI agent be productive in this repository.

**Big picture**
- **App type**: Small Node.js Express app using Sequelize + MySQL and JWT authentication.
- **Execution mode**: ES module syntax is used via Babel; runtime uses `babel-node` (see `package.json` -> `start`).
- **Primary flow**: HTTP routes -> controllers -> services -> Sequelize models -> DB.

**How to run & debug locally**
- Use the start script: `npm start` (runs `nodemon --exec babel-node src/server.js`).
- Required env vars (create a `.env` file in repo root): `JWT_SECRET`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, optionally `DB_HOSTNAME`, `HOSTNAME`, `PORT`.
- DB migrations: uses `sequelize-cli` (dev dependency). Typical command: `npx sequelize-cli db:migrate` (ensure env vars point to a local MySQL instance).

**Key files and conventions**
- `src/server.js`: app bootstrap — initializes view engine, body-parsing, and routes. Be careful: it imports `src/routes/ok` which may be absent.
- `src/config/config.js`: Sequelize environment config; reads env vars.
- `src/config/viewEngine.js`: sets EJS views under `src/views` and static files under `src/public`.
- `src/routes/web.js`: central HTTP route registration. Routes are added to an Express Router and exported via `initWebRoutes(app)`.
- `src/controllers/*Controller.js`: controllers handle request/response and call services (e.g., `homepageController.js`).
- `src/services/*.js`: business logic and DB access helpers (e.g., `userService.js`). Services generally return Promises.
- `src/middleware/auth.js`: JWT validation middleware. Expects header `Authorization: Bearer <token>`.
- `src/models/*.js` + `src/models/index.js`: Sequelize model definitions and loader.

**Patterns and project-specific gotchas**
- Controllers handle HTTP response codes directly and use simple JSON shapes `{ message: '...' }` or `{ data: ... }`.
- Controllers call service functions rather than invoking Sequelize directly (follow this separation for new features).
- `userService.js` uses bcrypt with callback-style hashing wrapped in Promises; when changing hashing, keep the Promise shape to avoid breaking callers.
- Files mix `import` statements and `module.exports` — Babel transpiles this; preserve the existing export style when making minimal patches.
- JWT: token is signed in `homepageController.handleLogin` with payload `{ user: user.email }` and `expiresIn: '2d'`. Middleware verifies with `process.env.JWT_SECRET`.
- Error handling is minimal (try/catch -> log -> 500). Follow existing patterns for consistency.

**Typical edits: examples**
- Add a new API route: edit `src/routes/web.js` to add a route, create a handler in `src/controllers/<name>Controller.js`, and (if DB access required) add a function in `src/services/<name>Service.js` that uses `db.ModelName`.
- Add a DB column: update `src/models/<model>.js`, create a Sequelize migration in `src/migrations`, then run `npx sequelize-cli db:migrate`.
- Change auth behavior: modify `src/middleware/auth.js` and update tests/calls that rely on decoded token being in `req.decoded`.

**Run/test checklist for PRs**
- `npm start` to smoke-test endpoints locally.
- If you modify models/migrations, run migrations against a local MySQL and verify endpoints that read/write the model.
- Confirm JWT endpoints: register -> login -> call protected route `/get-all-users` with `Authorization: Bearer <token>`.

**Where to look first when something breaks**
- Start `src/server.js` logs. Missing imports or Babel errors will show on startup.
- Check `src/controllers/*` for request validation gaps (they often return 500 on missing inputs).
- DB connection errors point to `src/models/index.js` and `src/config/config.js` (env vars).

If anything here is unclear or you'd like the instructions to include specific code snippets or more examples (e.g., adding a new endpoint end-to-end), tell me which area to expand.
