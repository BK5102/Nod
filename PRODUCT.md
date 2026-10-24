# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui, Supabase, Anthropic API, Vercel. Decided in CLAUDE.md before the build.

## Users

Primary: the finance lead at Eastbay Community Pantry (fictional), a small food-bank nonprofit. In the demo's stress test they can approve only with one slow, shaky signal, such as a single button press (SIMULATED). Their job is to sign off on the few payments that actually matter without being buried in clicks, and without an accidental "yes" moving money.

Secondary: a controller who does out-of-band callbacks on HOLD payments, and an auditor who asks why a payment happened months later.

Evaluating audience: Cal Hacks 13.0 judges (Hyphenate, Microsoft, Capital One) watching a 90-second live demo, who may paste their own invoice.

## Product Purpose

Nod is an accounts payable agent. It pays vendor invoices within a mandate, asks a human only when deterministic rules say it matters, treats a noisy approval as evidence rather than a click, and writes a hash-chained receipt for every decision. Success: zero wrong payments on the planted-error set with fewer interruptions than a rules-only agent, and approvals whose trustworthiness is measured, not assumed.

## Positioning

No finance system records how trustworthy an approval was. Nod stores signal confidence next to every decision and uses canary invoices to measure whether the approver is actually paying attention.

## Operating Context

Invoices arrive as PDF, email text and images. Vendors, purchase orders and a bank sandbox (Nessie or mock) sit behind them. A double-entry ledger must reconcile with the bank. A simulated clock replays months of history.

## Capabilities and Constraints

- Policy engine sets the tier (AUTO, ASK, HOLD). Claude can only escalate, never lower.
- The agent can request but never approve, and cannot edit bank details. Enforced server-side.
- Default to no: timeouts, errors and ambiguity never move money.
- Invoice content is untrusted input.
- The approval signal is SIMULATED and must be labeled so on screen. No medical claims. Prototype.
- Undecided: Nessie vs Increase for vendor payments; CRS identity check on or off.

## Brand Commitments

Name: Nod. Tagline: "An AI that pays vendor invoices and catches the fake bank-detail change before the money leaves." Copy is plain and specific. No em dashes, no emojis.

## Evidence on Hand

Seeded fictional data with an answer key. No real customers, quotes or statistics exist; never invent them. Quote no accuracy figure that cannot be reproduced live.

## Product Principles

1. Ask less, but never skip a question that matters.
2. A yes must be earned by the signal, not assumed from it.
3. Every decision leaves a receipt a stranger can audit.
4. Autonomy is earned by a clean record and never extends to HOLD cases.

## Accessibility & Inclusion

The approver surface must work with a single input. The approver surface must be fully operable by a single input (one key, one switch), with large targets, no timing that punishes slowness beyond the protocol's explicit confirm windows, visible focus, and WCAG AA contrast.
