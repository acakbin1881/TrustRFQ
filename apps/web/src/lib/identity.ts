import { useSyncExternalStore } from "react";

export const MOCK_IDENTITIES = [
  { label: "RFQ Creator", address: "GAXHX7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2CX" },
  { label: "Maker A",     address: "GBMKR1UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2MA" },
  { label: "Maker B",     address: "GCMKR2UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2MB" },
] as const;

export const DEFAULT_ADDRESS = MOCK_IDENTITIES[0].address;

const STORAGE_KEY = "stellarbig_mock_identity";

let listeners: Array<() => void> = [];
let currentAddress: string = DEFAULT_ADDRESS;

if (typeof window !== "undefined") {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && MOCK_IDENTITIES.some((i) => i.address === stored)) {
    currentAddress = stored;
  }
}

function subscribe(callback: () => void) {
  listeners = [...listeners, callback];
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

function getSnapshot() {
  return currentAddress;
}

function getServerSnapshot() {
  return DEFAULT_ADDRESS;
}

export function switchIdentity(address: string) {
  if (!MOCK_IDENTITIES.some((i) => i.address === address)) return;
  currentAddress = address;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, address);
  }
  listeners.forEach((l) => l());
}

export function useCurrentIdentity(): [string, (address: string) => void] {
  const address = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [address, switchIdentity];
}
