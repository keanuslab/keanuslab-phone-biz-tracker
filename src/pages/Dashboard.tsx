import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Clock, HandCoins, PackageX, Wrench } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "../data/auth";
import { useData } from "../data/store";
import { useEditors } from "../components/editors";
import { Goals } from "../components/Goals";
import { Card, IconButton, PageHeader, Profit, Segmented } from "../components/ui";
import {
  avgDaysToSell,
  daysInStock,
  deviceCost,
  isLowStock,
  monthlySeries,
  partsUsage,
  pctChange,
  periodRange,
  summarize,
  topModels,
  type PeriodKind,
} from "../lib/calc";
import { cx, daysBetween, fmt, fmtCompact, fmtPct, today } from "../lib/format";
import { useTheme } from "../lib/theme";
import { groupLabel } from "../lib/models";
import { investmentOutstanding, investmentStatus, isInvestmentDueSoon } from "../lib/investments";

const palette = (dark: boolean) => {
  const ink = dark ? "#f2f2f2" : "#1a1a1a";
  return { accent: ink, flips: ink, repairs: "#38bdf8", expenses: "#d71921", revenue: "#10b981" };
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Delta({ value, invert, onDark }: { value: number | null; invert?: boolean; onDark?: boolean }) {
  if (value == null || !Number.isFinite(value)) return null;
  const good = invert ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cx("inline-flex items-center gap-0.5 font-mono text-xs", !good ? "text-signal" : onDark ? "text-emerald-400 dark:text-emerald-600" : "text-emerald-600 dark:text-emerald-400")}>
      <Icon className="size-3" />
      {fmtPct(value)}
    </span>
  );
}

