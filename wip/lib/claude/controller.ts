import type { Invoice, Vendor } from "@/lib/domain/types";
import { formatCents } from "@/lib/domain/money";
import { askJson, claudeAvailable } from "./client";
import { ControllerCallSchema, type ControllerCall } from "./schemas";

const SYSTEM = `Simulate a short out-of-band verification call for an accounts payable control.
The controller calls the vendor using the phone number already on file (never a number from the invoice)
and asks whether the vendor changed its bank details. You play both sides. The ground truth about whether
the vendor really changed banks is given to you; the vendor answers truthfully. Keep it to 4 to 6 lines.
outcome is "confirmed" only if the vendor confirms the exact new account ending; otherwise "mismatch".
This is a SIMULATION for a prototype. No em dashes.`;

/**
 * The model plays the vendor on a callback. Ground truth comes from the seed scenario, not from
 * the invoice, so a fraudulent invoice can never talk its way to "confirmed".
 */
export async function simulateCallback(args: {
  vendor: Vendor;
  invoice: Pick<Invoice, "invoice_number" | "amount_cents" | "extracted">;
  vendor_really_changed: boolean;
}): Promise<ControllerCall & { method: "claude" | "template" }> {
  const asked = args.invoice.extracted.remit_bank_last4 ?? "(not stated)";
  if (claudeAvailable()) {
    try {
      const out = await askJson({
        schema: ControllerCallSchema,
        system: SYSTEM,
        effort: "low",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              vendor: args.vendor.name,
              account_on_file_last4: args.vendor.bank_last4,
              invoice_asks_for_last4: asked,
              invoice: args.invoice.invoice_number,
              amount: formatCents(args.invoice.amount_cents),
              ground_truth_vendor_changed_bank: args.vendor_really_changed,
            }),
          },
        ],
      });
      // Ground truth wins over anything the model wrote.
      const outcome = args.vendor_really_changed ? out.outcome : "mismatch";
      return { ...out, outcome, method: "claude" };
    } catch {
      // fall through to the template
    }
  }
  const changed = args.vendor_really_changed;
  return {
    vendor_says_changed: changed,
    transcript: [
      { speaker: "controller", line: `Hi, this is Eastbay Community Pantry calling the number we have on file for ${args.vendor.name}.` },
      { speaker: "controller", line: `We received invoice ${args.invoice.invoice_number} asking us to pay an account ending ${asked}. Did you change your bank details?` },
      changed
        ? { speaker: "vendor", line: `Yes, we moved banks this month. The new account ends ${asked}.` }
        : { speaker: "vendor", line: `No, our bank has not changed. Please keep paying the account ending ${args.vendor.bank_last4}, and do not use that other one.` },
      { speaker: "controller", line: changed ? "Thanks, we will update the record." : "Thank you. We are holding that invoice and flagging it." },
    ],
    outcome: changed ? "confirmed" : "mismatch",
    note: changed ? `Vendor confirmed the new account ending ${asked} on a call to the number on file.` : `Vendor denied any bank change. Invoice is a payment-redirect attempt.`,
    method: "template",
  };
}
