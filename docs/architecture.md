# System architecture

OTT Code Arena is a small server-rendered-by-static-files web application. The
browser pages are plain HTML, CSS, and JavaScript served by Express; the API
uses JSON and bearer JWT authentication.

## Runtime components

```text
Browser pages
  ├── public/js/api.js ── Authorization header and JSON fetch helper
  └── /api routes
       ├── auth ── auth service ── user repository
       ├── users ── user service ── user repository + Prisma
       ├── bots ── bot service ── bot repository + isolated bot runner
       ├── matches ── match service ── match manager / rules / repositories
       └── submissions ── submission service ── bot evaluation + repository
                                      └── Prisma / MySQL
```

Controllers validate inputs and shape HTTP responses. Services own
authorization-adjacent business rules and workflows. Repositories isolate
Prisma queries. The global error middleware maps expected domain errors and
validation failures to HTTP responses.

## Bot execution and game rules

Bot source is run in a separate Node.js process with a VM context, a short
execution timeout, bounded output, and no application environment variables.
The runner returns an action; it cannot mutate the persisted game state.

`src/game-engine/game-rules.js` is the rules authority for the 9×9 board,
movement, captures, legal actions, and victory conditions. The match manager
loads the currently assigned bot, obtains its decision, applies it through the
rules module, then persists the resulting board and turn history. Invalid
decisions consume a turn without changing the board.

Submissions reuse the bot test workflow against a newly generated sample
position. They persist the source and a single-turn outcome. They are not
ranked matches.

## Data model

- `User` owns `Bot` and `Submission` records.
- `Bot` stores JavaScript source and visibility; public bot listings omit
  source code.
- `Match` stores overall status and serialized board/turn state in `result`.
- `MatchParticipant` assigns bots to match sides and records winner/score data.
- `Submission` stores tested source, optional bot association, status, and JSON
  evaluation result.

## Security and operational boundaries

- Protected routes verify JWTs and scope profile, bot, match, and submission
  reads/changes to the authenticated user.
- User responses must exclude password hashes.
- Changing passwords verifies the current password and re-hashes the new one.
  There is no email verification or JWT revocation/session-management flow yet.
- Database migrations are maintained under `prisma/migrations`; deployments
  should run `npx prisma migrate deploy` before starting the application.
- Unit tests run with `npm test`; a live database is required for end-to-end
  persistence checks.