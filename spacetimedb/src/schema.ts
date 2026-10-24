import { schema, table, t } from 'spacetimedb/server';

// Money is integer cents in u32 (max about $42.9M, plenty for a small nonprofit).
// Simulated time is ISO strings from the sim_clock row, never the wall clock.
// Nested records (extracted fields, rules, sources, review) are JSON strings written only by reducers.

/** The identity that published the module. Seeds the company and runs demo controls. */
export const admin = table({ name: 'admin' }, { identity: t.identity().primaryKey() });

/** People and the agent. Roles live here; identities are bound to actors through seats. */
export const actor = table(
  { name: 'actor', public: true },
  { actorId: t.string().primaryKey(), name: t.string(), role: t.string() }
);

/** Which actor a connected identity is acting as. The only source of a caller's role. */
export const seat = table(
  { name: 'seat', public: true },
  { identity: t.identity().primaryKey(), actorId: t.string() }
);

export const vendor = table(
  { name: 'vendor', public: true },
  {
    vendorId: t.string().primaryKey(),
    name: t.string(),
    category: t.string(),
    expenseAccount: t.string(),
    bankLast4: t.string(),
    bankChangedAt: t.string(),
    heightenedUntil: t.string(),
    firstSeenAt: t.string(),
    emailDomain: t.string(),
  }
);

export const vendorChange = table(
  { name: 'vendor_change', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    vendorId: t.string(),
    actorId: t.string(),
    field: t.string(),
    oldValue: t.string(),
    newValue: t.string(),
    at: t.string(),
  }
);

export const contract = table(
  { name: 'contract', public: true },
  { contractId: t.string().primaryKey(), vendorId: t.string().index('btree'), json: t.string() }
);

export const purchaseOrder = table(
  { name: 'purchase_order', public: true },
  {
    poId: t.string().primaryKey(),
    vendorId: t.string().index('btree'),
    number: t.string(),
    amountCents: t.u32(),
    description: t.string(),
    status: t.string(),
    createdAt: t.string(),
  }
);

export const invoice = table(
  { name: 'invoice', public: true },
  {
    invoiceId: t.string().primaryKey(),
    vendorId: t.string(),
    poId: t.string(),
    number: t.string(),
    amountCents: t.u32(),
    dueDate: t.string(),
    receivedAt: t.string(),
    sourceFormat: t.string(),
    filePath: t.string(),
    rawText: t.string(),
    extractedJson: t.string(),
    extractionMethod: t.string(),
    status: t.string(),
    handoffJson: t.string(),
    approvalRequestedAt: t.string(),
    nudgedAt: t.string(),
    assignedApprover: t.string(),
    period: t.string(),
  }
);

/** Which invoices are planted attention checks. Private: the approver must not be able to tell. */
export const canary = table({ name: 'canary' }, { invoiceId: t.string().primaryKey() });

export const canaryStats = table(
  { name: 'canary_stats', public: true },
  { id: t.u32().primaryKey(), presented: t.u32(), caught: t.u32(), missed: t.u32() }
);

export const policyDecision = table(
  { name: 'policy_decision', public: true },
  {
    invoiceId: t.string().primaryKey(),
    sourcesJson: t.string(),
    rulesJson: t.string(),
    ruleTier: t.string(),
    claudeJson: t.string(),
    finalTier: t.string(),
    decidedAt: t.string(),
    reviewed: t.bool(),
  }
);

export const approval = table(
  { name: 'approval', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    invoiceId: t.string().index('btree'),
    actorId: t.string(),
    decision: t.string(),
    confidence: t.f64(),
    windowMs: t.u32(),
    attempt: t.u32(),
    latencyMs: t.u32(),
    at: t.string(),
  }
);

export const controllerCheck = table(
  { name: 'controller_check', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    invoiceId: t.string(),
    actorId: t.string(),
    outcome: t.string(),
    note: t.string(),
    at: t.string(),
  }
);

/** Phase one of a payment: authorized here, executed by the server against the bank, settled back here. */
export const paymentIntent = table(
  { name: 'payment_intent' },
  {
    invoiceId: t.string().primaryKey(),
    idempotencyKey: t.string(),
    vendorId: t.string(),
    vendorName: t.string(),
    amountCents: t.u32(),
    toLast4: t.string(),
    status: t.string(),
    attempts: t.u32(),
    lastError: t.string(),
    signalConfidence: t.f64(),
    actorIdsJson: t.string(),
    note: t.string(),
  }
);

export const bankTransfer = table(
  { name: 'bank_transfer' },
  {
    id: t.u64().primaryKey().autoInc(),
    invoiceId: t.string(),
    vendorId: t.string(),
    amountCents: t.u32(),
    toLast4: t.string(),
    adapter: t.string(),
    externalId: t.string(),
    status: t.string(),
    error: t.string(),
    at: t.string(),
  }
);

export const journalEntry = table(
  { name: 'journal_entry' },
  { id: t.u64().primaryKey().autoInc(), invoiceId: t.string(), memo: t.string(), postedAt: t.string() }
);

export const journalLine = table(
  { name: 'journal_line' },
  {
    id: t.u64().primaryKey().autoInc(),
    entryId: t.u64().index('btree'),
    account: t.string(),
    debitCents: t.u32(),
    creditCents: t.u32(),
  }
);

export const receipt = table(
  { name: 'receipt', public: true },
  {
    seq: t.u32().primaryKey(),
    invoiceId: t.string().index('btree'),
    vendorName: t.string(),
    amountCents: t.u32(),
    decision: t.string(),
    tier: t.string(),
    rulesJson: t.string(),
    explanation: t.string(),
    /** -1 when no approval signal was involved. */
    signalConfidence: t.f64(),
    actorIdsJson: t.string(),
    asOf: t.string(),
    note: t.string(),
    prevHash: t.string(),
    hash: t.string(),
  }
);

export const autonomyState = table(
  { name: 'autonomy_state', public: true },
  { id: t.u32().primaryKey(), cleanStreak: t.u32(), rung: t.u32(), ceilingCents: t.u32(), updatedAt: t.string() }
);

export const simClock = table(
  { name: 'sim_clock', public: true },
  {
    id: t.u32().primaryKey(),
    asOf: t.string(),
    closedThrough: t.string(),
    bankOutage: t.bool(),
    openingBalanceCents: t.u32(),
  }
);

export const auditEvent = table(
  { name: 'audit_event', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    at: t.string(),
    actorId: t.string(),
    action: t.string(),
    target: t.string(),
    allowed: t.bool(),
    detail: t.string(),
  }
);

/** Planted-error answer key. Private; read by no reducer that makes a payment decision. */
export const answerKey = table(
  { name: 'eval_answer_key' },
  { invoiceId: t.string().primaryKey(), errorType: t.string(), expectedAction: t.string() }
);

const spacetimedb = schema({
  admin,
  actor,
  seat,
  vendor,
  vendorChange,
  contract,
  purchaseOrder,
  invoice,
  canary,
  canaryStats,
  policyDecision,
  approval,
  controllerCheck,
  paymentIntent,
  bankTransfer,
  journalEntry,
  journalLine,
  receipt,
  autonomyState,
  simClock,
  auditEvent,
  answerKey,
});

export default spacetimedb;
