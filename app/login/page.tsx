import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { Pictogram } from "@/components/rerouted/Pictogram";

export const metadata = { title: "Sign in · Rerouted" };

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh bg-ink lg:grid-cols-2">
      <div className="hidden flex-col justify-between p-10 lg:flex">
        <Link href="/" className="flex items-center gap-3 text-white">
          <Pictogram name="reroute" size={40} className="bg-yellow! text-ink!" label="Rerouted" />
          <span className="text-2xl font-extrabold">Rerouted</span>
        </Link>
        <p className="max-w-[14ch] text-[4.25rem] leading-[0.92] font-black tracking-[-0.04em] text-yellow">Your way home, inside your rules.</p>
        <span />
      </div>

      <main className="sign on-yellow flex flex-col justify-center px-6 py-12 md:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="mb-10 flex items-center gap-3 lg:hidden">
            <Pictogram name="reroute" size={40} label="Rerouted" />
            <span className="text-2xl font-extrabold">Rerouted</span>
          </Link>
          <h1 className="text-[2.4rem] leading-none font-black tracking-[-0.03em]">Sign in</h1>
          <p className="mt-2 mb-8 text-lg font-semibold text-yellow-soft">The dashboard is where you work with the agent.</p>
          <LoginForm />
          <p className="mt-8 text-sm font-semibold text-yellow-soft">Accounts are created by the admin in this prototype.</p>
        </div>
      </main>
    </div>
  );
}
