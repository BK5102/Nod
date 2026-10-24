import { Providers } from "../providers";
import { TopBar } from "@/components/nod/TopBar";
import { Floor } from "@/components/nod/Floor";

export const metadata = { title: "Nod: invoice" };

export default async function InvoicePage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return (
    <Providers role="approver">
      <TopBar />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8">
        <Floor invoiceId={id ?? "inv_moment"} />
      </main>
    </Providers>
  );
}
