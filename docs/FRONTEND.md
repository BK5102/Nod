# Rerouted frontend plan

Owner: frontend. Backend contract: `docs/PLAN.md` section 9 (read only). This file is the frontend's own plan.

## 1. Who it is for, and what the design has to say

- **The traveler:** stranded at a gate after a cancellation, on a phone, standing in a line, with minutes before the good seats go. They need the next decision, big, with the time it saves and what it costs against their card's rules.
- **The judges (Visa, Reimagining Shopping):** watching a 90 second live demo on a laptop or projector. They need to see the agent shop, the card's rules decide, the agent get refused, the price change void an approval, and a receipt that adds up.

The design speaks the traveler's own language: **the airport sign system**. Yellow sign panels with black letters are what a person follows in a terminal when they are lost and late. Rerouted is that sign, but for the way home after a cancellation: it shows only the choices ahead, says in minutes how each one stands against your deadline, and drops the routes that are closed.

## 2. Brand

| Part | Choice | Why |
| --- | --- | --- |
| Name and mark | "Rerouted" in bold humanist sans beside a black square pictogram of a plane turning back on a new heading | Signage grammar: pictogram in a black inset square, word beside it |
| Yellow `#FFCC00` | The path. Panels you can follow and act on: the next decision, option panels, the approve button frame, the booked route | Terminal wayfinding reserves yellow for routes to gates and nothing else; here it is reserved for routes home |
| Sign black `#0B0B0B`, panel frame `#1A1A1A` | Information and state: the live board, the agent's steps, refusals, set aside routes, the 3D corridor | In terminals, dark panels carry information that is not a route |
| White `#FFFFFF` | Pictograms and text on black | |
| Surface gray `#E6E6E6` | Quiet ground between bands on phones, inputs | |
| Alert red `#FF5A4E` | Only on black: CANCELED, refused stamps | A board's canceled flag. Never on yellow (fails contrast) |
| Type | Source Sans 3 (humanist, Frutiger lineage, tabular figures) for everything; Source Code Pro only for the live board cells and the receipt hashes | Airport signs are set in Frutiger-cut humanist sans; times and prices need tabular figures; the board and hashes are real data |
| Icons | Authored SVG pictograms, filled, white on black squares: depart, arrive, bed, card, refund, closed, clock | One drawn set in the sign system's weight; no icon library look |

Rules: no gradients, no glow, no glass, no eyebrow labels, no emoji, no em dashes. Corners are square or 2px (sign panels). Shadows only on the one floating element (the demo controls).

## 3. The surface (one page, `/`)

Desktop (1440): an overhead yellow **sign band** across the top (sticky), then two columns.

- **Sign band (top, sticky):** the one next decision in monumental type, re-signed at every state. Split-flap update on change.
  - scheduled: "Bayline Air 412 to JFK. Departs 6:40 PM"
  - canceled: "Bayline 412 is canceled. Finding you a way to JFK by 9:00 AM"
  - options_ready: "4 ways to JFK. 1 lands before 9:00 AM"
  - booked: "Booked: Harbor Air red-eye. Lands 6:45 AM"
  - Right side: time since cancellation, ticking (the Mass Panic point: minutes matter), then "Canceled to booked 0:52" once booked.
- **Left column (wide):**
  - **The deadline corridor (three.js, the signature moment):** a black panel. A time axis runs from tonight to tomorrow afternoon. The 9:00 AM deadline stands as a yellow overhead sign frame. The canceled flight's arc breaks and falls in red. Each option's arc launches at its departure and lands at its arrival, so routes that make it under the deadline frame land before it and late ones land past it. Blocked routes fall through the floor and drop off. The approved route turns yellow and a plane pictogram flies it.
  - **The live board:** the agent's steps as board rows (time, kind, text), streaming in. Refusals print in red on black. Claude errors print as error rows, never faked.
