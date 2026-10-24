# Nod

An AI that pays vendor invoices and catches the fake bank-detail change before the money leaves.

Nod is an AI bookkeeper for small organizations. It reads vendor invoices and flags a common scam: a vendor suddenly changing its bank account. Routine invoices go through. Risky ones stop and wait for a person, and a changed bank account always needs a second check. Every decision gets a receipt showing what Nod saw, who approved, and why.

## The problem

Scammers email small organizations posing as a vendor and say "we changed our bank account." Busy staff approve out of habit and the money is gone. In the Association for Financial Professionals' 2025 survey, 79% of organizations faced attempted or actual payments fraud and 45% cited vendor imposter fraud ([AFP press release, April 15, 2025](https://www.financialprofessionals.org/about/learn-more/press-releases/Details/survey-79-percent-of-organizations-were-victims-of-attempted-or-actual-payments-fraud-activity-in-2024); 521 respondents, surveyed January 2025). Most tools either block too much or approve everything, and none record how reliable an approval was.

## The seat it fills

Accounts payable clerk and payments specialist at a small organization.

## What is new, and what is not

Detecting vendor bank-change fraud already exists in other accounts payable tools, so we do not claim it is new. Nod automates the out-of-band callback check that busy small teams skip, and it keeps the person who changes vendor data apart from the person who releases payment. What is new is the measured approval (how sure each yes was, stored on the receipt) and the hash-chained receipts.

The single shaky signal approver is a short demo segment and an untested accessibility idea, not a claim about who has this problem.

## What is real and what is simulated

| Part | Real or simulated | How we know |
| --- | --- | --- |
| Policy engine, tiers, mandate | Real, runs inside the database | Unit tests; segregation-of-duties checks against the live database |
| Claude extraction and explanation | Real (needs ANTHROPIC_API_KEY) | Five messy test invoices in `scripts/intake-check.ts` |
| Segregation of duties | Real, enforced by SpacetimeDB on the caller's identity | `scripts/sod-check.ts` |
| Ledger and reconciliation | Real double entry, checked in a database view | Bank vs ledger difference shown live |
| Receipts | Real, append-only and hash-chained | Chain verified in a database view on every change |
| Bank | MockBank (Increase sandbox adapter written, not used in the demo) | Adapter logs, idempotency keys |
| Vendors and seeded invoices | Seeded, marked SEEDED in the app | `scripts/seed.ts` |
| The baseline agent | A simple pay-everything agent we wrote | `lib/naive.ts` |
| Approval signal | SIMULATED, a synthetic signal with a noise slider | SIMULATED badge on screen. No real device, no accuracy claim |

Eastbay Community Pantry is a fictional organization. Nod is a prototype.

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
