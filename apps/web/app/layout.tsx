import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "FieldProof",
  description: "Autonomous job closeout agent for field-service teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-[var(--color-line)] bg-white">
          <div className="mx-auto flex max-w-6xl items-baseline gap-4 px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              FieldProof
            </Link>
            <p className="text-sm text-[var(--color-muted)]">
              Finish the paperwork when the fieldwork finishes.
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
