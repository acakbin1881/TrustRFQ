import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { IdentitySelector } from "@/components/IdentitySelector";

export const metadata: Metadata = {
  title: "StellarBig — Testnet",
  description: "Peer-to-peer OTC escrow settlement on Stellar Testnet",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="font-bold text-white text-lg">StellarBig</span>
            <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">
              TESTNET
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <IdentitySelector />
            <Link
              href="/rfqs"
              className="text-slate-400 hover:text-white transition-colors"
            >
              RFQs
            </Link>
            <Link
              href="/rfqs/new"
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg font-medium transition-colors"
            >
              New RFQ
            </Link>
          </div>
        </nav>
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
          {children}
        </main>
        <footer className="border-t border-slate-800 px-6 py-4 text-center text-xs text-slate-600">
          StellarBig MVP · Testnet only · No real funds
        </footer>
      </body>
    </html>
  );
}
