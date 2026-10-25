import type { Metadata, Viewport } from "next";
import { Archivo, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Archivo's width axis gives the big moments a departures-board cut; Hanken Grotesk carries the text;
// IBM Plex Mono is only for clock times, fingerprints and receipt ids. All three have tabular figures.
const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--ff-display" });
const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sign" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-board" });

export const metadata: Metadata = {
  title: "Rerouted",
  description: "Your flight got canceled. Rerouted shops your way home within your card's rules, and you approve with one tap. A working prototype.",
};

export const viewport: Viewport = { themeColor: "#FFCC00" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
