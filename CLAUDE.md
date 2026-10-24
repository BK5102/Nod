# Rerouted: project guide for Claude Code

Tagline: Your flight got canceled. Rerouted shops your way home within your card's rules, and you approve with one tap.

We have moved on from Nod, an earlier idea at this event. Its backend code is parked in `wip/nod/` or in git history. Do not extend it.

## Source of truth

- `docs/PLAN.md` is the full backend plan. Section 9 is the backend contract the frontend depends on. This file is the short version, and where they conflict, PLAN.md wins.
- `PROMPT.md` holds the backend build prompts, milestones B1 to B4.
- `docs/spacetimedb/*.mdc` holds the SpacetimeDB reference. Copy API shapes from it or from the existing module. Never guess them.

## Team and time

Two people, 18 hours to submission (Sunday 9:00 AM PT, Cal Hacks 13.0). Live demo at judging.

**This is a working hackathon prototype, not production.** The backend is about 7 hours of work. If something does not show up in the 90-second demo or in a judge's question, do not build it. No extra abstractions, tables, reducers, routes or test files beyond `docs/PLAN.md`.

| Person | Owns |
| --- | --- |
| Backend | `spacetimedb/`, `lib/`, `app/api/`, `scripts/`, `tests/`, `data/fixtures/`, generated `src/module_bindings/`, `.env.example`, and these docs: `CLAUDE.md`, `docs/PLAN.md`, `PROMPT.md`, `README.md`, `PRODUCT.md` |
| Frontend | `app/**/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/`, `public/`, and their own docs |

**Ground rules:**
- Never edit the other person's files.
- The backend contract (PLAN.md section 9) is frozen after milestone B1. Change it only after telling the other person, and commit regenerated bindings with the module change.
- Pull before every push. Make small commits to `main`, with no branches.
- **Backend schedule:**

  | Hour | Milestone |
  | --- | --- |
  | 1.5 | Bindings and `data/fixtures/demo.json` |
  | 4 | Approve works |
  | 6 | Full flow |
  | 7 | `demo-check` passes |

- **Team schedule:**

  | Hours | What |
  | --- | --- |
  | 7 to 10 | Integration |
  | 10 to 12 | Rehearse and submit |
  | 12 to 18 | Buffer |

## Problem (one line)

When your flight is canceled, you have about 20 minutes to buy your way home before the good options sell out, and today you do it alone, on a phone, in a gate line, with no one checking that you are not overpaying.

## The idea

A shopping agent for the worst 20 minutes of a trip.

When a flight is canceled, the agent:
1. checks the airline's free rebooking first
2. compares paid flights and a hotel
3. ranks them against the traveler's deadline
4. explains each one in a sentence

The traveler approves one option with one tap. It is bought only if it fits the card's rules (trip cap, ask-first threshold, allowed categories) at the exact price approved.

## Track

**Visa, Best use of Reimagining Shopping ($5,000).** Secondary: Spacetime.

| Criterion | Weight | Backend answer |
| --- | --- | --- |
| Innovation | 25% | The card's rules filter the shopping. Free first, paid only when needed |
| User experience | 25% | Steps stream live. Options in under 10 seconds. Approve-and-pay is one call |
| Technical execution | 20% | Rules in SpacetimeDB reducers. One Claude call validated with zod. Quote-bound atomic purchase. Hash-chained receipts |
| Commerce impact | 15% | Canceled at, booked at, options shown and chosen, spend vs cap, and refund owed, all stored and measured live |
| Trust and responsibility | 15% | Agent refused live. Price change voids the approval. Injected listing flagged. No personal data in public tables or sent to Claude |

## Stack

| Layer | Choice |
| --- | --- |
| App and API | Next.js (App Router), TypeScript strict. Server routes in `app/api` hold all secrets and outbound calls |
| Hosting | The demo runs from a laptop (`pnpm dev` against Maincloud). A Vercel deploy is optional, in the buffer. Set `maxDuration = 60` on `/api/demo` |
| Backend logic | SpacetimeDB TypeScript module in `spacetimedb/`, on Maincloud. Every rule lives in a reducer |
| Client | `spacetimedb` npm package, generated `src/module_bindings` |
| LLM | Anthropic API, `claude-sonnet-5-5`. One call per run, server-side |
| Policy engine | Pure TypeScript in `spacetimedb/src/core/`, Vitest |
| Providers | Replayed fixture `data/fixtures/demo.json`, fictional names |
| Card | Mock token in a private table, checked inside `approve_offer` |
| Validation | zod |
| Tooling | pnpm, Vitest, tsx scripts |

## Architecture (simplified)

**Identities** on `ctx.sender`, through the `actor` and `seat` tables:
- **traveler:** any browser.
- **agent:** the server, `SPACETIMEDB_AGENT_TOKEN`.
- **operator:** the server, `SPACETIMEDB_OPERATOR_TOKEN`, for demo controls.

The agent and operator seats are assigned by the admin only and can never take the traveler seat.

**Flow:**
1. `POST /api/demo {action: "reset"}` calls `reset_demo`.
2. `POST /api/demo {action: "cancel"}`:
   1. `cancel_flight`
   2. Agent steps through `log_step`.
   3. One Claude call for reasons and flags.
   4. `submit_offers`: the reducer tiers, ranks and hashes. It never takes a tier from the caller.
   5. `flag_offer`: raise only.
