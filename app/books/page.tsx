import { Providers } from "../providers";
import { TopBar } from "@/components/nod/TopBar";
import { Books } from "@/components/nod/Books";

export const metadata = { title: "Nod: books" };

export default function BooksPage() {
  return (
    <Providers role="viewer">
      <TopBar />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8">
        <Books />
      </main>
    </Providers>
  );
}
