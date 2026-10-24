import "server-only";
import { NextResponse } from "next/server";
import { reason } from "@/lib/stdb/node";

export function ok<T>(result: T) {
  return NextResponse.json({ ok: true, result });
}

export function fail(e: unknown, status = 400) {
  const msg = reason(e);
  return NextResponse.json({ ok: false, error: msg, refused: msg.startsWith("Refused:") }, { status: msg.startsWith("Refused:") ? 403 : status });
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Request body must be JSON");
  }
}
