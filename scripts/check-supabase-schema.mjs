import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  const content = readFileSync(path, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([^#=\s]+)=(.*)$/);
    if (!match) continue;

    const [, key, value] = match;
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve("apps/web/.env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const requiredDealColumns = [
  "contract_id",
  "engagement_id",
  "escrow_status",
  "milestone_status",
  "trustline_address",
  "transaction_hashes",
  "tw_payload",
];

const { error } = await supabase
  .from("deals")
  .select(`id,${requiredDealColumns.join(",")}`)
  .limit(1);

if (error) {
  console.error("Trustless Work schema check failed.");
  console.error(`Supabase error ${error.code ?? "unknown"}: ${error.message}`);
  console.error("");
  console.error("Apply supabase/migrations/002_trustless_work_escrow_fields.sql, then run this again.");
  process.exit(1);
}

console.log("Trustless Work schema check passed.");
console.log(`Deals table has: ${requiredDealColumns.join(", ")}`);
