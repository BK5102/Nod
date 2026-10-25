import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/components/auth/actions";
import { SESSION_COOKIE, verifySession } from "@/components/auth/token";
import { RerouteApp } from "@/components/rerouted/RerouteApp";

export const metadata = { title: "Dashboard · Rerouted" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Middleware already guards this route; the page checks again so it never renders unsigned.
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value, process.env.REROUTED_AUTH_SECRET);
  if (!session) redirect("/login?next=/dashboard");

  return (
    <RerouteApp
      account={
        <form action={signOut}>
          <button type="submit" className="text-sm font-semibold text-soft hover:text-white">
            Sign out
          </button>
        </form>
      }
    />
  );
}
