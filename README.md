# Bingo Backend

## What each tool is doing here

- **TypeScript** — JavaScript with type checking. Nothing runs differently at
  runtime; it just catches "you passed a string where a number was expected"
  type mistakes before you ever run the code.
- **Prisma** — talks to the Postgres database. `prisma/schema.prisma` describes
  the tables; Prisma generates a fully-typed client (`@prisma/client`) from
  that file so `prisma.team.findUnique(...)` etc. autocompletes and
  type-checks against your actual schema.
- **Express** — the plain HTTP framework serving the REST endpoints
  (`/teams/join`, `/completions`, etc).
- **Socket.IO** — the WebSocket layer. When one player's client reports a
  completion, this is what pushes the update to every other connected
  teammate instantly instead of them having to refresh.

## One-time setup

1. **Get a Postgres database.** The easiest path if you don't want to install
   Postgres locally: sign up for a free [Neon](https://neon.tech) or
   [Supabase](https://supabase.com) project — either gives you a connection
   string immediately. (Local Postgres via Docker or Postgres.app works too,
   if you'd rather.)
2. **Copy the env template and fill it in:**
   ```
   cp .env.example .env
   ```
   Paste your database connection string into `DATABASE_URL`, and set
   `JWT_SECRET` / `ADMIN_SECRET` to any long random strings (e.g. output of
   `openssl rand -hex 32`).
3. **Install dependencies:**
   ```
   npm install
   ```
4. **Create the tables** (reads `prisma/schema.prisma`, applies it to your
   database):
   ```
   npm run prisma:migrate
   ```
5. **Load the real board** (creates the Misclickers clan + the 25-tile board
   from `prisma/fixtures/misclickers-fall-bingo.json`):
   ```
   npm run seed
   ```
6. **Run the tests** (verifies the completion/scoring logic, no database
   needed for this part):
   ```
   npm test
   ```
7. **Start the dev server:**
   ```
   npm run dev
   ```
   You should see `Bingo backend listening on :4000`.

## Trying it end to end

Create a team on the seeded board (swap in the real board id — the seed
script prints it, or query `npm run prisma:migrate`'s Prisma Studio via
`npx prisma studio`):

```
curl -X POST localhost:4000/admin/boards/<boardId>/teams \
  -H "x-admin-secret: <your ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Team A"}'
```

This returns the team, including its `joinCode` — that's what you'd hand out
to players. Join as a player:

```
curl -X POST localhost:4000/teams/join \
  -H "Content-Type: application/json" \
  -d '{"joinCode": "<code from above>", "rsn": "Zezima"}'
```

This returns a `token`. Use it to check board state:

```
curl localhost:4000/boards/<boardId>/state -H "Authorization: Bearer <token>"
```

...and to report a completion:

```
curl -X POST localhost:4000/completions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"tileId": "<a tile id from the state response>", "metric": "ITEM_OBTAINED", "source": "Dragon chainbody", "amount": 1}'
```

If you open a second `boards/:id/state` request (or a WebSocket connection —
see below) for the same team, you'll see the update land immediately.

## What's not built yet

- No admin authentication beyond the shared `ADMIN_SECRET` header — fine for
  one organizer, not for self-serve multi-clan use if this goes public later.
- No rate limiting or abuse protection on `/completions` — reasonable for a
  friendly clan bingo, worth revisiting before wider release.
- The WebSocket client side doesn't exist yet — that's the RuneLite plugin,
  which is the next phase of this project.

## A note on verification

This was built and unit-tested in a sandbox without registry access, so
`npm install` couldn't actually run here — the completion/scoring logic was
verified by running the same test cases as plain JavaScript instead (same
algorithm, types stripped). Worth running `npm install && npm test` yourself
once, plus the curl walkthrough above, to confirm the TypeScript compiles
cleanly and the Prisma/Express/Socket.IO wiring behaves as expected — those
parts couldn't be exercised without a live database and a real npm install.
