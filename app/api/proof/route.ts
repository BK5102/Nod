import fs from "node:fs";
import path from "node:path";
import { parseProofTable } from "@/lib/proof";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const md = fs.readFileSync(path.join(process.cwd(), "CLAUDE.md"), "utf8");
    return ok(parseProofTable(md));
  } catch (e) {
    return fail(e, 500);
  }
}
