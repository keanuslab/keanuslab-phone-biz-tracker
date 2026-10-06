import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { firestoreBackend, localBackend, type Backend, type DocData, type Op } from "./backend";
import { useAuth } from "./auth";
import { db } from "../lib/firebase";
import { setCurrency, num, today } from "../lib/format";
import { buildSeed } from "./seed";
import { nextStockIds } from "../lib/stockId";
import { applyOrderLine, type OrderLine } from "../lib/partsOrder";
import { validateInvestment } from "../lib/investments";
import {
  COLLECTIONS,
  DEFAULT_SETTINGS,
  DEVICE_STATUSES,
  REPAIR_STATUSES,
  type CollectionName,
  type Collections,
  type Device,
  type Expense,
  type Investment,
  type Part,
  type PartLine,
  type Repair,
  type Settings,
} from "../lib/types";

type New<T> = Omit<T, "id"> & { id?: string };

const normalizeLines = (lines: unknown): PartLine[] =>
  Array.isArray(lines)
    ? lines.map((p) => ({
        ...(p.partId ? { partId: String(p.partId) } : {}),
        name: String(p.name ?? ""),
        unitCost: num(p.unitCost ?? p.cost),
        qty: num(p.qty ?? p.quantity) || 1,
      }))
    : [];

const legacyRepairStatus: Record<string, Repair["status"]> = { Open: "Intake", Paid: "Collected" };

// Fields written by the v1 app that the current schema (and rules) don't allow.
const withoutLegacy = ({ createdAt: _c, partsCost: _p, ...rest }: DocData) => rest;

const normalize = {
  devices: (d: DocData): Device => ({
    ...(withoutLegacy(d) as unknown as Device),
    model: String(d.model ?? ""),
    purchasePrice: num(d.purchasePrice),
    purchasedAt: String(d.purchasedAt ?? ""),
    status: DEVICE_STATUSES.includes(d.status as Device["status"]) ? (d.status as Device["status"]) : "Acquired",
    parts: normalizeLines(d.parts),
  }),
  repairs: (d: DocData): Repair => {
    const s = String(d.status ?? "");
    return {
      ...(withoutLegacy(d) as unknown as Repair),
      status: REPAIR_STATUSES.includes(s as Repair["status"]) ? (s as Repair["status"]) : legacyRepairStatus[s] ?? "Intake",
      parts: normalizeLines(d.parts),
    };
  },
  expenses: (d: DocData): Expense => ({ ...(withoutLegacy(d) as unknown as Expense), amount: num(d.amount) }),
  investments: (d: DocData): Investment => ({
    ...(d as unknown as Investment),
    amount: num(d.amount),
    promisedReturn: num(d.promisedReturn),
    repaidAmount: num(d.repaidAmount),
    contact: String(d.contact ?? ""),
    repaidAt: String(d.repaidAt ?? ""),
    notes: String(d.notes ?? ""),
  }),
  parts: (d: DocData): Part => ({
    ...(d as unknown as Part),
    qtyOnHand: num(d.qtyOnHand),
    unitCost: num(d.unitCost),
    lowStock: num(d.lowStock),
  }),
};

function stockOps(prev: PartLine[], next: PartLine[], parts: Part[]): Op[] {
  const delta = new Map<string, number>();
  for (const p of prev) if (p.partId) delta.set(p.partId, (delta.get(p.partId) ?? 0) + p.qty);
  for (const p of next) if (p.partId) delta.set(p.partId, (delta.get(p.partId) ?? 0) - p.qty);
  const ids = new Set(parts.map((p) => p.id));
  return [...delta.entries()]
    .filter(([id, by]) => by !== 0 && ids.has(id))
    .map(([id, by]) => ({ type: "increment", col: "parts", id, field: "qtyOnHand", by }));
}

type State = { [K in CollectionName]: Collections[K][] } & { settings: Settings };

