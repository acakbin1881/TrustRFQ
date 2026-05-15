import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { IdentitySelector } from "@/components/IdentitySelector";
import { TrustlessWorkProvider } from "@/components/TrustlessWorkProvider";

export const metadata: Metadata = {
  title: "TrustRFQ — Private OTC Escrow",
  description: "Private RFQ and escrow-backed OTC settlement on Stellar Testnet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col overflow-x-hidden bg-[#1a1a1a]">
        <nav className="sticky top-0 z-50 border-b border-[#2a2a2a] bg-[#1a1a1a] px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#3f3b3b] bg-[#2a2a2a] text-xs font-black text-white">
              TQ
            </span>
            <span className="font-semibold text-white text-base">TrustRFQ</span>
            <span className="text-xs bg-[#373232] text-white/50 border border-[#3f3b3b] px-2 py-0.5 rounded-full font-medium">
              TESTNET
            </span>
          </Link>

          <div className="flex items-center gap-4 text-sm">
            <div className="hidden md:flex items-center">
              <IdentitySelector />
            </div>
            <Link href="/rfqs" className="text-white/50 hover:text-white transition-colors">
              RFQs
            </Link>
            <Link href="/deals" className="text-white/50 hover:text-white transition-colors">
              Deals
            </Link>
            <Link
              href="/rfqs/new"
              className="bg-[#5c5151] hover:bg-[#6a5e5e] text-white px-4 py-1.5 rounded-lg font-semibold transition-colors"
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

        <footer className="border-t border-[#2a2a2a] bg-[#1a1a1a] px-6 py-4 text-center text-xs text-white/30">
          TrustRFQ hackathon build – testnet/demo only – no real funds
        </footer>
      </body>
    </html>
  );
}
