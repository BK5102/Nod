import { Providers } from "../providers";
import { TopBar } from "@/components/nod/TopBar";
import { Intake } from "@/components/nod/Intake";

export const metadata = { title: "Nod: hand Nod an invoice" };

export default function IntakePage() {
  return (
    <Providers role="viewer">
      <TopBar />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8">
        <Intake />
      </main>
    </Providers>
  );
}