function useDataState(backend: Backend | null) {
  const [state, setState] = useState<State>({ devices: [], repairs: [], expenses: [], parts: [], investments: [], settings: DEFAULT_SETTINGS });
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setState({ devices: [], repairs: [], expenses: [], parts: [], investments: [], settings: DEFAULT_SETTINGS });
    setLoaded(new Set());
    if (!backend) return;
    const markLoaded = (col: string) => setLoaded((s) => (s.has(col) ? s : new Set(s).add(col)));
    const onError = (e: Error) => setError(e.message);
    const unsubs = COLLECTIONS.map((col) =>
      backend.subscribe(col, (docs) => {
        setState((s) => ({ ...s, [col]: docs.map((d) => normalize[col](d)) }));
        markLoaded(col);
      }, onError),
    );
    unsubs.push(
      backend.subscribe("meta", (docs) => {
        const settings = { ...DEFAULT_SETTINGS, ...(docs.find((d) => d.id === "settings") ?? {}) } as Settings;
        setCurrency(settings.currency);
        setState((s) => ({ ...s, settings }));
        markLoaded("meta");
      }, onError),
    );
    return () => unsubs.forEach((u) => u());
  }, [backend]);

  return { state, loading: loaded.size < COLLECTIONS.length + 1, error };
}

function createActions(backend: Backend, state: State) {
  const withId = <T extends { id?: string }>(rec: T) => ({ ...rec, id: rec.id || backend.newId() });

  return {
    async saveDevice(rec: New<Device>): Promise<Device> {
      const prev = rec.id ? state.devices.find((d) => d.id === rec.id) : undefined;
      const data = withId(rec);
      data.stockId = rec.stockId || prev?.stockId || nextStockIds(state.devices, 1)[0];
      if (data.status === "Sold" && !data.soldAt) data.soldAt = today();
      await backend.commit([{ type: "set", col: "devices", id: data.id, data }, ...stockOps(prev?.parts ?? [], data.parts, state.parts)]);
      return data;
    },
    async deleteDevice(d: Device) {
      await backend.commit([{ type: "delete", col: "devices", id: d.id }, ...stockOps(d.parts, [], state.parts)]);
    },
    async saveRepair(rec: New<Repair>) {
      const prev = rec.id ? state.repairs.find((r) => r.id === rec.id) : undefined;
      const data = withId(rec);
      const done = data.status === "Done" || data.status === "Collected";
      if (done && !data.completedAt) data.completedAt = today();
      if (!done) delete data.completedAt;
      await backend.commit([{ type: "set", col: "repairs", id: data.id, data }, ...stockOps(prev?.parts ?? [], data.parts, state.parts)]);
    },
    async deleteRepair(r: Repair) {
      await backend.commit([{ type: "delete", col: "repairs", id: r.id }, ...stockOps(r.parts, [], state.parts)]);
    },
    async saveExpense(rec: New<Expense>) {
      const data = withId(rec);
      await backend.commit([{ type: "set", col: "expenses", id: data.id, data }]);
    },
    async deleteExpense(x: Expense) {
      await backend.commit([{ type: "delete", col: "expenses", id: x.id }]);
    },
    async saveInvestment(rec: New<Investment>) {
      const data = withId(rec);
      validateInvestment(data);
      if (data.repaidAmount === 0) data.repaidAt = "";
      await backend.commit([{ type: "set", col: "investments", id: data.id, data }]);
    },
    async deleteInvestment(investment: Investment) {
      await backend.commit([{ type: "delete", col: "investments", id: investment.id }]);
    },
    async savePart(rec: New<Part>) {
      const data = withId(rec);
      await backend.commit([{ type: "set", col: "parts", id: data.id, data }]);
    },
    async deletePart(p: Part) {
      await backend.commit([{ type: "delete", col: "parts", id: p.id }]);
    },
    async restockPart(p: Part, qty: number, unitCost: number, date: string, logExpense: boolean) {
      const held = Math.max(0, p.qtyOnHand);
      const avgCost = held + qty > 0 ? (held * p.unitCost + qty * unitCost) / (held + qty) : unitCost;
      const ops: Op[] = [{ type: "set", col: "parts", id: p.id, data: { ...p, qtyOnHand: p.qtyOnHand + qty, unitCost: Math.round(avgCost * 100) / 100 } }];
      if (logExpense) {
        ops.push({
          type: "set",
          col: "expenses",
          id: backend.newId(),
          data: { date, category: "Parts stock", description: `Restock: ${qty}× ${p.name}`, amount: Math.round(qty * unitCost * 100) / 100 },
        });
      }
      await backend.commit(ops);
    },
    async receivePartsOrder(lines: OrderLine[], date: string, reference: string, logExpense: boolean) {
      if (!lines.length || lines.length > 100) throw new Error("Import between 1 and 100 order lines.");
      const updated = new Map<string, Part>();
      let total = 0;
      for (const line of lines) {
        const qty = Number(line.qty);
        const cost = Number(line.unitCost);
        if (!line.name.trim() || !line.qty.trim() || !line.unitCost.trim() || !Number.isInteger(qty) || qty < 1 || !Number.isFinite(cost) || cost < 0) {
          throw new Error("Each line needs a name, whole quantity and nonnegative unit cost.");
        }
        const id = line.partId || backend.newId();
        const existing = updated.get(id) ?? state.parts.find((part) => part.id === id);
        if (line.partId && !existing) throw new Error("A selected shelf part no longer exists.");
        const part = existing ?? { id, name: line.name.trim(), category: line.category, compatible: line.compatible.trim(), qtyOnHand: 0, unitCost: 0, lowStock: 2 };
        updated.set(id, applyOrderLine(part, qty, cost));
        total += qty * cost;
      }
      const ops: Op[] = [...updated.values()].map((part) => ({ type: "set", col: "parts", id: part.id, data: { ...part } }));
      if (logExpense) ops.push({ type: "set", col: "expenses", id: backend.newId(), data: { date, category: "Parts stock", description: `Order: ${reference}`.slice(0, 500), amount: Math.round(total * 100) / 100 } });
      await backend.commit(ops);
    },
    async saveSettings(settings: Settings) {
      await backend.commit([{ type: "set", col: "meta", id: "settings", data: { ...settings } }]);
    },
    async importRecords(col: CollectionName, docs: DocData[]) {
      if (col === "investments") {
        docs = docs.map((doc) => {
          const investment = normalize.investments(doc);
          validateInvestment(investment);
          if (investment.repaidAmount === 0) investment.repaidAt = "";
          return { ...investment };
        });
      }
      if (col === "devices") {
        const taken = new Set(state.devices.map((d) => d.stockId).filter(Boolean));
        const assigned: Pick<Device, "stockId">[] = [...state.devices];
        for (const d of docs) {
          const wanted = typeof d.stockId === "string" ? d.stockId.trim() : "";
          d.stockId = wanted && !taken.has(wanted) ? wanted : nextStockIds(assigned, 1)[0];
          taken.add(d.stockId as string);
          assigned.push({ stockId: d.stockId as string });
        }
      }
      await backend.commit(docs.map((d) => ({ type: "set", col, id: backend.newId(), data: d })));
    },
  };
}

