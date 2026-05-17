# Storm the Tower

A browser-based deck-building roguelike in the vein of *Slay the Spire*, built to be **server-authoritative**: every shuffle, card effect, RNG roll, and enemy decision is computed on the server. The client only sends *intents* (which card, which target) and receives a stripped-down view of state.

## Stack

| Concern | Choice |
| --- | --- |
| Hosting | Vercel |
| Frontend | Next.js 15 (App Router) + React 19 + Tailwind |
| Backend | Next.js Route Handlers |
| Storage | Neon Postgres (via the Vercel ↔ Neon integration) |
| Auth | Neon Auth (Stack Auth-powered) |
| Language | TypeScript |

## Anti-cheat architecture

The threat model: the client is fully untrusted. A determined player can edit DOM state, intercept network calls, and replay requests. None of that should affect the canonical run.

| Defense | Where |
| --- | --- |
| All RNG seeded server-side, persisted as a 32-bit Mulberry32 state | `src/lib/rng.ts`, `src/lib/game/engine.ts` |
| Card effects live only on the server | `src/lib/game/content.ts` |
| Client never sees draw-pile contents/order, seed, or enemy move index | `src/lib/game/view.ts` |
| Every action goes through phase + legality validation | `src/lib/game/engine.ts` |
| Each mutation is a `select ... for update` transaction | `src/lib/game/repo.ts` |
| Idempotency key prevents replayed actions | `src/lib/game/repo.ts`, `runs.last_action` |
| Per-user token-bucket rate limit | `src/lib/rate-limit.ts` |
| Neon Auth (HttpOnly cookie session, server-issued) | `src/stack.ts`, `src/app/handler/[...stack]/page.tsx` |
| Zod-validated request bodies | `src/app/api/game/action/route.ts` |

The client cannot:
- Look up a card it doesn't have in hand (`hand` is a list of IDs; server checks membership).
- Play a card without enough energy (server checks).
- Pick a reward that wasn't offered (server checks).
- Choose a map node that isn't `available` (server checks).
- See the next card it will draw, or know what's in the draw pile beyond its size.
- Predict enemy RNG (seed lives only in DB).

## Setup

```bash
npm install

cp .env.example .env.local
# Fill in:
#   DATABASE_URL                              from Neon
#   NEXT_PUBLIC_STACK_PROJECT_ID              from your Neon project's Auth tab
#   NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY  from your Neon project's Auth tab
#   STACK_SECRET_SERVER_KEY                   from your Neon project's Auth tab

npm run db:init   # applies scripts/schema.sql (the runs table)
npm run dev
```

Visit http://localhost:3000.

### Enabling Neon Auth

1. In the Neon console, open your project → **Auth** → click **Enable**.
2. Copy the three keys into `.env.local`.
3. Neon will auto-provision `neon_auth.users_sync` in your database; the `runs_user_id_fkey` constraint in `scripts/schema.sql` will be added on the next `db:init` run.

### Migrating from Auth.js (older revisions of this app)

The user-id column type changed from INTEGER to TEXT, so the `runs` table can't be migrated in place. From `psql`:

```sql
DROP TABLE IF EXISTS runs;
DROP TABLE IF EXISTS sessions, accounts, verification_token, users;
```

Then re-run `npm run db:init`.

## Deploying to Vercel

1. Push to a Git repo and import into Vercel.
2. Connect a **Neon** database via the Vercel integration (or add `DATABASE_URL` manually).
3. Add the three `NEXT_PUBLIC_STACK_*` / `STACK_SECRET_SERVER_KEY` env vars from your Neon Auth dashboard.
4. Run the schema once (e.g. `npm run db:init` locally with `vercel env pull` having populated `.env.local`).

## Game design

- **Characters:**
  - **Stormcaller** — 60 HP. Single-target burst, Strength powers. Starter: 5 Strike, 4 Defend, 1 Thunderclap. Class cards: Bash, Surge, Pummel, Sword Boomerang, Limit Break (rare); Heavy Slash, Twin Strike, Pommel Strike, Sucker Punch (common).
  - **Tempest** — 50 HP. AoE damage and status focus. Starter: 4 Spark, 4 Ward, 1 Chain Bolt, 1 Thunderclap. Class cards: Shock Wave, Conduit, Overcharge, Tempest (rare); Jolt, Static Discharge, Lightning Rod, Insulate (common).
- **Neutral pool (both):** Iron Wave, Cleave, Shrug It Off, True Grit, Body Slam, Bloodletting, Disarm, Inflame.
- **Status effects:** Vulnerable (+50% attack damage taken), Weak (−25% attack damage dealt), Strength (flat attack bonus). Vulnerable and Weak tick down at the end of the owner's turn.
- **Enemies:** Goblin, Brute, Acid Slime, Tower Spider, Cultist, Tower Sentry, plus elites (Bandit Captain) and two possible bosses (Tower Guard, The Stormlord).
- **Map:** 6 floors, branching, with combat / elite / rest / boss node kinds. Elites & bosses bias rewards toward the rare pool.
- **Rest sites** offer a choice: **Rest** (heal 30% max HP) or **Smith** (upgrade one card in your deck to its `+` variant). Cards have a data-driven `effects: Effect[]` shape, so an upgrade is just a numeric tweak rather than a new code path.

## Adding content

- **A new card:** add an entry to `CARDS` in `src/lib/game/content.ts`. The `apply` function runs only on the server; clients receive `{id, name, cost, description, targeting, exhaust}`.
- **A new enemy:** add a template to `ENEMY_TEMPLATES`, then drop the id into a map node's `enemyTemplates`.
- **A new map kind** (shop, rest, event): extend `MapNodeKind` in `types.ts`, handle in `chooseNode` in `engine.ts`, and render in `MapPhase` in `GameClient.tsx`.

## File map

```
src/
  app/
    handler/[...stack]/page.tsx      Neon Auth (Stack) sign-in / sign-up / account UI
    api/
      game/new-run/route.ts          POST start/resume a run
      game/state/route.ts            GET current run view
      game/action/route.ts           POST one of {chooseNode|playCard|endTurn|pickReward|skipReward|restHeal|restSmith|upgradeCard|skipSmith}
    play/page.tsx                    Authenticated game page
    page.tsx                         Landing + sign-in links
    layout.tsx, globals.css
  stack.ts                           Neon Auth (Stack) server config
  components/GameClient.tsx          The React UI
  lib/
    db.ts                            pg.Pool singleton
    rate-limit.ts                    Token bucket
    rng.ts                           Mulberry32 PRNG
    game/
      types.ts                       Canonical state types
      content.ts                     Cards + enemies (server-only logic)
      engine.ts                      All state transitions
      view.ts                        Strips hidden info before sending to client
      repo.ts                        Transactional persistence
scripts/
  schema.sql                         Auth.js + game tables
  init-db.mjs                        Apply schema
```

## Roadmap

- Branching map paths with shop / rest / event nodes.
- Status effects (Vulnerable, Weak, Strength) — already shaped for it in `applyEnemyIntent`.
- Multiple characters and per-character starter decks.
- Meta-progression: ascensions, persistent unlocks (Postgres tables already in place).
- Replay export: the server stores `seed` + the action log, so any run can be deterministically replayed for audit.
