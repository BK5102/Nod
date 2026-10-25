# Rerouted

Your flight got canceled. Rerouted shops your way home within your card's rules, and you approve with one tap.

A prototype built at Cal Hacks 13.0 for Visa's **Best use of Reimagining Shopping** track. This README covers the backend. Frontend notes are added by the frontend teammate.

## The problem

When your flight is canceled, you have about 20 minutes to buy your way home before the good options sell out, and today you do it alone, on a phone, in a gate line, with no one checking that you are not overpaying.

## The idea

Rerouted is a shopping agent for the worst 20 minutes of a trip. When a flight is canceled, the agent:
1. checks the airline's free rebooking first
2. compares paid flights and a hotel
3. ranks them against your deadline
4. explains each in one sentence

You approve one option with one tap. It is bought only if it fits the rules on your card (trip cap, ask-first threshold, allowed categories) at the exact price you approved.

## Why now

- **Agents can now pay under cardholder rules.** Visa's agent platform lets consumers set spending caps, restrict merchant categories or require real-time approval ([CDO Magazine](https://www.cdomagazine.tech/aiml/visas-new-platform-lets-ai-agents-buy-things-for-customers)). In June 2026 Visa announced these controls for agent payments in ChatGPT ([Axios](https://axios.com/2026/06/10/visa-chatgpt-agents-commerce)).
- **Cancellations are rising.** The US cancellation rate was 1.5% in 2025, up from 1.4% in 2024, per the DOT ([Business Travel Executive](https://www.businesstravelexecutive.com/news/us-air-cancellation-rates-up-in-december-and-for-all-of-2025-says-dot/)). PIRG calls 2025 the worst on-time year since 2014 ([PIRG](https://pirg.org/colorado/media-center/new-report-on-time-arrivals-in-2025-hit-worst-level-since-2014/)).
- **The refund is now automatic, so the hard part is the replacement purchase.** Since October 2024 the DOT requires automatic refunds for canceled flights ([ABC11](https://abc11.com/amp/post/us-airlines-required-automatically-refund-significantly-changed-canceled-flight/15483534/)).

## How it is solved today

| Who | What they do | What is left open |
| --- | --- | --- |
| The airline | Free rebooking on its own flights | Often the next day, never a competitor's seat |
| Airline AI assistants | Status and rebooking help | Same airline, same incentive |
| Google Flights, Kayak | Search and alerts | You still shop and buy alone, with no spending guardrails |
| Visa Intelligent Commerce | Agents pay within user caps and approvals | Rails, not a product for this moment |
| DOT refund rule | Refunds the canceled ticket | Says nothing about getting home tonight |

We did not find a product that compares the free rebooking with paid options against your deadline, across airlines, and buys within your card's rules. We have not checked exhaustively.

## Moat

At a hackathon, none of this is a moat yet. These are the parts that would get harder to copy:
1. **Rules enforced below the agent.** Caps and approvals live in database reducers keyed to the caller's identity, not in a prompt.
2. **Quote-bound approvals with a receipt chain.** That is the record a card issuer needs for disputes, so issuers could offer Rerouted to their own cardholders.
3. **Traveler-side, across airlines.** An airline will not recommend a competitor's seat.

## How the backend works

SpacetimeDB holds every rule, role check and receipt in reducers and tables. Next.js server routes hold the secrets, the Claude call and the demo controls.

1. **Cancel.** The operator cancels the flight. The agent loads the replayed flight and hotel offers and streams its steps as rows.
2. **Explain and flag.** One Claude call writes a one-sentence reason per offer and flags suspicious listings. Claude never sets a tier or a rank.
3. **Tier and rank.** The `submit_offers` reducer runs the policy engine against the card's rules:
   - **BLOCK** if over the cap or the wrong category.
   - **ASK** if over the ask-first threshold, a free option exists, or it misses the deadline.
   - Claude flags can only raise a tier.
4. **Approve and pay.** The traveler calls `approve_offer(offerId, quoteHash)`. In one atomic transaction it checks:
   - the caller's role
   - the tier
   - the exact quote
   - expiry
   - the trip cap
   - one flight per trip
   - the mock card token

   Then it books and appends a hash-chained receipt. If any check fails, nothing changes.

Full plan: [docs/PLAN.md](docs/PLAN.md). Backend contract for the frontend: section 9.

## Security, reliability, privacy

**Security**
- The agent identity can never approve a purchase. This is enforced in the reducer on the caller's identity and refused live in the demo.
- Each approval is bound to one quote hash, so a price change voids it.
- Caps are checked by the policy engine, by `approve_offer`, and again by the mock card token.
- Listing text is untrusted. One seeded hotel listing tries to instruct the agent, and it is flagged and set aside.
- Secrets are server-only env vars. `scripts/secret-check.sh` runs before submission.

**Reliability**
- Default to no. Every failed check reverts the whole transaction.
- If Claude fails, the error is shown, the rules still work, and nothing is bought without a tap.
- The demo is deterministic. Fixtures are replayed, reset is one reducer, and `scripts/demo-check.ts` replays the whole demo against the live database.

**Privacy**
- Name, email, booking reference, loyalty number and card data live only in private tables.
- Public tables and receipts hold none of it. Receipts show only the token's last 4.
- Claude receives offers and rules, never personal data. `scripts/demo-check.ts` asserts that no public row contains the seeded personal data.

## What is real and what is simulated

| Part | Status |
| --- | --- |
| Policy engine, tiers, ranking, caps | Real, in SpacetimeDB reducers, unit tested |
| Agent cannot approve | Real, enforced on the caller's identity, checked live |
| Quote-bound atomic purchase, hash-chained receipts | Real |
| Claude reasons and listing flags | Real when `ANTHROPIC_API_KEY` is set; errors shown, never faked |
| Cancellation | Simulated, triggered by the operator |
| Flights | Real search: live Duffel flight API (FLIGHT_PROVIDER=duffel). In Duffel test mode the fares are sandbox data; a live-mode token returns real airline inventory. Saved demo offers are the default and the fallback |
| Free rebooking, hotels | Simulated, fictional names (the free rebooking comes from the airline, not a search API) |
| Booking and payment | Simulated by design, also in production: every rule is checked for real, then the booking and receipt are recorded in the database. No ticket is issued, no money moves. Mock card modeled on controls Visa publicly describes, no Visa API |
| Traveler | Fictional |

## Known limitations

- No real booking, live fares or Visa integration. Visa Intelligent Commerce access goes through a partner program.
- One scenario: one traveler, one US domestic cancellation, one deadline.
- No real sign-in. Any visitor can take the traveler seat; the agent and operator seats are locked.
- The airline's free rebooking is taken as given.
- The refund line assumes the DOT automatic refund rule still applies.
- No savings or accuracy figures. Every number in the demo comes from seeded data.
- Claude needs an API key and a network connection.

## The demo (about 90 seconds)

**Seed:**
- Sam (fictional) is on Bayline Air 412, SFO to JFK, 6:40 PM.
- Sam must land by 9:00 AM.
- The card allows $600 for the trip, asks above $250, and covers airlines and hotels only.

**Beats:**
1. The flight is canceled.
2. The agent's steps stream in.
3. Ranked options appear:
   - Harbor Air red-eye, $389
   - Bayline's free rebooking, which lands too late
   - Coastal, which lands too late
   - Airport Inn
   - Set aside: business class (over cap), and Skyport Suites (its listing tried to instruct the agent)
4. The agent tries to buy the flight itself and the database refuses it.
5. The price changes to $412, so the old approval is refused. Sam approves $412.
6. Booked, with a receipt, and $412 of $600 spent.
7. The $318 refund owed on the canceled ticket.

## Run the live demo (teammate quickstart)

The backend is already live on Maincloud as the database `rerouted-calhacks13`. Seats are assigned and the demo is seeded. You do not publish, run `db:setup`, or log in to SpacetimeDB. You only need the env file and the dev server.

1. Pull and install:
   ```bash
   git pull
   pnpm install
   ```
2. Create `.env.local` in the repo root with these 7 values. The first four are not secret and are shown here. Get the last three from the backend teammate through a private channel. Never commit them or paste them in a public chat.
   ```bash
   SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com
   SPACETIMEDB_DB_NAME=rerouted-calhacks13
   NEXT_PUBLIC_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com
   NEXT_PUBLIC_SPACETIMEDB_DB_NAME=rerouted-calhacks13
   SPACETIMEDB_AGENT_TOKEN=<from backend teammate>
   SPACETIMEDB_OPERATOR_TOKEN=<from backend teammate>
   ANTHROPIC_API_KEY=<from backend teammate, or your own key>
   ```
3. Start the app on http://localhost:3001:
   ```bash
   pnpm dev
   ```
4. Optional: prove the backend works end to end with no UI. Run this in a second terminal while `pnpm dev` is running. It ends with "All checks passed." It also leaves the trip booked, so reset afterwards.
   ```bash
   pnpm demo:check
   pnpm demo:reset
   ```

**What a working end-to-end run looks like.** Each step is driven by the backend:

| Step | What happens | Backend call |
| --- | --- | --- |
| 1. Reset | Bayline Air 412, SFO to JFK, 6:40 PM, is scheduled | `POST /api/demo {"action":"reset"}` |
| 2. Cancel | The flight is canceled, and about 7 agent steps stream in over 6 to 10 seconds | `POST /api/demo {"action":"cancel"}` |
| 3. Options appear | Ranks 1 to 4: Harbor Air red-eye $389, Bayline free rebooking, Coastal 6:00 AM, Airport Inn. Set aside: business class ($1,140, over cap) and Skyport Suites (flagged by Claude for instructing the agent) | `offer` rows |
| 4. Agent tries to buy | The red-eye purchase is refused: "Refused: the agent cannot approve its own purchase." | `POST /api/agent/try-approve {"offerId":"off_harbor_redeye"}` |
| 5. Price change | The red-eye goes to $412. Approving the old quote is refused with "The price changed to $412. Approve the new price to continue." | `POST /api/demo {"action":"price","offerId":"off_harbor_redeye","priceCents":41200}` |
| 6. Approve | The traveler approves $412 and it books. One receipt; spend is $412 of $600 | `approve_offer(offerId, quoteHash)` from the browser, as the traveler seat |
| 7. Refund | $318 refund owed, plus the canceled and booked times | `trip` row |

**Notes:**
- **Who changes the data:** both laptops connect to the same live database, so a reset or cancel on one laptop changes what the other sees. During judging, only one person should drive the demo.
- **Mock fallback:** if the page falls back to the mock, `NEXT_PUBLIC_SPACETIMEDB_DB_NAME` is missing or the dev server was started before `.env.local` existed. Restart `pnpm dev`.
- **Claude missing or out of credits:** cancel still works. You get an `error` step and no Claude reasons, and Skyport is not flagged. The rules still tier everything, and nothing is bought without a tap.
- **Routes:** every route returns `{ ok: true, result }` or `{ ok: false, error, refused }`. Show `error` as is. The full contract is in [docs/PLAN.md](docs/PLAN.md) section 9.

## Run it (backend, one-time setup, already done)

```bash
pnpm install
spacetime login                 # once; the publishing identity becomes the module admin
cp .env.example .env.local      # set SPACETIMEDB_DB_NAME and ANTHROPIC_API_KEY
pnpm spacetime:publish          # publish the module to Maincloud (first time: add the database name)
pnpm spacetime:generate         # regenerate src/module_bindings
pnpm db:setup                   # assigns the agent and operator seats, writes their tokens to .env.local, seeds the demo
pnpm test                       # tiers, ranking, flag merge, quote hash, mock token, receipt chain
pnpm typecheck:backend          # backend and module only
pnpm dev                        # the demo runs locally against Maincloud, on http://localhost:3001
pnpm demo:check                 # with dev running: replays the whole demo, plus role, quote, cap, chain and privacy checks
pnpm demo:reset                 # reset between runs
```

Never reset the live database with `spacetime publish -c`. Use `pnpm demo:reset`.

## Sources

- [CDO Magazine: Visa's agent platform](https://www.cdomagazine.tech/aiml/visas-new-platform-lets-ai-agents-buy-things-for-customers)
- [Axios: Visa and OpenAI, June 10, 2026](https://axios.com/2026/06/10/visa-chatgpt-agents-commerce)
- [Business Travel Executive: DOT 2025 cancellation rate](https://www.businesstravelexecutive.com/news/us-air-cancellation-rates-up-in-december-and-for-all-of-2025-says-dot/)
- [PIRG: 2025 on-time report](https://pirg.org/colorado/media-center/new-report-on-time-arrivals-in-2025-hit-worst-level-since-2014/)
- [ABC11: DOT automatic refunds](https://abc11.com/amp/post/us-airlines-required-automatically-refund-significantly-changed-canceled-flight/15483534/)
