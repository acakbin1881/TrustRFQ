"use client";

import { development, mainNet, TrustlessWorkConfig } from "@trustless-work/escrow";

export function TrustlessWorkProvider({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_TLW_API_KEY ?? "";
  const baseURL = process.env.NEXT_PUBLIC_ENV === "production" ? mainNet : development;

  return (
    <TrustlessWorkConfig baseURL={baseURL} apiKey={apiKey}>
      {children}
    </TrustlessWorkConfig>
  );
}
