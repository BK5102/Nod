"use server";

import { scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_HOURS, signSession } from "./token";

export interface SignInState {
  error: string | null;
}

function passwordMatches(password: string, stored: string): boolean {
  const [scheme, salt, hex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const want = Buffer.from(hex, "hex");
  const got = scryptSync(password, salt, want.length);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Checks the admin credentials from the server environment and sets a signed, http-only cookie. */
export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const adminEmail = process.env.REROUTED_ADMIN_EMAIL?.toLowerCase();
  const hash = process.env.REROUTED_ADMIN_PASSWORD_HASH;
  const secret = process.env.REROUTED_AUTH_SECRET;
  if (!adminEmail || !hash || !secret) return { error: "Sign-in is not set up on this server. Add the admin credentials to the environment." };
  if (!email || !password) return { error: "Enter your email and password." };

  const ok = email === adminEmail && passwordMatches(password, hash);
  if (!ok) return { error: "That email and password do not match." };

  const token = await signSession({ sub: email, exp: Date.now() + SESSION_HOURS * 3_600_000 }, secret);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  redirect("/dashboard");
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
