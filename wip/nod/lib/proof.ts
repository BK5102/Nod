export interface ProofRow {
  component: string;
  status: string;
  how: string;
}

/** Reads the proof table out of CLAUDE.md, so the app and the docs cannot drift apart. */
export function parseProofTable(markdown: string): ProofRow[] {
  let start = markdown.indexOf("## What is real and what is simulated");
  if (start < 0) start = markdown.indexOf("## Proof table");
  if (start < 0) return [];
  const rows: ProofRow[] = [];
  for (const line of markdown.slice(start).split(/\r?\n/).slice(1)) {
    if (line.startsWith("## ")) break;
    if (!line.startsWith("|") || /^\|\s*-/.test(line) || /^\|\s*Component\s*\|/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length >= 3) rows.push({ component: cells[0]!, status: cells[1]!, how: cells[2]! });
  }
  return rows;
}
