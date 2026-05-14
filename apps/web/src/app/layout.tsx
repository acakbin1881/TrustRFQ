import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { IdentitySelector } from "@/components/IdentitySelector";
import { TrustlessWorkProvider } from "@/components/TrustlessWorkProvider";

export const metadata: Metadata = {
  title: "TrustRFQ — Private OTC Escrow",
  description: "Private RFQ and escrow-backed OTC settlement on Stellar Testnet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <nav className="border-b border-gray-100 bg-white px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs font-black text-gray-800">
              TQ
            </span>
            <span className="font-semibold text-gray-900 text-base">TrustRFQ</span>
            <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
              TESTNET
            </span>
          </Link>

          <div className="flex items-center gap-4 text-sm">
            <div className="hidden md:flex items-center">
              <IdentitySelector />
            </div>
            <Link
              href="/rfqs"
              className="text-gray-500 hover:text-gray-900 transition-colors"
            >
              RFQs
            </Link>
            <Link
              href="/deals"
              className="text-gray-500 hover:text-gray-900 transition-colors hidden sm:block"
            >
              Deals
            </Link>
            <Link
              href="/rfqs/new"
              className="bg-gray-900 hover:bg-gray-700 text-white px-4 py-1.5 rounded-lg font-semibold transition-colors"
            >
              New RFQ
            </Link>
          </div>
        </nav>

        <TrustlessWorkProvider>
          <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </TrustlessWorkProvider>

        <footer className="border-t border-gray-100 bg-white px-6 py-4 text-center text-xs text-gray-400">
          TrustRFQ hackathon build – testnet/demo only – no real funds
        </footer>
      </body>
    </html>
  );
}
