import { useState } from "react";
import { FileText, HandCoins, Pencil, Plus } from "lucide-react";
import { useData } from "../data/store";
import { useEditors } from "../components/editors";
import { DataTable, type Column } from "../components/DataTable";
import { Badge, Button, Card, Chips, EmptyState, IconButton, Modal, PageHeader, SearchInput, type Tone } from "../components/ui";
import { fmt, fmtDate, today } from "../lib/format";
import { INVESTMENT_STATUSES, investmentOutstanding, investmentStatus, type InvestmentStatus } from "../lib/investments";
import type { Investment } from "../lib/types";

const statusTones: Record<InvestmentStatus, Tone> = { Open: "sky", Overdue: "rose", Repaid: "emerald" };

export function Investments() {
  const data = useData();
  const { investments } = data;
  const open = useEditors();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<InvestmentStatus | "All">("All");
  const [statementId, setStatementId] = useState<string | null>(null);
  const date = today();
  const term = query.trim().toLowerCase();
  const filtered = investments.filter((investment) =>
    (status === "All" || investmentStatus(investment, date) === status) &&
    (!term || [investment.investor, investment.contact, investment.notes].some((value) => value.toLowerCase().includes(term))),
  );
  const totals = investments.reduce((sum, investment) => ({
    received: sum.received + investment.amount,
    profit: sum.profit + investment.promisedReturn - investment.amount,
    outstanding: sum.outstanding + investmentOutstanding(investment),
    overdue: sum.overdue + (investmentStatus(investment, date) === "Overdue" ? investmentOutstanding(investment) : 0),
  }), { received: 0, profit: 0, outstanding: 0, overdue: 0 });
  const columns: Column<Investment>[] = [
    { key: "investor", header: "Investor", sort: (investment) => investment.investor.toLowerCase(), render: (investment) => <div className="max-w-48 whitespace-normal break-words"><div className="font-medium">{investment.investor}</div>{investment.contact && <div className="mt-1 text-xs text-zinc-500">{investment.contact}</div>}</div> },
    { key: "amount", header: "Received", align: "right", sort: (investment) => investment.amount, render: (investment) => <div>{fmt(investment.amount)}<div className="mt-1 text-xs text-zinc-500">{fmtDate(investment.receivedAt)}</div></div> },
    { key: "promisedReturn", header: "Total owed", align: "right", sort: (investment) => investment.promisedReturn, render: (investment) => fmt(investment.promisedReturn) },
    { key: "dueAt", header: "Due date", sort: (investment) => investment.dueAt, render: (investment) => <span className={investmentStatus(investment, date) === "Overdue" ? "text-signal" : "text-zinc-500"}>{fmtDate(investment.dueAt)}</span> },
    { key: "repaidAmount", header: "Repaid", align: "right", sort: (investment) => investment.repaidAmount, render: (investment) => <div>{fmt(investment.repaidAmount)}{investment.repaidAt && <div className="mt-1 text-xs text-zinc-500">{fmtDate(investment.repaidAt)}</div>}</div> },
    { key: "outstanding", header: "Outstanding", align: "right", sort: investmentOutstanding, render: (investment) => <span className="font-semibold">{fmt(investmentOutstanding(investment))}</span> },
    { key: "status", header: "Status", sort: (investment) => investmentStatus(investment, date), render: (investment) => { const state = investmentStatus(investment, date); return <Badge dot tone={statusTones[state]}>{state}</Badge>; } },
    { key: "statement", header: "", render: (investment) => <IconButton label={`View statement for ${investment.investor}`} onClick={(event) => { event.stopPropagation(); setStatementId(investment.id); }}><FileText /></IconButton> },
    { key: "edit", header: "", render: (investment) => <IconButton label={`Edit investment from ${investment.investor}`} onClick={(event) => { event.stopPropagation(); open({ kind: "investment", record: investment }); }}><Pencil /></IconButton> },
  ];
  const statementInvestment = investments.find((investment) => investment.id === statementId);
  const statementPayments = data.investmentPayments.filter((payment) => payment.investmentId === statementId);

  return (
    <>
      <PageHeader title="Investments" subtitle={`${investments.length} investment${investments.length === 1 ? "" : "s"}`} actions={<Button onClick={() => open({ kind: "investment" })}><Plus /> Add investment</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-5 border-y border-dashed border-zinc-300 py-5 sm:grid-cols-4 dark:border-zinc-800">
        {([ ["Capital received", totals.received], ["Promised investor profit", totals.profit], ["Outstanding", totals.outstanding], ["Overdue", totals.overdue] ] as const).map(([label, amount]) => (
          <div key={label} className="min-w-0">
            <div className="label-mono text-zinc-500">{label}</div>
            <div className={`mt-2 break-words font-mono text-lg font-semibold tabular sm:text-xl ${label === "Overdue" && amount > 0 ? "text-signal" : ""}`}>{fmt(amount)}</div>
          </div>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Chips value={status} onChange={setStatus} options={INVESTMENT_STATUSES} />
        <SearchInput value={query} onChange={setQuery} placeholder="Search investors..." />
      </div>
      <Card>
        <DataTable columns={columns} rows={filtered} initialSort={{ key: "dueAt", dir: "asc" }} onRowClick={(investment) => open({ kind: "investment", record: investment })} empty={<EmptyState icon={<HandCoins />} title={investments.length ? "No matching investments" : "No investments"} />} />
      </Card>
      {statementInvestment && <InvestmentStatement investment={statementInvestment} payments={statementPayments} onClose={() => setStatementId(null)} />}
    </>
  );
}

function InvestmentStatement({ investment, payments, onClose }: { investment: Investment; payments: ReturnType<typeof useData>["investmentPayments"]; onClose(): void }) {
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const previousAmount = Math.max(0, investment.repaidAmount - paid);
  const entries = payments.map((payment) => ({ id: payment.id, date: payment.date, description: payment.note || "Repayment", amount: payment.amount }));
  if (previousAmount > 0) entries.push({ id: "legacy-payment", date: investment.repaidAt || investment.receivedAt, description: "Previously recorded total; itemized history unavailable", amount: previousAmount });
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const printStatement = () => {
    document.body.classList.add("printing-statement");
    window.addEventListener("afterprint", () => document.body.classList.remove("printing-statement"), { once: true });
    window.print();
  };

  return (
    <Modal open onClose={onClose} wide title="Investor statement" footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button className="statement-no-print" onClick={printStatement}><FileText /> Print / Save PDF</Button></>}>
      <article className="statement-print-area space-y-6 py-3">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-300 pb-4 dark:border-zinc-700">
          <div>
            <div className="label-mono text-zinc-500">Investor statement</div>
            <h2 className="mt-2 text-2xl font-semibold">{investment.investor}</h2>
            {investment.contact && <p className="mt-1 text-sm text-zinc-500">{investment.contact}</p>}
          </div>
          <div className="text-sm sm:text-right"><div className="text-zinc-500">Issued {fmtDate(today())}</div><div className="mt-1">Due {fmtDate(investment.dueAt)}</div></div>
        </header>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {([["Received", investment.amount], ["Total promised", investment.promisedReturn], ["Repaid", investment.repaidAmount], ["Outstanding", investmentOutstanding(investment)]] as const).map(([label, amount]) => (
            <div key={label} className="border-b border-zinc-200 pb-3 dark:border-zinc-800"><div className="label-mono text-zinc-500">{label}</div><div className="mt-2 font-mono text-lg font-semibold tabular">{fmt(amount)}</div></div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div><span className="text-zinc-500">Received on</span><div className="mt-1 font-medium">{fmtDate(investment.receivedAt)}</div></div>
          <div><span className="text-zinc-500">Investor return</span><div className="mt-1 font-medium">{fmt(investment.promisedReturn - investment.amount)}</div></div>
          <div><span className="text-zinc-500">Status</span><div className="mt-1 font-medium">{investmentStatus(investment)}</div></div>
        </div>
        <section>
          <h3 className="mb-2 font-medium">Payment history</h3>
          {entries.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-zinc-300 text-left text-zinc-500 dark:border-zinc-700"><th className="py-2 pr-3 font-normal">Date</th><th className="py-2 pr-3 font-normal">Description</th><th className="py-2 text-right font-normal">Amount</th></tr></thead><tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">{entries.map((entry) => <tr key={entry.id}><td className="py-2 pr-3 whitespace-nowrap">{fmtDate(entry.date)}</td><td className="py-2 pr-3">{entry.description}</td><td className="py-2 text-right font-mono tabular">{fmt(entry.amount)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-zinc-500">No repayments recorded.</p>}
        </section>
        {investment.notes && <section className="border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800"><h3 className="mb-1 font-medium">Notes</h3><p className="whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">{investment.notes}</p></section>}
      </article>
    </Modal>
  );
}