type Actions = ReturnType<typeof createActions>;

interface DataContextValue extends State, Actions {
  loading: boolean;
  error: string | null;
  isDemo: boolean;
  clearDemo(): void;
  loadSampleData(): Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const backend = useMemo(() => {
    if (!user) return null;
    if (user.demo || !db) {
      const b = localBackend();
      if (b.isEmpty()) void b.commit(buildSeed(b.newId));
      return b;
    }
    return firestoreBackend(db, user.uid);
  }, [user]);

  const { state, loading, error } = useDataState(backend);

  // Give devices created before stock IDs existed an ID, oldest purchase first.
  useEffect(() => {
    if (!backend || loading) return;
    const missing = state.devices
      .filter((d) => !d.stockId)
      .sort((a, b) => (a.purchasedAt || "").localeCompare(b.purchasedAt || "") || a.id.localeCompare(b.id));
    if (!missing.length) return;
    const ids = nextStockIds(state.devices, missing.length);
    void backend
      .commit(missing.map((d, i) => ({ type: "set", col: "devices", id: d.id, data: { ...d, stockId: ids[i] } })))
      .catch(() => undefined);
  }, [backend, loading, state.devices]);

  const value = useMemo<DataContextValue | null>(() => {
    if (!backend) return null;
    return {
      ...state,
      ...createActions(backend, state),
      loading,
      error,
      isDemo: !!user?.demo,
      clearDemo: () => "clear" in backend && (backend as ReturnType<typeof localBackend>).clear(),
      loadSampleData: () => backend.commit(buildSeed(backend.newId)),
    };
  }, [backend, state, loading, error, user]);

  if (!value) return <>{children}</>;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within a signed-in DataProvider");
  return ctx;
}