function Kpi({ label, value, delta, sub, invert, inverted, dot }: { label: string; value: number; delta: number | null; sub: string; invert?: boolean; inverted?: boolean; dot: string }) {
  return (
    <Card className={cx("flex flex-col justify-between p-5", inverted && "border-zinc-900! bg-zinc-900! text-white dark:border-white! dark:bg-white! dark:text-black")}>
      <div className="flex items-center justify-between">
        <span className={cx("label-mono inline-flex items-center gap-2", inverted ? "text-white/60 dark:text-black/50" : "text-zinc-500")}>
          <span className={cx("size-2 rounded-full", dot)} />
          {label}
        </span>
        <Delta value={delta} invert={invert} onDark={inverted} />
      </div>
      <div className={cx("mt-6 font-dot text-3xl leading-none font-bold tracking-tight tabular sm:text-4xl", value < 0 && "text-signal")}>{fmt(value)}</div>
      <div className={cx("mt-3 font-mono text-[11px]", inverted ? "text-white/60 dark:text-black/50" : "text-zinc-500")}>{sub}</div>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="bg-white px-5 py-4 dark:bg-zinc-950">
      <div className="label-mono text-zinc-500">{label}</div>
      <div className="mt-2 font-dot text-2xl leading-none font-bold tabular">{value}</div>
      {sub && <div className="mt-1.5 font-mono text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: readonly { name?: string | number; value?: unknown; color?: string; payload?: { label?: string } }[]; label?: unknown }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-zinc-900 px-3 py-2 font-mono text-[11px] text-white shadow-lg dark:bg-white dark:text-black">
      <div className="mb-1 uppercase opacity-60">{payload[0].payload?.label ?? String(label ?? "")}</div>
      {payload.map((p) => (
        <div key={String(p.name)} className="flex items-center gap-2">
          <span className="size-1.5 rounded-full" style={{ background: p.color === "#1a1a1a" ? "#fff" : p.color === "#f2f2f2" ? "#000" : p.color }} />
          <span className="uppercase opacity-70">{p.name}</span>
          <span className="ml-auto pl-3 tabular">{fmt(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cx("p-5", className)}>
      <div className="mb-5 flex items-baseline justify-between gap-2">
        <h3 className="label-mono font-bold">{title}</h3>
        {subtitle && <p className="label-mono text-zinc-400">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const data = useData();
  const open = useEditors();
  const { theme } = useTheme();
  const [kind, setKind] = useState<PeriodKind>("month");
  const [offset, setOffset] = useState(0);

  const range = useMemo(() => periodRange(kind, offset), [kind, offset]);
  const prevRange = useMemo(() => periodRange(kind, offset - 1), [kind, offset]);
  const cur = useMemo(() => summarize(data, range), [data, range]);
  const prev = useMemo(() => summarize(data, prevRange), [data, prevRange]);
  const series = useMemo(() => monthlySeries(data, 12, kind === "month" ? offset : 0), [data, kind, offset]);
  const top = useMemo(() => topModels(data.devices), [data.devices]);
  const usage = useMemo(() => {
    const u = partsUsage(data);
    const names = new Map(data.parts.map((p) => [p.id, p.name]));
    return [...u.entries()]
      .map(([key, v]) => ({ name: key.startsWith("name:") ? groupLabel(v.names) : names.get(key) ?? groupLabel(v.names), qty: v.qty, cost: v.cost }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);
  }, [data]);

  const stock = data.devices.filter((d) => d.status !== "Sold");
  const stale = stock.filter((d) => daysInStock(d) > 30).sort((a, b) => daysInStock(b) - daysInStock(a));
  const low = data.parts.filter(isLowStock);
  const pickup = data.repairs.filter((r) => r.status === "Done");
  const waitingParts = data.repairs.filter((r) => r.status === "Waiting parts");
  const openRepairs = data.repairs.filter((r) => r.status !== "Done" && r.status !== "Collected");
  const currentDate = today();
  const investmentAlerts = data.investments
    .filter((investment) => investmentStatus(investment, currentDate) === "Overdue" || isInvestmentDueSoon(investment, currentDate))
    .sort((a, b) => (investmentStatus(a, currentDate) === "Overdue" ? 0 : 1) - (investmentStatus(b, currentDate) === "Overdue" ? 0 : 1) || a.dueAt.localeCompare(b.dueAt))
    .map((investment) => {
      const overdue = investmentStatus(investment, currentDate) === "Overdue";
      const days = daysBetween(currentDate, investment.dueAt);
      const due = days === 0 ? "due today" : `due in ${days} day${days === 1 ? "" : "s"}`;
      return {
        icon: <HandCoins />,
        text: `${investment.investor} — ${fmt(investmentOutstanding(investment))} ${overdue ? "overdue" : due}`,
        to: "/investments",
        tone: overdue ? "text-signal" : "text-amber-500",
      };
    });
  const avgDays = avgDaysToSell(data.devices);
  const hasPrev = kind !== "all";

  const COLORS = palette(theme === "dark");
  const mix = [
    { name: "Flips", value: Math.max(0, cur.flipProfit), color: COLORS.flips },
    { name: "Repairs", value: Math.max(0, cur.repairProfit), color: COLORS.repairs },
  ];
  const mixTotal = mix[0].value + mix[1].value;

  const axis = theme === "dark" ? "#5c5c5c" : "#a3a3a3";
  const grid = theme === "dark" ? "#1f1f1f" : "#ececec";

  const attention: { icon: ReactNode; text: string; to: string; tone: string }[] = [
    ...investmentAlerts,
    ...low.map((p) => ({ icon: <PackageX />, text: `${p.name} — ${p.qtyOnHand} left`, to: "/parts", tone: "text-amber-500" })),
    ...pickup.map((r) => ({ icon: <Wrench />, text: `${r.customer}'s ${r.device} is ready for pickup`, to: "/repairs", tone: "text-emerald-500" })),
    ...waitingParts.map((r) => ({ icon: <Clock />, text: `${r.device} for ${r.customer} is waiting on parts`, to: "/repairs", tone: "text-violet-500" })),
    ...stale.map((d) => ({ icon: <AlertTriangle />, text: `${d.model} unsold for ${daysInStock(d)} days`, to: "/inventory", tone: "text-signal" })),
  ].slice(0, 6);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user?.name.split(" ")[0]}`}
        subtitle={`Here's how ${data.settings.businessName || "the business"} is doing · ${range.label}`}
        actions={
          <>
            <Segmented
              value={kind}
              onChange={(k) => {
                setKind(k);
                setOffset(0);
              }}
              options={[
                { value: "month", label: "Month" },
                { value: "quarter", label: "Quarter" },
                { value: "year", label: "Year" },
                { value: "all", label: "All" },
              ]}
            />
            {kind !== "all" && (
              <div className="flex">
                <IconButton label="Previous period" onClick={() => setOffset((o) => o - 1)}>
                  <ChevronLeft />
                </IconButton>
                <IconButton label="Next period" onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0} className="disabled:opacity-30">
                  <ChevronRight />
                </IconButton>
              </div>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi inverted dot="bg-signal" label="Net profit" value={cur.net} delta={hasPrev ? pctChange(cur.net, prev.net) : null} sub="Flips + repairs − operating expenses" />
        <Kpi dot="bg-emerald-500" label="Revenue" value={cur.revenue} delta={hasPrev ? pctChange(cur.revenue, prev.revenue) : null} sub={`${cur.soldCount} devices sold · ${cur.repairCount} repairs`} />
        <Kpi dot="bg-zinc-900 dark:bg-white" label="Flip profit" value={cur.flipProfit} delta={hasPrev ? pctChange(cur.flipProfit, prev.flipProfit) : null} sub={`${fmt(cur.flipRevenue)} in sales`} />
        <Kpi dot="bg-sky-400" label="Repair profit" value={cur.repairProfit} delta={hasPrev ? pctChange(cur.repairProfit, prev.repairProfit) : null} sub={`${fmt(cur.repairRevenue)} charged`} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-200/70 bg-zinc-200/70 sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800">
        <Stat label="Operating expenses" value={fmt(cur.operatingExpenses)} sub={cur.allExpenses !== cur.operatingExpenses ? `${fmt(cur.allExpenses - cur.operatingExpenses)} parts stock bought` : range.label} />
        <Stat label="Devices in stock" value={stock.length} sub={`${fmt(stock.reduce((s, d) => s + deviceCost(d), 0))} invested`} />
        <Stat label="Open repairs" value={openRepairs.length} sub={`${pickup.length} ready for pickup`} />
        <Stat label="Avg days to sell" value={avgDays ?? "—"} sub="All time" />
      </div>

      <Goals />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Net profit" subtitle="Last 12 months" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="net-grad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={grid} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: axis, fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: axis, fontSize: 12 }} tickFormatter={(v: number) => fmtCompact(v)} width={56} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: axis, strokeDasharray: "3 3" }} />
                <Area type="monotone" dataKey="net" name="net profit" stroke={COLORS.accent} strokeWidth={2} fill="url(#net-grad)" dot={{ r: 2.5, fill: COLORS.accent, strokeWidth: 0 }} activeDot={{ r: 4, fill: "#d71921", strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Profit mix" subtitle={range.label}>
          {mixTotal > 0 ? (
            <div className="flex flex-col items-center">
              <div className="relative h-44 w-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={mix} dataKey="value" nameKey="name" innerRadius="70%" outerRadius="100%" paddingAngle={3} stroke="none" cornerRadius={6}>
                      {mix.map((m) => (
                        <Cell key={m.name} fill={m.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs text-zinc-500">Gross</span>
                  <span className="font-dot text-xl font-bold tabular">{fmtCompact(mixTotal)}</span>
                </div>
              </div>
              <div className="mt-5 w-full space-y-2">
                {mix.map((m) => (
                  <div key={m.name} className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 rounded-full" style={{ background: m.color }} />
                    <span className="text-zinc-600 dark:text-zinc-400">{m.name}</span>
                    <span className="ml-auto font-medium tabular">{fmt(m.value)}</span>
                    <span className="w-10 text-right text-xs text-zinc-500 tabular">{Math.round((m.value / mixTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-zinc-500">No profit recorded in this period yet.</p>
          )}
        </ChartCard>

        <ChartCard title="Revenue vs. expenses" subtitle="Last 12 months" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid vertical={false} stroke={grid} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: axis, fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: axis, fontSize: 12 }} tickFormatter={(v: number) => fmtCompact(v)} width={56} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: grid }} />
                <Bar dataKey="revenue" name="revenue" fill={COLORS.revenue} radius={[2, 2, 0, 0]} maxBarSize={14} />
                <Bar dataKey="expenses" name="expenses" fill={COLORS.expenses} radius={[2, 2, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Needs attention">
          {attention.length ? (
            <ul className="space-y-1">
              {attention.map((a, i) => (
                <li key={i}>
                  <Link to={a.to} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900">
                    <span className={cx("[&_svg]:size-4", a.tone)}>{a.icon}</span>
                    <span className="truncate">{a.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-16 text-center text-sm text-zinc-500">All clear. Nothing needs your attention.</p>
          )}
        </ChartCard>

        <ChartCard title="Best models to flip" subtitle="All time, by total profit" className="lg:col-span-2">
          {top.length ? (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="label-mono">
                  <tr className="border-b border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-800">
                    <th className="px-5 py-2 text-left font-medium">Model</th>
                    <th className="px-3 py-2 text-right font-medium">Sold</th>
                    <th className="px-3 py-2 text-right font-medium">Avg profit</th>
                    <th className="px-3 py-2 text-right font-medium">Avg days</th>
                    <th className="px-5 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {top.map((m) => (
                    <tr key={m.model}>
                      <td className="px-5 py-2.5 font-medium whitespace-nowrap">{m.model}</td>
                      <td className="px-3 py-2.5 text-right tabular">{m.count}</td>
                      <td className="px-3 py-2.5 text-right"><Profit value={m.avgProfit} /></td>
                      <td className="px-3 py-2.5 text-right text-zinc-500 tabular">{m.avgDays ?? "—"}</td>
                      <td className="px-5 py-2.5 text-right"><Profit value={m.profit} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-zinc-500">
              No sales yet.{" "}
              <button type="button" className="font-mono underline underline-offset-4 hover:text-signal" onClick={() => open({ kind: "device" })}>
                Add a device
              </button>
            </p>
          )}
        </ChartCard>

        <ChartCard title="Most used parts" subtitle="All time">
          {usage.length ? (
            <div className="space-y-3">
              {usage.map((u) => (
                <div key={u.name}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate text-zinc-600 dark:text-zinc-400">{u.name}</span>
                    <span className="shrink-0 font-medium tabular">{u.qty}× · {fmt(u.cost)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="h-full rounded-full bg-sky-400" style={{ width: `${(u.qty / usage[0].qty) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-zinc-500">No parts used yet.</p>
          )}
        </ChartCard>
      </div>
    </>
  );
}
