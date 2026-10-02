import type { Device, Expense, Part, PartLine, Repair } from "./types";
import { daysBetween, isoDate, num, today } from "./format";
import { groupLabel, modelKey } from "./models";
import { isSoldStatus } from "./status";

export const partsCost = (lines: PartLine[] = []) => lines.reduce((s, p) => s + num(p.unitCost) * (num(p.qty) || 1), 0);
export const deviceCost = (d: Device) => num(d.purchasePrice) + partsCost(d.parts);
export const deviceProfit = (d: Device) =>
  isSoldStatus(d.status) ? num(d.salePrice) - num(d.saleFees) - num(d.shippingCost) - deviceCost(d) : null;

export const isRepairDone = (r: Repair) => r.status === "Done" || r.status === "Collected";
export const repairDate = (r: Repair) => r.completedAt || r.date;
export const repairProfit = (r: Repair) => num(r.charged) - partsCost(r.parts);

export const daysInStock = (d: Device) => daysBetween(d.purchasedAt, isSoldStatus(d.status) && d.soldAt ? d.soldAt : today());

// Parts purchases are inventory; their cost is counted when a part is used on a device/repair.
export const INVENTORY_EXPENSE_CATEGORY = "Parts stock";
export const isOperatingExpense = (x: Expense) => x.category !== INVENTORY_EXPENSE_CATEGORY;

export type PeriodKind = "month" | "quarter" | "year" | "all";
export interface Range {
  start: string;
  end: string;
  label: string;
}

const monthName = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const monthShort = new Intl.DateTimeFormat(undefined, { month: "short" });

export function periodRange(kind: PeriodKind, offset = 0): Range {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (kind === "all") return { start: "0000-01-01", end: "9999-12-31", label: "All time" };
  if (kind === "year") {
    return { start: isoDate(new Date(y + offset, 0, 1)), end: isoDate(new Date(y + offset + 1, 0, 1)), label: String(y + offset) };
  }
  if (kind === "quarter") {
    const s = new Date(y, Math.floor(m / 3) * 3 + offset * 3, 1);
    const e = new Date(s.getFullYear(), s.getMonth() + 3, 1);
    return { start: isoDate(s), end: isoDate(e), label: `Q${Math.floor(s.getMonth() / 3) + 1} ${s.getFullYear()}` };
  }
  const s = new Date(y, m + offset, 1);
  return { start: isoDate(s), end: isoDate(new Date(s.getFullYear(), s.getMonth() + 1, 1)), label: monthName.format(s) };
}

export const inRange = (date: string | undefined, r: Range) => !!date && date >= r.start && date < r.end;

export interface Data {
  devices: Device[];
  repairs: Repair[];
  expenses: Expense[];
  parts: Part[];
}

export function summarize(data: Data, r: Range) {
  const sold = data.devices.filter((d) => isSoldStatus(d.status) && inRange(d.soldAt, r));
  const repairs = data.repairs.filter((x) => isRepairDone(x) && inRange(repairDate(x), r));
  const expenses = data.expenses.filter((x) => inRange(x.date, r));

  const flipRevenue = sold.reduce((s, d) => s + num(d.salePrice), 0);
  const flipProfit = sold.reduce((s, d) => s + (deviceProfit(d) ?? 0), 0);
  const repairRevenue = repairs.reduce((s, x) => s + num(x.charged), 0);
  const repairProfitSum = repairs.reduce((s, x) => s + repairProfit(x), 0);
  const operatingExpenses = expenses.filter(isOperatingExpense).reduce((s, x) => s + num(x.amount), 0);
  const allExpenses = expenses.reduce((s, x) => s + num(x.amount), 0);

  return {
    soldCount: sold.length,
    repairCount: repairs.length,
    flipRevenue,
    flipProfit,
    repairRevenue,
    repairProfit: repairProfitSum,
    revenue: flipRevenue + repairRevenue,
    operatingExpenses,
    allExpenses,
    net: flipProfit + repairProfitSum - operatingExpenses,
  };
}

export type Summary = ReturnType<typeof summarize>;

export function monthlySeries(data: Data, months = 12, endOffset = 0) {
  return Array.from({ length: months }, (_, i) => {
    const r = periodRange("month", endOffset - (months - 1 - i));
    const s = summarize(data, r);
    return {
      month: monthShort.format(new Date(`${r.start}T00:00:00`)),
      label: r.label,
      revenue: s.revenue,
      expenses: s.operatingExpenses,
      net: s.net,
      flips: s.flipProfit,
      repairs: s.repairProfit,
    };
  });
}

export const pctChange = (cur: number, prev: number) => (prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);

export function avgDaysToSell(devices: Device[]) {
  const timed = devices.filter((d) => isSoldStatus(d.status) && d.purchasedAt && d.soldAt);
  if (!timed.length) return null;
  return Math.round(timed.reduce((s, d) => s + daysBetween(d.purchasedAt, d.soldAt!), 0) / timed.length);
}

export function topModels(devices: Device[], limit = 6) {
  const byModel = new Map<string, { names: string[]; count: number; profit: number; days: number[] }>();
  for (const d of devices) {
    if (!isSoldStatus(d.status)) continue;
    const key = modelKey(d.model);
    const m = byModel.get(key) ?? { names: [], count: 0, profit: 0, days: [] };
    m.names.push(d.model.trim());
    m.count++;
    m.profit += deviceProfit(d) ?? 0;
    if (d.purchasedAt && d.soldAt) m.days.push(daysBetween(d.purchasedAt, d.soldAt));
    byModel.set(key, m);
  }
  return [...byModel.values()]
    .map((m) => ({
      model: groupLabel(m.names),
      count: m.count,
      profit: m.profit,
      avgProfit: m.profit / m.count,
      avgDays: m.days.length ? Math.round(m.days.reduce((a, b) => a + b, 0) / m.days.length) : null,
    }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, limit);
}

export function partsUsage(data: Pick<Data, "devices" | "repairs">) {
  const usage = new Map<string, { names: string[]; qty: number; cost: number }>();
  for (const rec of [...data.devices, ...data.repairs]) {
    for (const p of rec.parts ?? []) {
      if (!p.name) continue;
      const key = p.partId ?? `name:${modelKey(p.name)}`;
      const u = usage.get(key) ?? { names: [], qty: 0, cost: 0 };
      u.names.push(p.name.trim());
      const qty = num(p.qty) || 1;
      u.qty += qty;
      u.cost += num(p.unitCost) * qty;
      usage.set(key, u);
    }
  }
  return usage;
}

export const isLowStock = (p: Part) => num(p.qtyOnHand) <= num(p.lowStock);
