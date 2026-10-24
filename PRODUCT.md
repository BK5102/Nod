# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Backend:
- Next.js server routes (App Router, TypeScript strict) on Vercel.
- A SpacetimeDB TypeScript module on Maincloud holds the tables, reducers and the view.
- Anthropic API (`claude-sonnet-5-5`).
- zod and Vitest.

Frontend stack choices belong to the frontend teammate.

## Users

**Primary:** a traveler whose flight was just canceled. They are standing in an airport, short on time, with a deadline on the other end (in the demo, Sam must land at JFK by 9:00 AM). Their job is to get home on time without overpaying and without approving something they did not mean to.

**Evaluating audience:** Cal Hacks 13.0 judges for Visa's "Best use of Reimagining Shopping" track. They score:
- Innovation 25%
- User experience 25%
- Technical execution 20%
- Commerce impact 15%
- Trust and responsibility 15%

## Product Purpose

When your flight is canceled, you have about 20 minutes to buy your way home before the good options sell out, and today you do it alone, on a phone, in a gate line, with no one checking that you are not overpaying.

Rerouted is a shopping agent for that moment. It checks the free rebooking first, compares paid flights and a hotel, and ranks them against the deadline. It buys only within the card's rules at the exact price the traveler approved.

**Success:** cancellation to ranked options in under 10 seconds, booking in one tap, and zero purchases outside the card's rules.

## Positioning

Airlines rebook you on their own flights. Search sites make you shop alone. Visa's agent controls are rails, not a product for this moment. Rerouted is the traveler's agent across airlines, with the card's own rules enforced below the agent, in the database.

## Operating Context

These are the backend inputs:
- one simulated cancellation, triggered by the operator
- replayed flight and hotel offers from `data/fixtures/demo.json`, with fictional names
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
  - the cancellation, flights and hotels
  - the card token
  - the payment
- Not built:
  - real booking
  - live fares
  - Visa API integration
  - real sign-in

## Brand Commitments

Name: Rerouted.

Tagline: "Your flight got canceled. Rerouted shops your way home within your card's rules, and you approve with one tap."

Copy is plain and specific. No em dashes, no emojis.

## Evidence on Hand

- Sourced public facts only:
  - Visa's published agent controls
  - the DOT 2025 cancellation rate
  - the DOT automatic refund rule (sources in README)
- Every demo number comes from seeded, fictional data.
- No customers, quotes or savings figures exist. Never invent them.

## Product Principles

1. Free first. Spend money only when the free option misses the deadline.
2. The card's rules decide what can be bought. The agent only shops and explains.
3. A yes covers one exact price, nothing more.
4. Every purchase leaves a receipt a stranger can check.
5. Personal data never leaves private storage.

## Accessibility & Inclusion

Owned by the frontend teammate. Backend support: every refusal returns a plain-English message meant to be shown as is, and approval is a single call.
