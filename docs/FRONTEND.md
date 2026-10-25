# Rerouted frontend

Owner: frontend. Backend contract: `docs/PLAN.md` section 9 (read only). This file describes what is built.

## 1. Who it is for

**Travelers only.** The one user is the traveler whose flight was just canceled: standing in a gate line, short on time, with a deadline on the other end. Every screen shows them the next decision, how each way home stands against their deadline, and what it costs against their card's rules. Nothing is bought until they tap.

The judges (Visa, Reimagining Shopping) watch that traveler's screen in a 90 second live demo.

## 2. Routes

| Route | What it is |
| --- | --- |
| `/` | Landing page: the headline, a replay of the demo in the 3D time axis (a private mock engine on the saved offers, never the live database), four story beats, the traveler alone vs with Rerouted, and the route ahead |
| `/login` | Admin sign-in |
| `/dashboard` | The traveler's screen, live or mock, behind sign-in |

`/?static=1` shows every scroll reveal at once (for screenshots).

## 3. The dashboard

A light canvas with a left menu: Home (back to the landing page), Trip, Card and rules, Agent activity, What the agent saw, Receipts. Below the menu: the demo controls (each one triggers a simulated event; the next one is marked) and Sign out. Below laptop width the menu is hidden and a Home link sits above the headline.

**Trip view, at 1440x900 with no scrolling:**
- **Headline:** the one thing to know now, in the display face: On time, CANCELED (red, the flight struck through), "N ways home by 9:00 AM", or "Booked. Lands 6:45 AM". A clock on the right counts from the cancellation, then shows cancel to booked.
- **Every way home (three.js):** a time axis in New York time against the 9:00 AM deadline frame. The canceled flight's arc breaks and falls; each option's arc launches at its departure and lands at its arrival; the top route is yellow; set-aside routes drop off. With live flights the axis starts at the current hour, so flights later today fit. Drag to turn, scroll or pinch to zoom, double-click or Reset view to return, Expand for a near full-screen view (Escape closes).
- **Options (right column):** ranked cards. The top one carries the only accent: a yellow Approve button that names the price, the consent line ("Charges card •••• 4242 exactly $X. Nothing else is bought."), a "Why #1" line from the ranking and the card rule that asks you, and the agent's one sentence reason (labeled Agent). Others have an inline Approve. Times read "Today 1:43 PM to 10:29 PM" with how early or late they land.
- **Refusal:** the agent's own purchase attempt prints a red stamp on the option and a red step. **Price change:** the old price is struck through, and a box headed "Price changed after you approved" says the approval is void.
- **What the agent did:** the last three steps, each kind with its own marker (search, note, decision, refusal, flagged listing, error). Errors are pinned. Fixed height, so rows never shift the layout.
- **Set aside / card:** set-aside routes with their reasons (the Skyport listing quoted as untrusted text), otherwise the card meter ("$600 cap" until something is spent, then "$412 of $600").
- **Booked:** the receipt (airline, amount, who approved, fingerprint, chain link and a browser-side chain check), one line of what happened (options shown, which was chosen, cancel to booked), and "$318 refund owed for the canceled ticket".
- **Failed search:** "The flight search failed", the reason as the backend wrote it, "Nothing was bought", and a Search again button (reset, then cancel).

**Other views:** Card and rules (the card as an object with its rules), Agent activity (every step), What the agent saw (the trip, the card rules and every offer the search returned, listing text marked untrusted, and what is never sent), Receipts.

## 4. Design

- Dashboard: light canvas `#f3f4f7`, white cards with a hairline edge, near-black text; the 3D panel is a dark tile. One accent, yellow `#FFCC00`, on the next action and the top route only. Red only for refusals, voids and errors.
- Landing: the airport sign system, yellow sign panels on black.
- Type: Archivo (condensed, for the one big moment per screen: headline, prices, airports), Hanken Grotesk (text), IBM Plex Mono (times, fingerprints). Tabular figures everywhere.
- Pictograms are drawn SVGs, not an icon library. No gradients, glow, glass or emoji.
- Motion explains a change only: options slide in, prices flip, meters fill, stamps land. Reduced motion jumps to the end state.
- Keyboard focus is a near-black ring on the dashboard. Steps and refusals are live regions.

## 5. Data layer

- `components/rerouted/types.ts`: the section 9 tables as the components read them.
- `components/rerouted/live.tsx`: subscribes to `trip`, `mandate`, `offer`, `agent_step`, `receipt`, `seat`; takes the traveler seat (`act_traveler`); calls `approve_offer` from the browser and shows its error as is; posts to `/api/demo` and `/api/agent/try-approve`.
- `components/rerouted/mock.ts`: replays `data/fixtures/demo.json` through the backend's own pure core, so tiers, ranks, hashes and refusal strings match the module.
- `components/rerouted/format.ts`: reads the day labels on flight times ("Today", "Tonight", "Tomorrow", or a date such as "Mon Oct 26") onto one axis, Pacific date as day 0.
- Mode: live when `NEXT_PUBLIC_SPACETIMEDB_DB_NAME` is set. `?mock=1` forces the mock. If the live database sends no trip within 8 seconds, the page says why and runs the mock.
- Price beat: the top fare goes up $23 (the same move `scripts/demo-check.ts` makes). The void is matched to the offer by airline and new price, so it stays on the right flight after reranking.
- Rehearsal: `?to=options|agent|price|booked` plays the demo up to that beat. Keyboard: R reset, C cancel, A agent tries to buy, P price moves (the same as the demo controls in the menu).

## 6. Sign-in

A server action checks the admin email and an scrypt password hash, then sets a signed, http-only session cookie (HMAC-SHA256, 12 hours). `middleware.ts` sends signed-out visitors from `/dashboard` to `/login`, and the dashboard page checks the session again. There is no registration.

Env (server only, never committed), in `.env.local` with the other values. For a deploy, set the same three in the host's environment:

- `REROUTED_ADMIN_EMAIL`
- `REROUTED_ADMIN_PASSWORD_HASH` (`scrypt:<salt hex>:<hash hex>`)
- `REROUTED_AUTH_SECRET`

## 7. Checks

- `pnpm typecheck` and `pnpm demo:check` (with `pnpm dev` running) before every push to the demo.
- Screens of each demo state are in `docs/screens/`, with the audits in `docs/screens/README.md`.
