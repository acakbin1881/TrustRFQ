"use client";

import { MOCK_IDENTITIES, useCurrentIdentity } from "@/lib/identity";

export function IdentitySelector() {
  const [address, switchIdentity] = useCurrentIdentity();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 hidden sm:block">Acting as:</span>
      <select
        value={address}
        onChange={(e) => switchIdentity(e.target.value)}
        className="bg-slate-800 border border-slate-700 text-slate-200 text-xs px-2 py-1.5 rounded-lg focus:outline-none focus:border-blue-500"
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