- **Right column (phone width, the traveler's view):**
  - **Choices ahead:** ranked option panels in yellow. Each one has the same fixed furniture: a monumental rank numeral, a pictogram, carrier and title, depart to arrive times, minutes before or after the deadline, the price, the card's rules that fired (tier and reasons), Claude's one sentence reason, and one Approve button that names the price.
  - **Set aside:** a black band. Business class over cap, Skyport Suites flagged because its listing tried to instruct the agent. Shown with their reasons, never hidden.
  - **Your card's rules:** the mandate as a sign: $600 trip cap with a spend meter, ask above $250, airlines and hotels only, token ending 4242 (SIMULATED).
  - **Receipt:** after booking, a receipt slip: merchant, amount, tier, rules, approved by traveler, quote hash, token last 4, previous hash and hash (chain). Then the refund line: "$318 refund owed for the canceled ticket, within 7 business days."
- **Demo controls:** a small black floating strip at the bottom left, labeled "Demo controls. Simulated events": Reset, Cancel the flight, Let the agent try to buy, Price moves as Sam taps approve. Keyboard: R, C, A, P.
- **What is real:** a short footnote band. Real: rules, tiers, ranking, refusal, quote-bound purchase, receipts, Claude reasons. Simulated: the cancellation, flights and hotels, the card token and payment. Prototype.

Phone (390): the sign band shrinks to the single next decision with the key number monumental. The corridor shrinks to 240px tall. Then choices, set aside, rules, receipt, board. Demo controls become a bottom strip.

## 4. Every demo beat, in the UI

| Beat | What the viewer sees |
| --- | --- |
| Canceled | Band flips to the canceled message; the board prints CANCELED in red; the original arc breaks and falls; the cancel clock starts |
| Steps stream | Board rows arrive one by one; the corridor draws search arcs as offers are found |
| Ranked options | Panels arrive in rank order; set aside band fills with two reasons; arcs settle in place against the deadline frame |
| Agent tries to buy | The rank 1 panel gets a red on black stamp: "Refused: the agent cannot approve its own purchase."; a refusal row on the board |
| Price change | Rank 1 price flips $389 to $412; Sam's old approval is refused with "The price changed to $412. Approve the new price to continue."; the button now says Approve $412 |
| Booked | The chosen panel locks as the followed route; others dim; the arc turns yellow and the plane flies; the spend meter fills to $412 of $600; the receipt prints |
| Refund and time | "$318 refund owed for the canceled ticket"; "Canceled to booked 0:52" |

Every refusal message from PLAN.md section 9 is shown exactly as the reducer throws it.

## 5. Data layer (built)

- `components/rerouted/types.ts`: the section 9 tables as the components read them.
- `components/rerouted/live.tsx`: subscribes to `trip`, `mandate`, `offer`, `agent_step`, `receipt`, `seat`; takes the traveler seat (`act_traveler`); calls `approve_offer` from the browser and shows its error as is; posts to `/api/demo` and `/api/agent/try-approve`.
- `components/rerouted/mock.ts`: replays `data/fixtures/demo.json` through the backend's own pure core (`evaluateOffer`, `rankOffers`, `quoteHash`, `hashReceipt`), so tiers, ranks, hashes and refusal strings match the module. No Claude in mock: reasons stay empty.
- Mode: live when `NEXT_PUBLIC_SPACETIMEDB_DB_NAME` is set. `?mock=1` forces the mock. If the live database sends no trip within 8 seconds, the page says why in the footer and runs the mock.
- The receipt chain is recomputed in the browser with `verifyReceipts` and the result is printed under the receipt.
- Rehearsal: `?to=options|agent|price|booked` plays the demo up to that beat. Presenter keys: R reset, C cancel, A agent tries to buy, P price moves as Sam taps approve.

Contract note for the backend: PLAN.md section 9 says `take_seat(actorId: "traveler")`; the module seeds `act_traveler`. The frontend uses `act_traveler`.

Verified on Oct 24 against the module published to a local SpacetimeDB (`rerouted-local`): cancel, steps, Claude reasons, Skyport flag, agent refused, price $389 to $412, booked at $412, receipt chain verified, $318 refund, 7 seconds from cancel to booked.

## 6. Work list

Done: plan, sign system tokens and pictograms, the deadline corridor, the page and its components, Nod pages removed, live adapter, mock on the real fixture.

Loop tasks (repeatable, good for `/loop`):
1. Pull. If the backend changed `spacetimedb/` or `src/module_bindings/`, republish to the local server, run `pnpm db:setup` against it, play `?to=booked`, screenshot desktop and phone, fix what broke, push.
2. Once the backend publishes to Maincloud: point `.env.local` at it, play the demo live, time each beat.
3. Run the design detector on `components/` and `app/` and fix findings.

Needs the user: `spacetime login` for Maincloud (backend side).

## 7. Routes and sign-in (added Oct 24)

| Route | What it is |
| --- | --- |
| `/` | Landing page. The hero replays the demo in the corridor on a private mock engine, with captions per beat. It never touches the live database |
| `/login` | Admin sign-in |
| `/dashboard` | The agent workspace (live or mock), behind sign-in |

Sign-in is frontend only: a server action checks the admin email and an scrypt password hash, then sets a signed, http-only session cookie (HMAC-SHA256, 12 hours). `middleware.ts` sends unsigned visitors from `/dashboard` to `/login`, and the dashboard page checks the session again. There is no registration: the admin account is created by hand.

Env (server only, never committed), kept in `.env.development.local` so `.env.local` is never rewritten. For a deploy, set the same three in the host's environment:

- `REROUTED_ADMIN_EMAIL`
- `REROUTED_ADMIN_PASSWORD_HASH` (`scrypt:<salt hex>:<hash hex>`)
- `REROUTED_AUTH_SECRET`
