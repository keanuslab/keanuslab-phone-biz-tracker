import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, FileUp, PackagePlus, Plus } from "lucide-react";
import { PartsOrderImport } from "../components/PartsOrderImport";
import { useData } from "../data/store";
import { useEditors } from "../components/editors";
import { DataTable, type Column } from "../components/DataTable";
import { Badge, Button, Card, EmptyState, PageHeader, SearchInput } from "../components/ui";
import { isLowStock, partsUsage } from "../lib/calc";
import { fmt } from "../lib/format";
import type { Part } from "../lib/types";

export function Parts() {
  const { parts, devices, repairs } = useData();
  const open = useEditors();
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [importOrder, setImportOrder] = useState(false);

  const usage = useMemo(() => partsUsage({ devices, repairs }), [devices, repairs]);
  const low = parts.filter(isLowStock);
  const stockValue = parts.reduce((s, p) => s + Math.max(0, p.qtyOnHand) * p.unitCost, 0);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return parts.filter((p) => (!lowOnly || isLowStock(p)) && (!term || [p.name, p.category, p.compatible].some((v) => v?.toLowerCase().includes(term))));
  }, [parts, q, lowOnly]);

  const columns: Column<Part>[] = [
    {
      key: "name",
      header: "Part",
      sort: (p) => p.name.toLowerCase(),
      render: (p) => (
        <div>
          <div className="font-medium">{p.name}</div>
          <div className="text-xs text-zinc-500">{[p.category, p.compatible].filter(Boolean).join(" · ") || "—"}</div>
        </div>
      ),
    },
    {
      key: "qty",
      header: "In stock",
      align: "right",
      sort: (p) => p.qtyOnHand,
      render: (p) => (isLowStock(p) ? <Badge tone={p.qtyOnHand <= 0 ? "rose" : "amber"}>{p.qtyOnHand}</Badge> : <span className="font-medium">{p.qtyOnHand}</span>),
    },
    { key: "cost", header: "Unit cost", align: "right", sort: (p) => p.unitCost, render: (p) => fmt(p.unitCost) },
    { key: "value", header: "Stock value", align: "right", sort: (p) => p.qtyOnHand * p.unitCost, render: (p) => fmt(Math.max(0, p.qtyOnHand) * p.unitCost) },
    { key: "used", header: "Used", align: "right", sort: (p) => usage.get(p.id)?.qty ?? 0, render: (p) => <span className="text-zinc-500">{usage.get(p.id)?.qty ?? 0}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            open({ kind: "restock", record: p });
          }}
        >
          <PackagePlus /> Restock
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Parts stock"
        subtitle={`${parts.length} parts · ${fmt(stockValue)} on the shelf`}
        actions={
          <>
          <Button variant="secondary" onClick={() => setImportOrder(true)}><FileUp /> Import order</Button>
          <Button onClick={() => open({ kind: "part" })}>
            <Plus /> Add part
          </Button>
          </>
        }
      />

      {low.length > 0 && (
        <button
          type="button"
          onClick={() => setLowOnly((v) => !v)}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-left text-sm transition hover:border-amber-400"
        >
          <AlertTriangle className="size-4 shrink-0 text-amber-500" />
          <span className="flex-1">
            <b className="font-semibold">{low.length}</b> part{low.length > 1 ? "s are" : " is"} running low: {low.slice(0, 3).map((p) => p.name).join(", ")}
            {low.length > 3 && "…"}
          </span>
          <span className="label-mono underline-offset-2 hover:underline">{lowOnly ? "Show all" : "Show only these"}</span>
        </button>
      )}

      <div className="mb-4">
        <SearchInput value={q} onChange={setQ} placeholder="Search parts…" />
      </div>

      <Card>
        <DataTable
          columns={columns}
          rows={filtered}
          initialSort={{ key: "name", dir: "asc" }}
          onRowClick={(p) => open({ kind: "part", record: p })}
          empty={
            <EmptyState
              icon={<Boxes />}
              title={parts.length ? "No matches" : "No parts in stock"}
              text={parts.length ? "Try a different search." : "Add replacement parts you keep on hand. Stock goes down automatically as you use them in repairs and devices."}
              action={!parts.length && <Button onClick={() => open({ kind: "part" })}><Plus /> Add part</Button>}
            />
          }
        />
      </Card>
      {importOrder && <PartsOrderImport onClose={() => setImportOrder(false)} />}
    </>
  );
}
