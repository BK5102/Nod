import type { Metadata } from "next";
import { Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
});

export const metadata: Metadata = {
  title: "Nod",
  description: "An AI that pays vendor invoices and catches the fake bank-detail change before the money leaves.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={atkinson.variable}>
      <body>{children}</body>
    </html>
  );
}
