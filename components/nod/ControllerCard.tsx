"use client";

import { useEffect, useRef, useState } from "react";
import { DbConnection, tables } from "@/src/module_bindings";
import { readToken, saveToken, STDB_DB, STDB_HOST } from "@/app/providers";
import { Button } from "@/components/ui/button";

interface Line {
  speaker: "controller" | "vendor";
  line: string;
}

/**
 * The controller is a different person, so this card opens its own connection with its own
 * identity and sits it in Luis's seat. The approver's identity could not record this decision.
 */
function useControllerConnection() {
  const [conn, setConn] = useState<DbConnection | null>(null);
  const [seated, setSeated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const built = useRef(false);

  useEffect(() => {
    if (built.current) return;
    built.current = true;
    const c = DbConnection.builder()
      .withUri(STDB_HOST)
      .withDatabaseName(STDB_DB)
      .withToken(readToken("controller"))
      .withAutomaticReconnect()
      .onConnect((cn, identity, token) => {
        saveToken("controller", token);
        cn.subscriptionBuilder()
          .onApplied(() => {
            const mine = cn.db.seat.identity.find(identity);
            if (mine?.actorId === "act_luis") setSeated(true);
            else cn.reducers.takeSeat({ actorId: "act_luis" }).then(() => setSeated(true), (e: Error) => setError(e.message));
          })
          .subscribe([tables.seat]);
        setConn(cn);
      })
      .onConnectError((_ctx, e) => setError(e.message))
      .build();
    return () => c.disconnect();
  }, []);
  return { conn, seated, error };
}

export function ControllerCard({ invoiceId, vendorName, askedLast4, onFileLast4 }: { invoiceId: string; vendorName: string; askedLast4: string; onFileLast4: string }) {
  const { conn, seated, error: connError } = useControllerConnection();
  const [call, setCall] = useState<{ lines: Line[]; outcome: "confirmed" | "mismatch"; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function phone() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/controller/call", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoiceId }) });
      const b = (await res.json()) as { ok: boolean; error?: string; result?: { transcript: Line[]; outcome: "confirmed" | "mismatch"; note: string } };
      if (!b.ok || !b.result) throw new Error(b.error ?? "The call failed");
      setCall({ lines: b.result.transcript, outcome: b.result.outcome, note: b.result.note });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function record(outcome: "confirmed" | "mismatch") {
    if (!conn || !call) return;
    setBusy(true);
    try {
      await conn.reducers.controllerDecision({ invoiceId, outcome, note: call.note });
      await fetch("/api/agent/pay", { method: "POST" }).catch(() => undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="controller-h" className="bg-paper-raised p-5">
      <h2 id="controller-h" className="text-lg font-bold">
        Luis&apos;s callback
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        A hold needs the controller to phone {vendorName} at the number already on file, never one from the invoice, and ask about the account ending {askedLast4}. The account on file ends {onFileLast4}.
      </p>
      {!call ? (
        <Button className="mt-4 w-full" onClick={phone} disabled={busy || !seated}>
          {busy ? "Calling..." : seated ? "Call the vendor (simulated)" : "Taking the controller's seat..."}
        </Button>
      ) : (
        <>
          <ol className="mt-4 space-y-2 text-sm">
            {call.lines.map((l, i) => (
              <li key={i}>
                <span className="font-bold">{l.speaker === "controller" ? "Luis" : vendorName}:</span> {l.line}
              </li>
            ))}
          </ol>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="yes" onClick={() => record("confirmed")} disabled={busy}>
              Vendor confirmed
            </Button>
            <Button variant="no" onClick={() => record("mismatch")} disabled={busy}>
              Vendor denied it
            </Button>
          </div>
        </>
      )}
      {(error || connError) && <p className="mt-3 text-sm text-no">{error ?? connError}</p>}
    </section>
  );
}
