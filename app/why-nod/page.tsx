import Link from "next/link";
import { Providers } from "../providers";
import { TopBar } from "@/components/nod/TopBar";

export const metadata = { title: "Nod: why Nod" };

const AFP =
  "https://www.financialprofessionals.org/about/learn-more/press-releases/Details/survey-79-percent-of-organizations-were-victims-of-attempted-or-actual-payments-fraud-activity-in-2024";

const ROWS: { what: string; typical: string; nod: string }[] = [
  { what: "Detects bank changes", typical: "Yes, commonly described", nod: "Yes. A changed account is a HOLD that needs a callback." },
  {
    what: "Agent can approve its own payment",
    typical: "Not stated in the writeups we read",
    nod: "No. The database refuses it on the agent's own identity.",
  },
  {
    what: "Treats a shaky yes as evidence",
    typical: "Not described in the writeups we read",
    nod: "Yes. An unclear yes is asked again once, then defaults to no.",
  },
  {
    what: "Records approval reliability",
    typical: "Not described in the writeups we read",
    nod: "Yes. Stored on every receipt and sealed into its hash.",
  },
  {
    what: "Explains from a record",
    typical: "Audit logs are common; answering questions only from them was not described",
    nod: "Yes. The why box answers only from receipts, or says not in the record.",
  },
];

export default function WhyNodPage() {
  return (
    <Providers role="viewer">
      <TopBar />
      <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-8">
        <article className="bg-white p-6 sm:p-10">
          <h1 className="text-2xl font-bold">Why Nod</h1>
          <p className="mt-3 max-w-[68ch] text-lg">
            Scammers pretend to be a company you pay and say &quot;we changed our bank account.&quot; Nod is a robot bookkeeper that stops and asks a person before sending money to a new account.
          </p>

          <section aria-labelledby="problem-h" className="mt-10 max-w-[68ch] space-y-3">
            <h2 id="problem-h" className="text-xl font-bold">
              The problem
            </h2>
            <p>
              A common invoice scam is a fake &quot;we changed our bank account&quot; message from someone posing as a vendor. In the Association for Financial Professionals&apos; 2025 survey,
              79% of organizations faced attempted or actual payments fraud, 63% cited business email compromise, and 45% cited vendor impersonation (
              <a href={AFP} className="underline" target="_blank" rel="noreferrer">
                AFP press release, April 15, 2025
              </a>
              ).
            </p>
            <p>Standard advice is to verify bank changes through a second channel, and small, busy teams skip it.</p>
          </section>

          <section aria-labelledby="now-h" className="mt-10 max-w-[68ch] space-y-3">
            <h2 id="now-h" className="text-xl font-bold">
              Why now
            </h2>
            <p>
              As AI agents start releasing payments, the human yes becomes the weak point: people click yes out of habit, and a shaky or accidental yes is treated the same as a careful one.
              The approval step is where this fails, not the detection.
            </p>
          </section>

          <section aria-labelledby="adds-h" className="mt-10">
            <h2 id="adds-h" className="text-xl font-bold">
              What Nod adds
            </h2>
            <p className="mt-3 max-w-[68ch]">Detecting a changed bank account is not new. Mainstream accounts payable tools already do it. Nod adds the layer after the flag:</p>
            <ol className="mt-4 grid max-w-[68ch] list-decimal gap-3 pl-6">
              <li>The agent can never approve its own payment or edit vendor bank details. Roles are enforced in code, not in the UI.</li>
              <li>A shaky approval is treated as evidence, not a final yes. Ambiguous signals trigger one re-confirm, and uncertainty defaults to no.</li>
              <li>Rules set the risk tier. Claude explains and can only raise a tier, never lower it.</li>
              <li>
                Every decision writes a tamper-evident receipt with the rule that fired, who approved, and how reliable that approval was. A &quot;why did you do this?&quot; box answers only
                from those receipts.
              </li>
            </ol>
          </section>

          <section aria-labelledby="compare-h" className="mt-10">
            <h2 id="compare-h" className="text-xl font-bold">
              Side by side
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="align-bottom text-sm text-ink-soft">
                    <th className="py-2 pr-4 font-normal">What</th>
                    <th className="py-2 pr-4 font-normal">
                      Typical AP agent (what we found in public product writeups)
                      <span className="block font-bold text-ink">Based on public descriptions, not tested</span>
                    </th>
                    <th className="py-2 font-normal">Nod</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.what} className="border-t border-rule align-top">
                      <td className="py-3 pr-4 font-bold">{r.what}</td>
                      <td className="py-3 pr-4 text-ink-soft">{r.typical}</td>
                      <td className="py-3">{r.nod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 max-w-[68ch] text-sm text-ink-soft">
              To our knowledge, other products do not record how reliable an approval was. We have not checked exhaustively, and we do not name any company as lacking a feature we have not
              verified.
            </p>
          </section>

          <section aria-labelledby="sim-h" className="mt-10 max-w-[68ch] space-y-3">
            <h2 id="sim-h" className="text-xl font-bold">
              What is simulated
            </h2>
            <p>
              The company, vendors and history are SEEDED. The approval signal is SIMULATED: there is no real brain-computer interface and no accuracy claim. The bank is a mock. The What is real
              button in the top bar lists every part and how we know.
            </p>
            <p>
              <Link href="/" className="font-bold underline">
                See it work: the four questions
              </Link>
            </p>
          </section>
        </article>
      </main>
    </Providers>
  );
}
