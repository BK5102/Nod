# Rerouted

Flight canceled? Rerouted finds your way home, and you approve with one tap.

A prototype built at Cal Hacks 13.0 for Visa's **Best use of Reimagining Shopping** track.

**Who it is for:** one person, the traveler whose flight was just canceled. Every screen, rule and receipt is built for them.

## The problem

When your flight is canceled, you have about 20 minutes to buy your way home before the good options sell out, and today you do it alone, on a phone, in a gate line, with no one checking that you are not overpaying.

## The idea

Rerouted is a shopping agent for the worst 20 minutes of a trip. When your flight is canceled, the agent:
1. searches real, current flights across airlines (Google Flights, through SerpApi)
2. ranks them against the time you need to land
3. checks each one against the rules on your card (trip cap, ask-first threshold, allowed categories)
4. explains each in one sentence

You approve one option with one tap. It is bought only if it fits your card's rules, at the exact price you approved.

## Why now

- **Agents can now pay under cardholder rules.** Visa's agent platform lets consumers set spending caps, restrict merchant categories or require real-time approval ([CDO Magazine](https://www.cdomagazine.tech/aiml/visas-new-platform-lets-ai-agents-buy-things-for-customers)). In June 2026 Visa announced these controls for agent payments in ChatGPT ([Axios](https://axios.com/2026/06/10/visa-chatgpt-agents-commerce)).
- **Cancellations are rising.** The US cancellation rate was 1.5% in 2025, up from 1.4% in 2024, per the DOT ([Business Travel Executive](https://www.businesstravelexecutive.com/news/us-air-cancellation-rates-up-in-december-and-for-all-of-2025-says-dot/)). PIRG calls 2025 the worst on-time year since 2014 ([PIRG](https://pirg.org/colorado/media-center/new-report-on-time-arrivals-in-2025-hit-worst-level-since-2014/)).
- **The refund is now automatic, so the hard part is the replacement purchase.** Since October 2024 the DOT requires automatic refunds for canceled flights ([ABC11](https://abc11.com/amp/post/us-airlines-required-automatically-refund-significantly-changed-canceled-flight/15483534/)).

## How a traveler handles it today

| Option | What it does | What is left open |
| --- | --- | --- |
| The airline | Free rebooking on its own flights | Often the next day, never a competitor's seat |
| Airline AI assistants | Status and rebooking help | Same airline, same incentive |
| Google Flights, Kayak | Search and alerts | You still shop and buy alone, with no spending guardrails |
| Visa Intelligent Commerce | Agents pay within user caps and approvals | Rails, not a product for this moment |
| DOT refund rule | Refunds the canceled ticket | Says nothing about getting home tonight |

We did not find a product that searches across airlines against your deadline and buys only within your card's rules, on your tap. We have not checked exhaustively.

## Moat

At a hackathon, none of this is a moat yet. These are the parts that would get harder to copy:
1. **Rules enforced below the agent.** Caps and approvals live in database reducers keyed to the caller's identity, not in a prompt.
2. **Quote-bound approvals with a receipt chain.** Each yes covers one flight at one price, and the traveler keeps a tamper-evident record of it.
3. **On the traveler's side, across airlines.** An airline will not recommend a competitor's seat.

## Why the receipt matters to the traveler (reasoning, not measurement)

This section is our reasoning. We have not measured disputes or tested this with any card issuer. If an agent can shop with your card, the questions you would ask afterwards are: did I agree to this, to this airline, at this price, and did software buy anything on its own? In Rerouted every approval is bound to a quote hash for one offer at one price, and a changed price voids it, so your yes can never stretch to cover a different amount. Each booking appends a hash-chained receipt with the airline, the amount, the quote hash, the rules that fired, that you (not the agent) approved, the card's last 4 and the time, plus the refund you are owed for the canceled ticket. The database refuses the agent's own approval on its identity. That gives you a record to point to if a charge is ever wrong. Whether a card issuer would accept it in a dispute is untested.

## How the backend works

SpacetimeDB holds every rule, role check and receipt in reducers and tables. Next.js server routes hold the secrets, the flight search, the Claude call and the demo controls.

1. **Cancel.** The operator cancels the flight (simulated). The agent searches real flights and streams its steps as rows. If the search fails, it says so and stops: no options, nothing bought, no made-up flights.
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

   Then it books (simulated) and appends a hash-chained receipt. If any check fails, nothing changes.

Full plan: [docs/PLAN.md](docs/PLAN.md). Backend contract for the frontend: section 9. Frontend: [docs/FRONTEND.md](docs/FRONTEND.md).

## The app

| Route | What it is |
| --- | --- |
| `/` | Landing page: the problem, a replay of the demo, what the traveler gets, and the route ahead |
| `/login` | Sign in to the dashboard (one admin account from env vars, signed session cookie) |
| `/dashboard` | The traveler's screen: the trip, every way home on a 3D time axis against the deadline (drag to turn, scroll to zoom, expand), ranked options with one-tap approve, the agent's steps, the card and its rules, what the agent saw, and receipts |

`/dashboard?mock=1` runs the same screen on the recorded real search in the browser, with no database.

## Security, reliability, privacy

**Security**
- The agent identity can never approve a purchase. This is enforced in the reducer on the caller's identity and refused live in the demo.
- Each approval is bound to one quote hash, so a price change voids it.
- Caps are checked by the policy engine, by `approve_offer`, and again by the mock card token.
- Listing text is untrusted. It is delimited in the prompt, and Claude is told to flag instructions inside it. The tests keep a hostile listing case (Skyport Suites).
- Secrets are server-only env vars. `scripts/secret-check.sh` runs before submission.

**Reliability**
- Default to no. Every failed check reverts the whole transaction.
- If Claude fails, the error is shown, the rules still work, and nothing is bought without a tap.
- If the flight search fails, the screen says so, nothing is bought, and the traveler can search again.
- Reset is one reducer, and `scripts/demo-check.ts` replays the whole demo against the live database, with live flights or the recorded search.

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
| Flights | Real. With FLIGHT_PROVIDER=serpapi, the agent shows only real, current flights from Google Flights via SerpApi (search only, it cannot book). If the search fails, no options are shown and nothing is bought; made-up offers never stand in. FLIGHT_PROVIDER=duffel gives Duffel sandbox fares |
| Recorded offers | Real: a recorded Google Flights search (SFO to JFK, recorded Oct 25, 2026) in `data/fixtures/demo.json`, replayed when FLIGHT_PROVIDER is unset. Not live, so fares may have changed |
| Free rebooking, hotels, Skyport Suites | Not shown anywhere in the app. They exist only as constructed rule cases in `tests/policy.test.ts`; Skyport Suites is the prompt-injection case |
| Price change | Simulated: the operator raises the top fare by $23 to show that a changed price voids the old approval |
| Booking and payment | Simulated by design, also in production: every rule is checked for real, then the booking and receipt are recorded in the database. No ticket is issued, no money moves. Mock card modeled on controls Visa publicly describes, no Visa API |
| Traveler, trip and card | Fictional |

## Known limitations

- No real booking or Visa integration. Visa Intelligent Commerce access goes through a partner program.
- One scenario: one traveler, one US domestic cancellation, one deadline.
- One admin sign-in for the dashboard, not traveler accounts. Any signed-in visitor takes the traveler seat; the agent and operator seats are locked.
- The airline's free rebooking and hotels are not searched live.
- The refund line assumes the DOT automatic refund rule still applies.
- No savings or accuracy figures. Every number on screen comes from the live search or the seeded trip and card.
- Claude and the flight search need API keys and a network connection.

## The demo (about 90 seconds)

**Seed:**
- A fictional traveler is on Delta DL 363, SFO to JFK, 4:15 PM. The flight is real; its cancellation is simulated.
- They must land at JFK by 9:00 AM.
- The card allows $600 for the trip, asks above $250, and covers airlines and hotels only.

**Beats (live flights):**
1. The flight is canceled.
2. The agent's steps stream in while it searches real flights.
3. Ranked real flights appear on the time axis, against the 9:00 AM deadline. Anything over the $600 cap is set aside.
4. The agent tries to buy the top flight itself, and the database refuses it.
5. The fare goes up $23 as the traveler taps approve, so the old approval is refused. The traveler approves the new price.
6. Booked, with a receipt, and the spend against $600.
7. The $318 refund owed on the canceled ticket.

With FLIGHT_PROVIDER unset, the same beats replay a recorded real search (Oct 25, 2026): four red-eyes on JetBlue, Delta and Alaska, all $382 and all landing before 9:00 AM. The price change there is $382 to $405.

## Run the live demo (teammate quickstart)

The backend is already live on Maincloud as the database `rerouted-calhacks13`. Seats are assigned and the demo is seeded. You do not publish, run `db:setup`, or log in to SpacetimeDB. You only need the env file and the dev server.

1. Pull and install:
   ```bash
   git pull
   pnpm install
   ```
2. Create `.env.local` in the repo root. The first five values are not secret and are shown here. Get the rest through a private channel. Never commit them or paste them in a public chat.
   ```bash
   SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com
   SPACETIMEDB_DB_NAME=rerouted-calhacks13
   NEXT_PUBLIC_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com
   NEXT_PUBLIC_SPACETIMEDB_DB_NAME=rerouted-calhacks13
   FLIGHT_PROVIDER=serpapi
   SPACETIMEDB_AGENT_TOKEN=<private>
   SPACETIMEDB_OPERATOR_TOKEN=<private>
   ANTHROPIC_API_KEY=<private>
   SERPAPI_KEY=<private>
   REROUTED_ADMIN_EMAIL=<private>
   REROUTED_ADMIN_PASSWORD_HASH=<private, scrypt:salt:hash>
   REROUTED_AUTH_SECRET=<private>
   ```
   Restart `pnpm dev` after any change to `.env.local`; the server reads it only at start.
3. Start the app on http://localhost:3001 and sign in at `/login`:
   ```bash
   pnpm dev
   ```
4. Optional: prove the backend works end to end with no UI. Run this in a second terminal while `pnpm dev` is running. It ends with "All checks passed." It also leaves the trip booked, so reset afterwards.
   ```bash
   pnpm demo:check
   pnpm demo:reset
   ```

**What a working end-to-end run looks like (live flights).** Each step is driven by the backend:

| Step | What happens | Backend call |
| --- | --- | --- |
| 1. Reset | Delta DL 363, SFO to JFK, 4:15 PM, is scheduled | `POST /api/demo {"action":"reset"}` |
| 1b. Shuffle (optional) | Another real flight from the recorded search replaces it, for example United UA 1278, SFO to ORD | `POST /api/demo {"action":"shuffle"}` |
| 2. Cancel | The flight is canceled; the agent searches real flights and its steps stream in over a few seconds | `POST /api/demo {"action":"cancel"}` |
| 3. Options appear | Real flights, ranked: those landing before 9:00 AM first, then cheaper first. Over the cap is set aside | `offer` rows |
| 4. Agent tries to buy | The top flight's purchase is refused: "Refused: the agent cannot approve its own purchase." | `POST /api/agent/try-approve {"offerId":"<top offer>"}` |
| 5. Price change | The top fare goes up $23. Approving the old quote is refused with "The price changed to ... Approve the new price to continue." | `POST /api/demo {"action":"price","offerId":"<top offer>","priceCents":<fare + 2300>}` |
| 6. Approve | The traveler approves the new price and it books. One receipt; spend shown against $600 | `approve_offer(offerId, quoteHash)` from the browser, as the traveler seat |
| 7. Refund | $318 refund owed, plus the canceled and booked times | `trip` row |

**Notes:**
- **Who changes the data:** every laptop connects to the same live database, so a reset or cancel on one changes what the others see. During judging, only one person should drive the demo.
- **Mock fallback:** if the page falls back to the mock, `NEXT_PUBLIC_SPACETIMEDB_DB_NAME` is missing or the dev server was started before `.env.local` existed. Restart `pnpm dev`.
- **Flight search failed:** the dashboard says so, shows no options and buys nothing. Press "Search again". Check `SERPAPI_KEY`, or unset `FLIGHT_PROVIDER` to replay the recorded search.
- **Claude missing or out of credits:** cancel still works. You get an `error` step and no Claude reasons. The rules still tier everything, and nothing is bought without a tap.
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
