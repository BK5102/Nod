import { Providers } from "./providers";
import { TopBar } from "@/components/nod/TopBar";
import { Floor } from "@/components/nod/Floor";

export default async function FloorPage({ searchParams }: { searchParams: Promise<{ invoice?: string }> }) {
  const { invoice } = await searchParams;
  return (
    <Providers role="approver">
      <TopBar />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8">
        <Floor invoiceId={invoice ?? "inv_moment"} />
      </main>
    </Providers>
  );
}
