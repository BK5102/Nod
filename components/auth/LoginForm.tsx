"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null });
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <label className="flex flex-col gap-2">
        <span className="text-base font-bold">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="email@example.com"
          className="border-2 border-ink bg-white px-3 py-3 text-lg text-ink placeholder:text-ink/40 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-base font-bold">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="border-2 border-ink bg-white px-3 py-3 text-lg text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
      </label>
      {state.error ? (
        <p role="alert" className="bg-ink px-3 py-2.5 text-base font-bold text-alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-ink py-3.5 text-xl font-extrabold text-white transition-[transform,background-color] hover:bg-panel-2 active:scale-[0.985] disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Checking" : "Sign in"}
      </button>
    </form>
  );
}
