# Hyphenate track fit

Source: CalHacks_Hyphenate_Track.pdf. How each part of the brief is answered by what is built today (Oct 24, 2026). Where something was cut, it says so.

## Framing

| Brief says | Nod |
| --- | --- |
| Systems that pick up work on their own | Nod takes in an invoice, matches vendor, PO and contract, tiers it, pays routine bills inside its limit, and stops for a person on anything risky. |
| Explainable when asked, accountable when someone looks back | Every decision writes a hash-chained receipt (rule, tier, who approved, approval reliability). The why box answers only from receipts. |
| Every number has to agree | Two balanced journal entries per payment; bank vs ledger reconciliation and receipt-chain verification run in database views. |
| Nothing moves without the right sign-off | Tiers, the approval protocol, and a controller callback on HOLD, all enforced in SpacetimeDB reducers. |
| Pick a company and a corner of its finance team | Eastbay Community Pantry (fictional), the accounts payable seat: a clerk with limited access, a clean record, and clear rules for when to ask. |
| Strict about how it works underneath | Roles checked on the caller's identity in the database; append-only receipts; default to no. |

## What makes it hard

| Brief says | Nod |
| --- | --- |
| Sources that disagree: know which to trust, and say why | A source check on every invoice compares invoice, PO, contract, vendor record and bank history against a fixed system-of-record table, with the reason printed. |
| Time: March should change June | A vendor stopped by the controller is under stricter review for 120 days. The replay clock UI is cut. |
| Working with others: approvers are busy, the controller says no | Stalled approvals are nudged and escalated in the module (sweep). The controller can say no on a callback, which holds the bill and tightens review. |
| Limits: whoever requests a payment cannot approve it | The database refuses the agent's approval; the app shows "Agent cannot approve" live. |
| Explainable and accountable | Receipts plus the why box; "not in the record" when there is nothing to cite. |

## How they judge

| Question | What they see |
| --- | --- |
| Is it real enough? | Their own invoice through the live intake; seeded data labeled SEEDED, amounts modeled on SF public vendor payments; the What is real panel. |
| Would you hire it? | The seat line; the database refusing self-approval; counts of bills paid alone versus asked; receipts. |
| Did we see something new? | Approval reliability on every receipt; the SIMULATED single-switch segment with re-confirm and default to no; one canary with a catch counter. Bank-change detection is not claimed as new. |
| The moment | Catches (baseline pays, Nod holds, 3D money route), recovers (bank fails once, paid exactly once), defends (why box from receipts). |

## What to submit

| Ask | Where |
| --- | --- |
| Demo video opening with the moment | Not recorded yet. Follow the pitch script in README.md. |
| Live demo, possibly with their scenario | `/intake` takes any invoice at runtime. |
| One line on the seats | README "The seat". |
| Proof it works | README "What is real and what is simulated" and "Questions a judge may ask"; tests and scripts listed in CLAUDE.md. |

## Cut on purpose

Earned-autonomy ladder (flag, off), replay clock (flag, off), CRS identity check, evaluation curve, real sign-in.
