import { Providers } from "../providers";
import { TopBar } from "@/components/nod/TopBar";
import { Moment } from "@/components/nod/Moment";

export const metadata = { title: "Nod: baseline vs Nod" };

export default function MomentPage() {
  return (
    <Providers role="viewer">
      <TopBar />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8">
        <Moment />
      </main>
    </Providers>
  );
}
