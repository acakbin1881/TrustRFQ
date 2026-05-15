"use client";

import { MOCK_IDENTITIES, useCurrentIdentity } from "@/lib/identity";

export function IdentitySelector() {
  const [address, switchIdentity] = useCurrentIdentity();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/40 hidden sm:block">Acting as:</span>
      <select
        value={address}
        onChange={(e) => switchIdentity(e.target.value)}
        className="bg-[#2a2a2a] border border-[#3f3b3b] text-white/70 text-xs px-2 py-1.5 rounded-lg focus:outline-none focus:border-[#5c5151]"
      >
        {MOCK_IDENTITIES.map((identity) => (
          <option key={identity.address} value={identity.address}>
            {identity.label}
          </option>
        ))}
      </select>
    </div>
  );
}
