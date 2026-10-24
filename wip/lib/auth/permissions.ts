import type { Actor, AuditEvent, Role } from "@/lib/domain/types";
import { newId } from "@/lib/store/world";

export type Action =
  | "ingest_invoice"
  | "request_payment"
  | "pay_within_mandate"
  | "approve_payment"
  | "controller_callback"
  | "edit_vendor_bank"
  | "close_period"
  | "ask_why"
  | "read_books";

export const ACTION_LABELS: Record<Action, string> = {
  ingest_invoice: "Take in invoices",
  request_payment: "Request a payment",
  pay_within_mandate: "Pay AUTO-tier bills within the earned ceiling",
  approve_payment: "Approve a payment",
  controller_callback: "Confirm a HOLD by callback",
  edit_vendor_bank: "Change vendor bank details",
  close_period: "Close an accounting period",
  ask_why: "Ask why a decision was made",
  read_books: "Read the books",
};

/**
 * Who may do what. Segregation of duties: whoever requests a payment (the agent) can never
 * approve it, and the agent can never touch bank details or close the books.
 */
export const PERMISSIONS: Record<Role, readonly Action[]> = {
  agent: ["ingest_invoice", "request_payment", "pay_within_mandate", "read_books"],
  approver: ["approve_payment", "ask_why", "read_books"],
  controller: ["controller_callback", "edit_vendor_bank", "close_period", "ask_why", "read_books"],
  auditor: ["ask_why", "read_books"],
};

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[role].includes(action);
}

export class PermissionDenied extends Error {
  constructor(
    public readonly event: AuditEvent,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Throws PermissionDenied (carrying the audit event to persist) unless the actor may act.
 * The role always comes from the actor record on the server, never from the request.
 */
export function authorize(actors: readonly Actor[], actorId: string | null | undefined, action: Action, target: string, at: string): Actor {
  const actor = actors.find((a) => a.id === actorId);
  if (!actor || !can(actor.role, action)) {
    const who = actor ? `${actor.name} (${actor.role})` : `unknown actor ${actorId ?? "(none)"}`;
    const event: AuditEvent = {
      id: newId("aud"),
      at,
      actor_id: actor?.id ?? "unknown",
      action: "denied",
      target,
      allowed: false,
      detail: `${who} tried to ${ACTION_LABELS[action].toLowerCase()}. Refused: not permitted for this role.`,
    };
    throw new PermissionDenied(event, event.detail);
  }
  return actor;
}
