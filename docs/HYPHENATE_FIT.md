# Hyphenate track fit: line-by-line

Source: CalHacks_Hyphenate_Track.pdf. Each line of the brief, what Nod had in the original plan, and what we added so the answer is "yes, and here is the proof on screen".

Legend: HAVE = in the original CLAUDE.md plan. ADD = gap, now built. BEYOND = past what the line asks.

## Framing

| Brief says | Nod | Status |
| --- | --- | --- |
| "Systems that pick up work on their own" | Nod watches the intake (email, PDF, scans, a volunteer's half-entered bills) and works the queue without being prompted: ingest, match, tier, pay, chase stalled approvals. | HAVE + ADD (stall chasing) |
| "Explainable when someone asks and accountable whenever someone looks back" | Why-box answers only from the hash-chained receipt record; every receipt names the rule, data and person behind the call. | HAVE |
| "A single refund changes revenue, cash... every number has to agree" | Every payment posts two balanced entries (bill, payment); bank vs ledger reconciles live; AP subledger rolls up to the GL control account. | HAVE + ADD (subledger tie-out) |
| "Nothing moves without the right person's sign-off" | Tiers, approval protocol, controller callback on HOLD, SoD enforced in API and in SQL. | HAVE |
| "Pick a company and one corner... a few seats that work closely together" | Eastbay Community Pantry. Seats: **AP clerk** (intake, 3-way match, coding) and **payments specialist** (pay run, bank reconciliation, chasing approvals). Plural seats, one system. | ADD (second seat made explicit) |
| "The software it uses, the people it answers to, the mistakes hiding in its data" | Bank adapter (Nessie or mock), ledger, vendor master, POs, vendor contracts; approver, controller, backup approver, auditor; 12 planted errors with an answer key. | HAVE + ADD (contracts, backup approver) |
| "Imaginative about who the company is, strict about how it works underneath" | Food bank whose finance lead approves with one switch. Strict: SQL constraints, append-only receipts, period locks. | HAVE |

## What makes it hard

| Brief says | Nod | Status |
| --- | --- | --- |
| **Sources that disagree** "bank, ledger and contract each tell a different story... know which to trust, and say why" | New **source check** on every invoice: invoice vs PO vs vendor contract (rate card) vs vendor master vs bank history. A fixed system-of-record table decides who wins each field (vendor master for bank details, contract for price, PO for authorization, bank for what was actually paid) and the reason is printed. Claude adds a "trusted source and why" line. | ADD (big) |
| **Time** "What happened in March should change what the system does in June" | Simulated clock and replay. A vendor stopped in March sits under stricter review until a set date; June invoices from it get a person. Period close locks past months; a late March bill arriving in June posts to June with a note. | HAVE + ADD (period close) |
| **Working with others** "Approvers are busy" | Approvals that sit past the nudge window get a reminder, then escalate to the backup approver. Both are logged. | ADD |
| "Colleagues hand work over half done" | A volunteer intake path delivers bills with missing PO, missing coding or no due date. Nod finishes them and records which field it filled from which source. | ADD |
| "The controller sometimes says no" | Controller callback can return "mismatch" (or a model-played controller calls the vendor's number on file). Nod holds, puts the vendor under stricter review, and drafts the verification note. | HAVE + ADD (model-played controller) |
| "Ask at the right moment and handle the answer" | Tiers decide when; the approval protocol handles noisy answers; default to no. | HAVE |
| **Limits** "No one gets access to everything" | Explicit permission matrix per role, enforced server-side and shown on screen. Agent cannot approve, cannot change bank details, cannot close a period. Every denied attempt is written to the audit trail. | HAVE + ADD (matrix, denied-attempt log) |
| "Whoever requests a payment can't be the one who approves it" | API 403 + SQL trigger + test. | HAVE |
| **Explainable and accountable** "trace back to the data, rule or person... no matter how long ago" | Receipts cite rule ids, source fields and actor ids. Why-box works on a March payment from June. | HAVE |

## Sample workflow: Accounts Payable

"Bills arrive in every format" = PDF, email, scanned image, pasted text, volunteer handoff. HAVE.
"Approvals stall" = nudge then escalate. ADD.
"A vendor's bank details change the day before a large payment" = the demo's opening moment. HAVE.

## How they judge

| Question | What they will see |
| --- | --- |
| Is it real enough? | Messy invoices in four formats; vendor contracts; 6 months of history; a ledger that reconciles; 12 planted errors with an answer key; live eval chart. |
| Would you hire it? For which seats? | One line: "AP clerk and payments specialist at a small nonprofit." Permission matrix on screen; receipt chain verified live; interruption rate vs wrong payments chart (knowing when to ask). |
| Did we see something new? | Measuring the approver: canary invoices, signal confidence stored on every receipt, approval that stays safe on a noisy single-switch signal. Earned autonomy ladder. |
| The moment: "catches what others missed" | Changed bank details: naive agent pays, Nod holds. Line items that do not sum, look-alike email domain: rules miss, Claude catches. |
| "recovers from something going wrong" | ADD: bank outage mid-payment. No double payment (idempotency key), ledger posts only after the bank confirms, invoice returns to the pay queue, reconcile stays green. |
| "defends a decision when questioned" | Why-box on any receipt, answered from the record only, with "not in the record" otherwise. |

## What to submit

| Ask | Where |
| --- | --- |
| Demo video that opens with the moment | Demo script in CLAUDE.md, step 1 is the moment. |
| Live demo, "we may ask you to try a scenario of our own" | Scenario panel: paste or upload any invoice, change a vendor's bank, make the approver busy, make the controller say no, cause a bank outage. All at runtime. |
| One line on the seats | README first line and the app header. |
| Proof it works | Proof table at the top of the README and on the Proof screen; `pnpm test`, `pnpm eval`. |

## Key concepts checklist

Double entry (HAVE), general ledger (HAVE), chart of accounts (ADD: shown on Ledger screen), journal entry (HAVE), subledger (ADD: AP subledger by vendor, tied to GL 2000), system of record (ADD: source check table), reconciliation (HAVE), period close (ADD), materiality (ADD: PO tolerance is named the materiality threshold and shown), internal controls (ADD: controls list with live pass/fail), segregation of duties (HAVE), audit trail (HAVE, plus denied attempts), controller (HAVE).

## Things only you can do

- Go to the Hyphenate workshop tonight, Oct 23, 7 pm. Ask which AP exceptions they see most; we can plant one more error that matches.
- Talk to the Hyphenate team at the booth about the seat line, and ask whether they prefer a sandbox (Increase is on their list) over Nessie.
