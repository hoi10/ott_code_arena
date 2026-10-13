# Project structure

Project type: fullstack web application. Express serves static HTML/CSS/JavaScript and JSON APIs; Prisma persists to MySQL/MariaDB.

Layers:

- Entry/runtime: `src/server.js`, `src/app.js`, `src/config/*`.
- HTTP: `src/routes/*`, `src/controllers/*`, `src/validators/*`, `src/middlewares/*`.
- Application/domain: `src/services/*`, `src/game-engine/*`, `src/bot-runner/*`.
- Persistence: `src/repositories/*`, `prisma/schema.prisma`, `prisma/migrations/*`.
- Browser UI: `public/*.html`, `public/js/*`, `public/css/*`.
- Verification: `tests/*.test.js`.

Functional areas: authentication, users/profile, bot authoring and execution, one-turn submissions, direct matches, scheduled rooms, friends/invitations, and the RPS game engine.

The C++/Python extension crosses the UI, bot validator, persistence model, submission workflow, game engine, and local sandboxed execution boundary. The current implementation keeps the existing public flows and uses one protocol parser for all three languages.
