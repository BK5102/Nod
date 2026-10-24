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

## 5. Data layer

- `components/rerouted/types.ts`: the section 9 tables as TypeScript types.
- `components/rerouted/mock.ts`: a local engine that replays the locked demo with the same tables, the same tiers and ranks, and the exact refusal strings. The page shows "Mock data. Backend not connected" while it is in use.
- `components/rerouted/live.ts` (after B1): reads the generated bindings with `useTable`, calls `take_seat` and `approve_offer`, and posts to `/api/demo` and `/api/agent/try-approve`. Same state shape, so the components do not change.
- Mode: live when `NEXT_PUBLIC_SPACETIMEDB_DB_NAME` is set and the bindings are Rerouted's; `?mock=1` forces the mock.

## 6. Work list

Long tasks (started first):
1. The deadline corridor scene (three.js): arcs from offer data, deadline frame, break and fall, drop off, booked fly-through, reduced motion, render on demand.
2. Tokens, fonts and pictograms for the sign system.
3. The page and its components against the mock engine.
4. Remove Nod's pages and components (they import Nod's bindings and will break the build once B1 lands).

Loop tasks (repeatable, good for `/loop`):
1. Pull and check for the backend's B1 commit (new `src/module_bindings` with `trip`, `offer`, `agent_step`; `data/fixtures/demo.json`). When it lands: write `live.ts`, compare the fixture to the mock, typecheck, build, push.
2. After each backend milestone (B2 to B4): run the demo against Maincloud, screenshot desktop and phone, fix what broke, push.
3. Run the design detector and fix findings.
4. Rehearse the 90 second demo with the demo controls and time each beat.

Needs the user: the Anthropic key and Maincloud login on the backend side; nothing on the frontend side.
