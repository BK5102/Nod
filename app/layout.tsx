import type { Metadata, Viewport } from "next";
import { Source_Code_Pro, Source_Sans_3 } from "next/font/google";
import "./globals.css";

// Airport signs are set in Frutiger-cut humanist sans; Source Sans 3 is in that lineage and has
// tabular figures for times and prices. Source Code Pro is only for board cells and hashes.
const sans = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600", "700", "800", "900"], variable: "--font-sign" });
const mono = Source_Code_Pro({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-board" });

export const metadata: Metadata = {
  title: "Rerouted",
  description: "Your flight got canceled. Rerouted shops your way home within your card's rules, and you approve with one tap. A working prototype.",
};

export const viewport: Viewport = { themeColor: "#FFCC00" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
