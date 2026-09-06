import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({
  adjustFontFallback: false,
  subsets: ["latin"],
  display: "swap",
  variable: "--font-atkinson",
});

export const metadata: Metadata = {
  title: {
    default: "Brightview Dental",
    template: "%s · Brightview Dental",
  },
  description: "Dental practice scheduling workspace prototype.",
};

const directionContract = `<!--
impeccable:direction e1e9ac05
THESIS: Exception Radar puts unresolved requests and schedule risk before routine calendar detail instead of opening on generic metrics.
OWN-WORLD: Pale clinical canvas, deep navy navigation, azure actions, teal confirmation, lavender provider families, amber warnings, thin rules, compact controls, and modest corners.
STORY: Staff see what needs attention, preserve schedule context, preview constraints, then commit an accountable next action.
FIRST VIEWPORT: Stable navigation, request queue, provider-column day grid, and persistent detail rail; Review requests is the leading action.
FORM: Exception-first operations workbench, fifth grounded structure, seed e1e9ac05.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${atkinson.variable} h-full antialiased`}>
      <body className="min-h-full">
        <span
          hidden
          aria-hidden="true"
          data-impeccable-contract="e1e9ac05"
          dangerouslySetInnerHTML={{ __html: directionContract }}
        />
        {children}
      </body>
    </html>
  );
}
