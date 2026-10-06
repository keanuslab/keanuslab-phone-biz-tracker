import { useState } from "react";
import { HandCoins, Pencil, Plus } from "lucide-react";
import { useData } from "../data/store";
import { useEditors } from "../components/editors";
import { DataTable, type Column } from "../components/DataTable";
import { Badge, Button, Card, Chips, EmptyState, IconButton, PageHeader, SearchInput, type Tone } from "../components/ui";
import { fmt, fmtDate, today } from "../lib/format";
import { INVESTMENT_STATUSES, investmentOutstanding, investmentStatus, type InvestmentStatus } from "../lib/investments";
import type { Investment } from "../lib/types";

const statusTones: Record<InvestmentStatus, Tone> = { Open: "sky", Overdue: "rose", Repaid: "emerald" };

export function Investments() {
  const { investments } = useData();
  const open = useEditors();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<InvestmentStatus | "All">("All");
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
    { key: "edit", header: "", render: (investment) => <IconButton label={`Edit investment from ${investment.investor}`} onClick={(event) => { event.stopPropagation(); open({ kind: "investment", record: investment }); }}><Pencil /></IconButton> },
  ];

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
    </>
  );
}