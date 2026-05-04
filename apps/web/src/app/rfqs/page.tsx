import Link from "next/link";
import {
  CURRENT_USER_ADDRESS,
  STATUS_COLOR,
  STATUS_LABEL,
  fmt,
  type Rfq,
} from "@/lib/mock-data";
import { deriveRfqStatus, listRfqs } from "@/lib/rfq-repository";

function RfqCard({ rfq }: { rfq: Rfq }) {
  const isCreator = rfq.creatorAddress === CURRENT_USER_ADDRESS;
  const status = deriveRfqStatus(rfq);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-lg">
            {rfq.sellAmount.toLocaleString()} {rfq.sellAsset}
          </span>
          <span className="text-slate-500">-&gt;</span>
          <span className="text-blue-300 font-semibold text-lg">
            {rfq.buyAmount.toLocaleString()} {rfq.buyAsset}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>Expires {fmt(rfq.expiresAt)}</span>
          <span>·</span>
          <span className="font-mono truncate max-w-[180px]">
            {rfq.creatorAddress.slice(0, 8)}...{rfq.creatorAddress.slice(-4)}
          </span>
          {isCreator && <span className="text-amber-500">your RFQ</span>}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
        <Link
          href={`/rfqs/${rfq.id}`}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
        >
          {isCreator ? "Review quotes ->" : "Submit quote ->"}
        </Link>
      </div>
    </div>
  );
}

export default async function RfqsPage() {
  const rfqs = await listRfqs();
  const open = rfqs.filter((r) => deriveRfqStatus(r) === "open");
  const closed = rfqs.filter((r) => deriveRfqStatus(r) !== "open");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">RFQs</h1>
          <p className="text-slate-400 text-sm mt-1">
            Open private requests for quotes
          </p>
        </div>
        <Link
          href="/rfqs/new"
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + New RFQ
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          Open ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="text-slate-500 text-sm">No open RFQs.</p>
        ) : (
          open.map((rfq) => <RfqCard key={rfq.id} rfq={rfq} />)
        )}
      </section>

      {closed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
            Closed / Expired ({closed.length})
          </h2>
          {closed.map((rfq) => (
            <RfqCard key={rfq.id} rfq={rfq} />
          ))}
        </section>
      )}
    </div>
  );
}
