# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Backend:
- Next.js server routes (App Router, TypeScript strict) on Vercel.
- A SpacetimeDB TypeScript module on Maincloud holds the tables, reducers and the view.
- Anthropic API (`claude-sonnet-5-5`).
- Live flight search: Google Flights via SerpApi (search only).
- zod and Vitest.

Frontend: Next.js pages, Tailwind 4, three.js for the time axis, `spacetimedb/react` for live tables. Details in `docs/FRONTEND.md`.

## Users

**The only audience: travelers.** A traveler whose flight was just canceled. They are standing in an airport, short on time, with a deadline on the other end (in the demo, they must land at JFK by 9:00 AM). Their job is to get home on time without overpaying and without approving something they did not mean to. Card issuers, airlines and hotels are not target users; the product is on the traveler's side.

**Evaluating audience:** Cal Hacks 13.0 judges for Visa's "Best use of Reimagining Shopping" track. They score:
- Innovation 25%
- User experience 20%
- Technical execution 20%
- Commerce impact 20%
- Trust and responsibility 15%

## Product Purpose

When your flight is canceled, you have about 20 minutes to buy your way home before the good options sell out, and today you do it alone, on a phone, in a gate line, with no one checking that you are not overpaying.

Rerouted is a shopping agent for that moment. It searches real, current flights across airlines, ranks them against the deadline, and buys only within the card's rules at the exact price the traveler approved.

**Success:** cancellation to ranked options in under 10 seconds, booking in one tap, and zero purchases outside the card's rules.

## Positioning

Airlines rebook you on their own flights. Search sites make you shop alone. Visa's agent controls are rails, not a product for this moment. Rerouted is the traveler's agent across airlines, with the card's own rules enforced below the agent, in the database.

## Operating Context

These are the backend inputs:
- one simulated cancellation, triggered by the operator
- real, current flights from Google Flights via SerpApi (FLIGHT_PROVIDER=serpapi); if the search fails, no options are shown and nothing is bought
- saved demo offers in `data/fixtures/demo.json` (free rebooking, flights, hotels, the Skyport listing), fictional names, used offline and in tests
- a mandate (trip cap, ask-first threshold, auto ceiling, allowed categories)
- a mock card token in a private table

The frontend reads public tables live through SpacetimeDB subscriptions, and calls two reducers (`take_seat`, `approve_offer`) and four server routes. The contract is in `docs/PLAN.md` section 9.

## Capabilities and Constraints

- The policy engine sets the tier (AUTO, ASK, BLOCK) and the rank. Claude only explains and flags, and a flag can only raise a tier.
- The agent can never approve a purchase. This is enforced on the caller's identity in reducers.
- Approval is bound to a quote hash. A price change voids it.
- Default to no. Any failed check reverts the whole transaction.
- Listing text is untrusted input.
- Personal data stays in private tables and never reaches Claude.
- Simulated:
  - the cancellation and the price change
  - the saved demo offers (free rebooking, hotels, Skyport)
  - the card token
  - the payment and booking
- Not built:
  - real booking
  - live hotel search or live free rebooking
  - Visa API integration
  - traveler accounts (one admin sign-in protects the dashboard)

## Brand Commitments

Name: Rerouted.

Tagline: "Flight canceled? Rerouted finds your way home, and you approve with one tap!"

Copy is plain and specific. No em dashes, no emojis.

## Evidence on Hand

- Sourced public facts only:
  - Visa's published agent controls
  - the DOT 2025 cancellation rate
  - the DOT automatic refund rule (sources in README)
- Fares come from the live search; the trip, card and refund are seeded, fictional data.
- No customers, quotes or savings figures exist. Never invent them.

## Product Principles

1. The deadline first. Rank every way home by whether it lands in time, then by price.
2. The card's rules decide what can be bought. The agent only shops and explains.
3. A yes covers one exact price, nothing more.
4. Every purchase leaves a receipt a stranger can check.
5. Personal data never leaves private storage.

## Accessibility & Inclusion

Every refusal returns a plain-English message shown as is, and approval is a single call. The dashboard has visible keyboard focus, keyboard presenter keys, live regions for steps and refusals, AA contrast on text, and honors reduced motion (the 3D scene jumps to its end state).
