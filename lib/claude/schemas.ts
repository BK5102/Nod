import { z } from "zod";

export const ExtractedInvoiceSchema = z.object({
  vendor_name: z.string(),
  invoice_number: z.string(),
  amount_cents: z.number().int().nonnegative(),
  currency: z.string(),
  invoice_date: z.string().nullable(),
  due_date: z.string().nullable(),
  po_number: z.string().nullable(),
  remit_bank_last4: z.string().nullable(),
  line_items: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().nullable(),
      unit_price_cents: z.number().int().nullable(),
      amount_cents: z.number().int(),
    }),
  ),
  notes: z.string().nullable(),
  sender_email: z.string().nullable(),
});

export const ClaudeCheckSchema = z.object({
  trusted_source: z.enum(["invoice", "purchase_order", "vendor_record", "none"]),
  trust_reason: z.string(),
  // AUTO is not a legal severity: a flag can only escalate.
  flags: z.array(
    z.object({
      code: z.string(),
      severity: z.enum(["ASK", "HOLD"]),
      reason: z.string(),
    }),
  ),
  explanation: z.string(),
});

export const AuditorAnswerSchema = z.object({
  in_record: z.boolean(),
  answer: z.string(),
  cited_receipts: z.array(z.number().int()),
});

export const ControllerCallSchema = z.object({
  vendor_says_changed: z.boolean(),
  transcript: z.array(z.object({ speaker: z.enum(["controller", "vendor"]), line: z.string() })),
  outcome: z.enum(["confirmed", "mismatch"]),
  note: z.string(),
});

export type ExtractedInvoiceOut = z.infer<typeof ExtractedInvoiceSchema>;
export type ClaudeCheckOut = z.infer<typeof ClaudeCheckSchema>;
export type AuditorAnswer = z.infer<typeof AuditorAnswerSchema>;
export type ControllerCall = z.infer<typeof ControllerCallSchema>;