3. `POST /api/agent/try-approve`: the agent calls `approve_offer` and is refused. The route writes a `refusal` step.
4. `POST /api/demo {action: "price"}` calls `set_price`, so the old quote hash stops working.
5. The browser calls `approve_offer(offerId, quoteHash)`. In one transaction it checks seat, tier, hash, expiry, cap, one flight per trip and the mock token. Then it books, updates the trip and appends the receipt. Any failure throws, and nothing changes.

**Tables:**
- Public: trip, mandate, offer, agent_step, receipt, actor, seat.
- Private: admin, traveler_profile, payment_token.
- No views.

Exact fields are in PLAN.md section 9.

## Tiers

AUTO < ASK < BLOCK. Start at AUTO, and rules raise it.
- **BLOCK:** over the trip cap, or a category not allowed.
- **ASK:**
  - above the ask-first threshold
  - a free option exists
  - misses the deadline
  - above the auto ceiling (the demo ceiling is $0)
- **Claude flags:** raise only.
- **Ranking** is done in the reducer, not by Claude:
  1. BLOCK is set aside.
  2. Flights before hotels.
  3. Within each, offers that meet the deadline come first, then cheaper first.

## Non-negotiable rules

1. The policy engine sets the tier and the rank. Claude only explains and flags, and a flag can only raise a tier.
2. The agent can never approve. Enforce on `ctx.sender` in reducers. Never trust a role passed as an argument.
3. `approve_offer` requires the current quote hash. A changed price voids the old one.
4. Default to no. Any failed check throws and reverts.
5. Listing text is untrusted. Wrap it in `<untrusted_listing>` tags, tell Claude to flag instructions inside it, and keep the hostile Skyport Suites listing in the fixture and tests.
6. No personal data (name, email, booking reference, loyalty number, card data) in public tables, step text, receipts, logs or Claude input. Receipts show only the token's last 4.
7. Secrets are server-only env vars, never committed: `ANTHROPIC_API_KEY`, `SPACETIMEDB_AGENT_TOKEN`, `SPACETIMEDB_OPERATOR_TOKEN`.
8. Label every simulated part: the cancellation, flights and hotels, the card token and the payment. Call it a prototype.
9. Never invent statistics, savings figures, quotes or Visa API details.
10. If Claude fails, show the error as a step and keep the rules working. Never fake a Claude answer.

## Real and simulated

| Part | Status |
| --- | --- |
| Policy engine, tiers, ranking, caps | Real, in reducers, tested |
| Agent cannot approve | Real, on `ctx.sender`, checked live |
| Quote-bound atomic purchase, receipts | Real |
| Claude reasons and flags | Real when the key is set |
| Cancellation, flights, hotels | Simulated, replayed fixture, fictional names |
| Card token and payment | Simulated: a mock of controls Visa publicly describes. No Visa API, no money moves |
| Traveler | Fictional |

## Known limits

- No real booking, live fares or Visa integration.
- One US domestic cancellation scenario.
- No real sign-in. Any visitor can take the traveler seat.
- The free rebooking is taken as given.
- The refund line assumes the DOT automatic refund rule (in effect since October 2024) still applies.
- Claude needs a key and a network connection.

## Demo (about 90 seconds, locked)

**Seed:**
- Traveler: Sam (fictional).
- Trip: Bayline Air 412, SFO to JFK, 6:40 PM.
- Deadline: arrive JFK by 9:00 AM.
- Fare: $318.
- Mandate:
  - $600 trip cap
  - ask above $250
  - airlines and hotels only
  - auto ceiling $0

**Beats:**
1. The flight is canceled.
2. Steps stream in.
3. Ranked options appear:
   - Harbor Air red-eye, $389
   - Bayline's free rebooking, which misses 9 AM
   - Coastal, which misses 9 AM
   - Airport Inn
   - Set aside: business class at $1,140 (over cap), and Skyport Suites (its listing tried to instruct the agent)
4. The agent tries to buy the flight itself and is refused live.
5. The price changes to $412, so the $389 approval is refused. Sam approves $412.
6. Booked, with a receipt. $412 of $600 spent.
7. "$318 refund owed for the canceled ticket", plus the time from cancel to booked.

`scripts/demo-check.ts` replays every beat against the live database with no UI. It also checks the agent refusal, the stale quote, the cap, the receipt chain and that no personal data is public. It is the only check script. `tests/policy.test.ts` is the only test file.

## Conventions

- TypeScript strict. Small pure functions for rules, ranking, quote hashing, token checks and receipts, all unit tested.
- Every Claude output is validated with zod, with one retry.
- No `Date.now` or `Math.random` in reducers. Use `ctx.timestamp`.
- Demo reset is a reducer (`pnpm demo:reset`), never `spacetime publish -c` on the live database.
- Prose, copy and comments: plain and specific. No em dashes, no emojis.
- Commands: `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm demo:reset`, `pnpm spacetime:publish`, `pnpm spacetime:generate`.

## Cut order if behind

1. The price-change beat.
2. Claude's per-offer reasons (keep the flags).
3. Step pacing and extra step text.

Submit a working Devpost entry by hour 12, then use the buffer to improve it.

**Never cut:**
- the agent refusal
- the quote-bound approval
- the receipts
- the Skyport flag
- reset
