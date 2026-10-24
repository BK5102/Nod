# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router), TypeScript strict, Tailwind, hand-installed shadcn/ui, SpacetimeDB (TypeScript module, Maincloud), Anthropic API, three.js, Vercel. Decided before the build; SpacetimeDB replaced Supabase on Oct 23, 2026.

## Users

Primary: anyone who pays vendors with a small team and limited controls, such as small nonprofits, clubs, family businesses and small offices. The demo shows Eastbay Community Pantry, a fictional organization, with a finance lead who approves and a controller who calls vendors back.

Evaluating audience: Cal Hacks 13.0 judges (Hyphenate, Spacetime, Microsoft) watching a live demo, who may hand over their own invoice.

## Product Purpose

Nod is a robot bookkeeper that won't send your money to a scammer's new bank account. It reads vendor invoices, lets rules set the risk tier, pays routine bills inside a fixed limit, and stops for a person before paying a new account. Success: the changed-bank-details invoice is held, a shaky yes never moves money, and every decision can be defended from its receipt.

## Positioning

Detecting a changed bank account is already offered by mainstream accounts payable tools, and finance platforms already route exceptions to a person. Nod focuses on the step after the flag, the human yes: the agent cannot approve itself, a shaky yes is evidence, and each receipt records how reliable the approval was. To our knowledge, recording approval reliability is uncommon. Never claim otherwise without checking.

## Operating Context

Invoices arrive as pasted text, email, photos and PDFs. Vendors, purchase orders and contracts sit behind them. A double-entry ledger reconciles with the bank (MockBank). Nacha's False Pretenses rule (phase 2, June 2026) is the regulatory backdrop; Nod does not make anyone compliant.

## Capabilities and Constraints

- Rules in the database set the tier (AUTO, ASK, HOLD). Claude can only raise it.
- The agent cannot approve or edit bank details, enforced in SpacetimeDB reducers on the caller's identity.
- Default to no: timeouts, errors and ambiguity never move money.
- Invoice content is untrusted input.
- The approval signal is SIMULATED and labeled. No brain-computer interface or accuracy claims.
- Real sign-in is not built; human seats are open in the demo.

## Brand Commitments

Name: Nod. Tagline: "A robot bookkeeper that won't send your money to a scammer's new bank account." Plain, specific copy. No em dashes, no emojis. Visual world: board minutes and voting cards (agenda paper, ink, green, cerise and goldenrod card stock, Atkinson Hyperlegible).

## Evidence on Hand

Seeded fictional data with an answer key we wrote. Routine amounts modeled on San Francisco's public Vendor Payments (Vouchers), FY2025, public domain. Cited figures: the AFP 2025 survey (79%, 63%, 45%) and the Nacha rule only. No customers, quotes or other statistics exist; never invent them.

## Product Principles

1. The human yes is the weak point; design for it.
2. A yes must be earned by the signal, not assumed from it.
3. Every decision leaves a receipt a stranger can audit.
4. Say plainly what is real and what is simulated.

## Accessibility & Inclusion

The approver surface works with a single input (Space or one held button), with large targets, visible focus and WCAG AA contrast. The single-switch approver is an untested accessibility idea, shown as a short SIMULATED segment.
