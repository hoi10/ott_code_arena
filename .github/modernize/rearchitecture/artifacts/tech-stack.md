# Tech stack

- Runtime: Node.js CommonJS; `package.json` does not declare an engines range.
- HTTP: Express 5, CORS, Helmet, Morgan.
- Validation/auth: Zod 4, JWT, bcrypt.
- Persistence: Prisma 7 with MariaDB adapter, MySQL datasource.
- Bot execution: three local adapters (Node.js worker, configured Python interpreter, and C++17 compiler) launched in an OS sandbox with shared stdin/stdout protocol.
- Frontend: static HTML, CSS, and browser JavaScript; no frontend build system.
- Tests: Node's built-in test runner via `node --test tests/*.test.js`.
- Bot language configuration: `BOT_PYTHON_PATH`, `BOT_CPP_COMPILER`, and runtime limits in `.env.example`.

Sandbox configuration is platform-dependent: macOS requires `sandbox-exec`; Linux requires `bwrap`; unsupported environments must fail closed.
