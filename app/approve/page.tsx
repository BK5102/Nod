import { Providers } from "../providers";
import { TopBar } from "@/components/nod/TopBar";
import { ApproveQueue } from "@/components/nod/ApproveQueue";

export const metadata = { title: "Nod: approve" };

export default function ApprovePage() {
  return (
    <Providers role="approver">
      <TopBar />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8">
        <ApproveQueue />
      </main>
    </Providers>
  );
}
