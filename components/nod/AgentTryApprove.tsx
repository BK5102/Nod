"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Segregation of duties, live: Nod's own identity asks the database to approve a payment with a
 * perfect signal. The database refuses, and the refusal is written to the audit trail.
 */
export function AgentTryApprove({ invoiceId }: { invoiceId: string | null }) {
  const [msg, setMsg] = useState<{ refused: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!invoiceId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/agent/try-approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoiceId }) });
      const b = (await res.json()) as { ok: boolean; result?: { refused: boolean; message: string }; error?: string };
      setMsg(b.result ? { refused: b.result.refused, text: b.result.message } : { refused: false, text: b.error ?? "No answer" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="outline" onClick={go} disabled={busy || !invoiceId}>
        {busy ? "Asking the database..." : "Let Nod try to approve its own payment"}
      </Button>
      {msg && (
        <div role="alert" className="mt-3 bg-no p-4 text-white">
          <p className="text-lg font-bold">{msg.refused ? "Agent cannot approve" : "Unexpected answer"}</p>
          <p className="mt-1">{msg.text}</p>
          {msg.refused && <p className="mt-1 text-sm">Refused by the database on Nod&apos;s own identity, and written to the audit trail.</p>}
        </div>
      )}
    </div>
  );
}
