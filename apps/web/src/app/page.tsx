import Link from "next/link";

const steps = [
  {
    n: "1",
    title: "Post an RFQ",
    desc: "Specify what you're selling, what you want, and an expiry time.",
  },
  {
    n: "2",
    title: "Receive quotes",
    desc: "Counterparties submit quotes. You review and accept the best one.",
  },
  {
    n: "3",
    title: "Lock funds",
    desc: "Both sides deposit assets into the Soroban escrow contract.",
  },
  {
    n: "4",
    title: "Atomic settlement",
    desc: "Once both sides funded, the swap executes atomically on-chain.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-16">
      {/* Hero */}
      <section className="text-center flex flex-col items-center gap-6 pt-8">
        <div className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-full font-medium">
          Stellar Testnet · Mock MVP
        </div>
        <h1 className="text-4xl font-bold text-white leading-tight">
          OTC escrow settlement
          <br />
          <span className="text-blue-400">without counterparty risk</span>
        </h1>
        <p className="text-slate-400 max-w-md text-lg leading-relaxed">
          Post an RFQ, receive quotes, accept one, and settle atomically through
          a Soroban smart contract. No trust required.
        </p>
        <div className="flex gap-4">
          <Link
            href="/rfqs"
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            Browse RFQs
          </Link>
          <Link
            href="/rfqs/new"
            className="border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            Create RFQ
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-6 text-center">
          How it works
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {steps.map((s) => (
            <div
              key={s.n}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex gap-4"
            >
              <span className="text-blue-500 font-bold text-lg leading-none mt-0.5">
                {s.n}
              </span>
              <div>
                <p className="font-semibold text-white mb-1">{s.title}</p>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Constraints banner */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-sm text-slate-400">
        <span className="text-slate-300 font-medium">Scope: </span>
        Testnet only · No mainnet · No fiat · No KYC · No dispute resolution ·
        XLM and USDC only
      </section>
    </div>
  );
}
