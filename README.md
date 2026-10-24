# Nod

A robot bookkeeper that won't send your money to a scammer's new bank account.

## One-line explanation

Scammers pretend to be a company you pay and say "we changed our bank account." Nod is a robot bookkeeper that stops and asks a person before sending money to a new account.

## Domain

Accounts payable (paying vendor invoices) for small organizations, with AI agents that can move money.

## The problem

A common invoice scam is a fake "we changed our bank account" message from someone posing as a vendor. In the Association for Financial Professionals' 2025 survey, 79% of organizations faced attempted or actual payments fraud, 63% cited business email compromise, and 45% cited vendor impersonation ([AFP press release, April 15, 2025](https://www.financialprofessionals.org/about/learn-more/press-releases/Details/survey-79-percent-of-organizations-were-victims-of-attempted-or-actual-payments-fraud-activity-in-2024); 521 respondents, surveyed January 2025). Standard advice is to verify bank changes through a second channel, and small, busy teams skip it.

We scope to one thing: vendor invoices where the bank details changed or something else is off. We do not try to be a full accounting system, general fraud detection, or a real brain-computer interface.

## Why now

As AI agents start releasing payments, the human yes becomes the weak point: people click yes out of habit, and a shaky or accidental yes is treated the same as a careful one. Money lost to these scams is hard to recover, small teams lack controls, and agents that pay need an approval step people can trust. The approval step is where this fails, not the detection.

## What Nod adds

Detecting a changed bank account is not new. Mainstream accounts payable tools already do it. What Nod adds is the layer after the flag, in four parts:

1. The agent can never approve its own payment or edit vendor bank details. Roles are enforced in code (in the database, on the caller's identity), not in the UI.
2. A shaky approval is treated as evidence, not a final yes. Ambiguous signals trigger one re-confirm, and uncertainty defaults to no.
3. Rules set the risk tier. Claude explains and can only raise a tier, never lower it.
4. Every decision writes a tamper-evident receipt with the rule that fired, who approved, and how reliable that approval was. A "why did you do this?" box answers only from those receipts and says "not in the record" otherwise.

To our knowledge, other products do not record how reliable an approval was. We have not checked exhaustively.

## What is real and what is simulated

| Component | Real or simulated | How we know |
| --- | --- | --- |
| Policy engine, tiers, mandate | Real, runs inside the database | Unit tests; segregation-of-duties checks against the live database |
| Claude extraction and explanation | Real when ANTHROPIC_API_KEY is set; errors are shown, never faked | Five messy test invoices in scripts/intake-check.ts |
| Segregation of duties | Real, enforced by SpacetimeDB on the caller's identity | scripts/sod-check.ts |
| Ledger and reconciliation | Real double entry, checked in a database view | Bank vs ledger difference shown live on Books |
| Receipts | Real, append-only and hash-chained | Chain verified in a database view on every change |
| Bank | Simulated: MockBank (Increase sandbox adapter written, not used in the demo) | Adapter logs and idempotency keys |
| Vendors and seeded invoices | Simulated: SEEDED fictional company, vendors and history | Marked SEEDED in the app; scripts/seed.ts |
| Baseline agent | A simple pay-everything agent we wrote | lib/naive.ts |
| Approval signal | Simulated: synthetic signal with a noise slider | SIMULATED badge; no real brain-computer interface, no accuracy claim |

## Known limits

- Eastbay Community Pantry is fictional. Its vendors, invoices and history are SEEDED.
- The approval signal is SIMULATED. It is not a model of any real device, and we make no accuracy claim.
- The bank is MockBank. No real money moves.
- Seats are demo seats: any visitor can sit as the approver or the controller. Only the agent and operator seats are locked. Production needs real sign-in.
- The planted errors and their answer key were written by us, so passing them shows the system does what we designed, not that it catches unseen fraud.
- Claude's extraction and explanations need an API key and a network connection. When Claude fails, the app shows the error and pays nothing.
- One organization, one currency (USD), no partial payments, no credit notes.

## The seat it fills

An accounts payable clerk for a five-person nonprofit that never approves its own payments, knows when to ask, and can defend every decision.

## Questions a judge may ask

**Why not just rules?** Rules decide. The policy engine sets the risk tier inside the database. Claude reads messy invoices, explains the decision in plain English, and can flag what rules cannot see, like "we changed banks" in the body of an email or an instruction hidden in the invoice. Claude can only raise a tier, never lower it. If Claude fails, the app shows the error and nothing is paid.

**Is catching a bank change new?** No. Mainstream accounts payable tools already do it. Nod adds the layer after the flag: the agent cannot approve itself, a shaky yes is treated as evidence, and every decision leaves a receipt that records how reliable the approval was.

**What is real?** The policy engine, the role checks, the double-entry ledger, the hash-chained receipts and the Claude calls are real. The company, vendors and history are SEEDED, the approval signal is SIMULATED, and the bank is MockBank. The table above and the What is real button in the app list every part.

**How do you know it works?** 43 unit tests, 11 segregation-of-duties checks run against the live database, scripts that replay the bank-change moment and the bank-failure recovery, five messy test invoices (`scripts/intake-check.ts`), and planted errors with an answer key. We wrote the test invoices, the planted errors and the answer key ourselves, so they show the system does what we designed, not that it catches fraud it has never seen. The five-invoice test needs an Anthropic API key and has not been run yet.

**Can the agent approve its own payment?** No. Roles live in the database and are checked on the caller's identity. Press "Let Nod try to approve its own payment" in the app and the database refuses it.

**What did you not build?** Real sign-in (demo seats anyone can take, except the agent and operator seats), a real bank connection (an Increase sandbox adapter is written but not used), a real brain-computer interface, an earned-autonomy ladder (behind a flag, off), an evaluation curve, an identity check, multiple currencies, credit notes, and a full accounting system.

## Run it

```bash
pnpm install
spacetime start                      # local SpacetimeDB, or use Maincloud
pnpm spacetime:publish:local nod-local
pnpm seed                            # also the one-command demo reset
pnpm dev                             # http://localhost:3001
pnpm test
```

Secrets go in `.env.local` (see `.env.example`). They are read only by server routes.
