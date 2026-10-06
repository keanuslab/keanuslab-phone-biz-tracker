import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { FileText, Trash2 } from "lucide-react";
import { useEditors } from "./editors";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";
import { Combobox } from "./Combobox";
import { PartsEditor, fromDraftLines, toDraftLines } from "./PartsEditor";
import { useFeedback } from "./feedback";
import { useData } from "../data/store";
import { partsCost } from "../lib/calc";
import { cx, fmt, num, today } from "../lib/format";
import { STORAGE_OPTIONS, canonicalModel, modelKey, modelSuggestions } from "../lib/models";
import {
  CONDITIONS,
  DEVICE_STATUSES,
  EXPENSE_CATEGORIES,
  PART_CATEGORIES,
  REPAIR_STATUSES,
  type Device,
  type Expense,
  type Investment,
  type Part,
  type Repair,
} from "../lib/types";

const optNum = (s: string) => (s.trim() === "" ? null : num(s));
const optPct = (s: string) => (s.trim() === "" ? null : Math.min(100, Math.max(0, Math.round(num(s)))));
const str = (v: number | null | undefined) => (v == null ? "" : String(v));

const storageSuggestions = STORAGE_OPTIONS.map((s) => ({ value: s, search: s.toLowerCase() }));
const canonicalStorage = (s: string) => STORAGE_OPTIONS.find((o) => modelKey(o) === modelKey(s)) ?? s.trim();

function useModels() {
  const { devices, repairs } = useData();
  return useMemo(() => {
    const used = [...devices.map((d) => d.model), ...repairs.map((r) => r.device)].filter(Boolean);
    return { used, suggestions: modelSuggestions(used) };
  }, [devices, repairs]);
}

function useDraft<T extends object>(initial: T) {
  const [draft, setDraft] = useState(initial);
  const set = <K extends keyof T>(key: K, value: T[K]) => setDraft((d) => ({ ...d, [key]: value }));
  return [draft, set] as const;
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx("space-y-3 py-3", className)}>
      <legend className="mb-3 text-xs font-semibold tracking-wider text-zinc-400 uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

const Grid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;

function FormFooter({ formId, onClose, onDelete, saving, extra }: { formId: string; onClose(): void; onDelete?: () => void; saving: boolean; extra?: ReactNode }) {
  return (
    <>
      {onDelete && (
        <Button variant="danger" className={extra ? "" : "mr-auto"} onClick={onDelete}>
          <Trash2 /> Delete
        </Button>
      )}
      {extra && <div className="mr-auto">{extra}</div>}
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" form={formId} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </>
  );
}

function SummaryBar({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-3 rounded-2xl border border-dashed border-zinc-300 p-4 sm:grid-cols-3 dark:border-zinc-700">
      {items.map(([label, value]) => (
        <div key={label}>
          <div className="text-xs text-zinc-500">{label}</div>
          <div className="mt-0.5 font-semibold tabular">{value}</div>
        </div>
      ))}
    </div>
  );
}

const profitText = (n: number) => <span className={n < 0 ? "text-signal" : "text-emerald-600 dark:text-emerald-400"}>{fmt(n)}</span>;

function useDeleteFlow(label: string, onClose: () => void) {
  const { confirm, run } = useFeedback();
  return async (action: () => Promise<void>) => {
    if (!(await confirm({ title: `Delete ${label}?`, text: "This can't be undone. Parts used will be returned to stock.", confirmLabel: "Delete", danger: true }))) return;
    if (await run(action, `${label[0].toUpperCase()}${label.slice(1)} deleted`)) onClose();
  };
}

// ---------- Device ----------

export function DeviceForm({ device, preset, onClose }: { device?: Device; preset?: Partial<Device>; onClose(): void }) {
  const data = useData();
  const models = useModels();
  const openEditor = useEditors();
  const { run } = useFeedback();
  const src = { ...device, ...preset };
  const [d, set] = useDraft({
    model: src.model ?? "",
    storage: src.storage ?? "",
    color: src.color ?? "",
    imei: src.imei ?? "",
    condition: src.condition ?? CONDITIONS[1],
    batteryBought: str(src.batteryBought),
    batterySold: str(src.batterySold),
    source: src.source ?? "",
    purchasePrice: str(src.purchasePrice),
    purchasedAt: src.purchasedAt ?? today(),
    status: src.status ?? "Acquired",
    platform: src.platform ?? "",
    salePrice: str(src.salePrice),
    soldAt: src.soldAt ?? (src.status === "Sold" ? today() : ""),
    saleFees: str(src.saleFees),
    shippingCost: str(src.shippingCost),
    notes: src.notes ?? "",
    parts: toDraftLines(src.parts),
  });
  const [saving, setSaving] = useState(false);
  const del = useDeleteFlow("device", onClose);
  const showSale = d.status === "Sold" || d.status === "Listed";
  const cost = num(d.purchasePrice) + partsCost(fromDraftLines(d.parts));
  const profit = num(d.salePrice) - num(d.saleFees) - num(d.shippingCost) - cost;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const sold = d.status === "Sold";
    let saved: Device | undefined;
    const ok = await run(
      async () => {
        saved = await data.saveDevice({
          id: device?.id,
          stockId: device?.stockId,
          model: canonicalModel(d.model, models.used),
          storage: canonicalStorage(d.storage),
          color: d.color.trim(),
          imei: d.imei.trim(),
          condition: d.condition,
          batteryBought: optPct(d.batteryBought),
          batterySold: optPct(d.batterySold),
          source: d.source.trim(),
          purchasePrice: num(d.purchasePrice),
          purchasedAt: d.purchasedAt,
          status: d.status,
          parts: fromDraftLines(d.parts),
          platform: showSale ? d.platform.trim() : "",
          salePrice: showSale ? optNum(d.salePrice) : null,
          soldAt: sold ? d.soldAt || today() : "",
          saleFees: sold ? optNum(d.saleFees) : null,
          shippingCost: sold ? optNum(d.shippingCost) : null,
          notes: d.notes.trim(),
        });
      },
      device ? "Device updated" : "Device added",
    );
    setSaving(false);
    if (!ok) return;
    if (saved && saved.status === "Ready" && device?.status !== "Ready") openEditor({ kind: "listing", record: saved });
    else onClose();
  };

  const listingButton =
    device && device.status !== "Sold" ? (
      <Button variant="ghost" onClick={() => openEditor({ kind: "listing", record: device })} title="Generate ad text from the saved device">
        <FileText /> Listing text
      </Button>
    ) : undefined;

  return (
    <Modal open onClose={onClose} wide title={device ? `Edit ${device.stockId ?? "device"}` : "Add device"} footer={<FormFooter formId="device-form" onClose={onClose} saving={saving} onDelete={device && (() => del(() => data.deleteDevice(device)))} extra={listingButton} />}>
      <form id="device-form" onSubmit={submit} className="divide-y divide-zinc-100 dark:divide-zinc-800">
        <Section title="Device">
          <Grid>
            <Field label="Model *" className="sm:col-span-2">{(id) => <Combobox id={id} required autoFocus placeholder="Start typing, e.g. 13 pro" value={d.model} onChange={(v) => set("model", v)} onCommit={(v) => set("model", canonicalModel(v, models.used))} suggestions={models.suggestions} />}</Field>
            <Field label="Storage">{(id) => <Combobox id={id} placeholder="128GB" value={d.storage} onChange={(v) => set("storage", v)} onCommit={(v) => set("storage", canonicalStorage(v))} suggestions={storageSuggestions} />}</Field>
            <Field label="Colour">{(id) => <Input id={id} value={d.color} onChange={(e) => set("color", e.target.value)} />}</Field>
            <Field label="IMEI / Serial">{(id) => <Input id={id} value={d.imei} onChange={(e) => set("imei", e.target.value)} />}</Field>
            <Field label="Condition">{(id) => <Select id={id} options={CONDITIONS} value={d.condition} onChange={(e) => set("condition", e.target.value)} />}</Field>
            <Field label="Battery % when bought">{(id) => <Input id={id} type="number" inputMode="numeric" min="0" max="100" step="1" placeholder="e.g. 82" value={d.batteryBought} onChange={(e) => set("batteryBought", e.target.value)} />}</Field>
            <Field label="Battery % when sold" hint="Used in the listing text.">{(id) => <Input id={id} type="number" inputMode="numeric" min="0" max="100" step="1" placeholder="e.g. 100" value={d.batterySold} onChange={(e) => set("batterySold", e.target.value)} />}</Field>
          </Grid>
        </Section>
        <Section title="Purchase">
          <Grid>
            <Field label="Purchase price *">{(id) => <Input id={id} required type="number" inputMode="decimal" min="0" step="0.01" value={d.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} />}</Field>
            <Field label="Purchase date *">{(id) => <Input id={id} required type="date" value={d.purchasedAt} onChange={(e) => set("purchasedAt", e.target.value)} />}</Field>
            <Field label="Bought from">{(id) => <Input id={id} placeholder="Marketplace, trade-in…" value={d.source} onChange={(e) => set("source", e.target.value)} />}</Field>
            <Field label="Status">{(id) => <Select id={id} options={DEVICE_STATUSES} value={d.status} onChange={(e) => set("status", e.target.value as Device["status"])} />}</Field>
          </Grid>
        </Section>
        <Section title="Parts used">
          <PartsEditor value={d.parts} onChange={(v) => set("parts", v)} stock={data.parts} original={device?.parts ?? []} />
        </Section>
        {showSale && (
          <Section title="Sale">
            <Grid>
              <Field label={d.status === "Sold" ? "Sale price *" : "Listing price"}>{(id) => <Input id={id} required={d.status === "Sold"} type="number" inputMode="decimal" min="0" step="0.01" value={d.salePrice} onChange={(e) => set("salePrice", e.target.value)} />}</Field>
              <Field label="Platform">{(id) => <Input id={id} placeholder="eBay, Back Market…" value={d.platform} onChange={(e) => set("platform", e.target.value)} />}</Field>
              {d.status === "Sold" && (
                <>
                  <Field label="Sale date">{(id) => <Input id={id} type="date" value={d.soldAt} onChange={(e) => set("soldAt", e.target.value)} />}</Field>
                  <Field label="Platform fees">{(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="0.01" value={d.saleFees} onChange={(e) => set("saleFees", e.target.value)} />}</Field>
                  <Field label="Shipping cost">{(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="0.01" value={d.shippingCost} onChange={(e) => set("shippingCost", e.target.value)} />}</Field>
                </>
              )}
            </Grid>
          </Section>
        )}
        <Section title="Notes">
          <Textarea aria-label="Notes" value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth remembering…" />
        </Section>
        <SummaryBar
          items={[
            ["Total cost", fmt(cost)],
            [d.status === "Sold" ? "Profit" : "Expected profit", d.salePrice ? profitText(profit) : "—"],
            ["Margin", d.salePrice && num(d.salePrice) > 0 ? `${Math.round((profit / num(d.salePrice)) * 100)}%` : "—"],
          ]}
        />
      </form>
    </Modal>
  );
}

// ---------- Repair ----------

export function RepairForm({ repair, preset, onClose }: { repair?: Repair; preset?: Partial<Repair>; onClose(): void }) {
  const data = useData();
  const models = useModels();
  const { run } = useFeedback();
  const src = { ...repair, ...preset };
  const [r, set] = useDraft({
    customer: src.customer ?? "",
    contact: src.contact ?? "",
    device: src.device ?? "",
    issue: src.issue ?? "",
    status: src.status ?? "Intake",
    date: src.date ?? today(),
    charged: str(src.charged),
    notes: src.notes ?? "",
    parts: toDraftLines(src.parts),
  });
  const [saving, setSaving] = useState(false);
  const del = useDeleteFlow("repair", onClose);
  const cost = partsCost(fromDraftLines(r.parts));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await run(
      () =>
        data.saveRepair({
          id: repair?.id,
          customer: r.customer.trim(),
          contact: r.contact.trim(),
          device: canonicalModel(r.device, models.used),
          issue: r.issue.trim(),
          status: r.status,
          date: r.date,
          completedAt: repair?.completedAt,
          charged: optNum(r.charged),
          notes: r.notes.trim(),
          parts: fromDraftLines(r.parts),
        }),
      repair ? "Repair updated" : "Repair added",
    );
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} wide title={repair ? "Edit repair" : "New repair job"} footer={<FormFooter formId="repair-form" onClose={onClose} saving={saving} onDelete={repair && (() => del(() => data.deleteRepair(repair)))} />}>
      <form id="repair-form" onSubmit={submit} className="divide-y divide-zinc-100 dark:divide-zinc-800">
        <Section title="Customer">
          <Grid>
            <Field label="Name *">{(id) => <Input id={id} required autoFocus value={r.customer} onChange={(e) => set("customer", e.target.value)} />}</Field>
            <Field label="Phone / email">{(id) => <Input id={id} value={r.contact} onChange={(e) => set("contact", e.target.value)} />}</Field>
          </Grid>
        </Section>
        <Section title="Job">
          <Grid>
            <Field label="Device *">{(id) => <Combobox id={id} required placeholder="e.g. iPhone 12" value={r.device} onChange={(v) => set("device", v)} onCommit={(v) => set("device", canonicalModel(v, models.used))} suggestions={models.suggestions} />}</Field>
            <Field label="Received">{(id) => <Input id={id} type="date" required value={r.date} onChange={(e) => set("date", e.target.value)} />}</Field>
            <Field label="Status">{(id) => <Select id={id} options={REPAIR_STATUSES} value={r.status} onChange={(e) => set("status", e.target.value as Repair["status"])} />}</Field>
            <Field label="Amount charged">{(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="0.01" value={r.charged} onChange={(e) => set("charged", e.target.value)} />}</Field>
            <Field label="Issue / work done" className="sm:col-span-2">{(id) => <Textarea id={id} value={r.issue} onChange={(e) => set("issue", e.target.value)} />}</Field>
          </Grid>
        </Section>
        <Section title="Parts used">
          <PartsEditor value={r.parts} onChange={(v) => set("parts", v)} stock={data.parts} original={repair?.parts ?? []} />
        </Section>
        <Section title="Notes">
          <Textarea aria-label="Notes" value={r.notes} onChange={(e) => set("notes", e.target.value)} />
        </Section>
        <SummaryBar items={[["Parts cost", fmt(cost)], ["Charged", fmt(optNum(r.charged))], ["Profit", profitText(num(r.charged) - cost)]]} />
      </form>
    </Modal>
  );
}

// ---------- Expense ----------

export function ExpenseForm({ expense, onClose }: { expense?: Expense; onClose(): void }) {
  const data = useData();
  const { run } = useFeedback();
  const [x, set] = useDraft({
    date: expense?.date ?? today(),
    category: expense?.category ?? EXPENSE_CATEGORIES[1],
    description: expense?.description ?? "",
    amount: str(expense?.amount),
  });
  const [saving, setSaving] = useState(false);
  const { confirm } = useFeedback();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await run(
      () => data.saveExpense({ id: expense?.id, date: x.date, category: x.category, description: x.description.trim(), amount: num(x.amount) }),
      expense ? "Expense updated" : "Expense added",
    );
    setSaving(false);
    if (ok) onClose();
  };
  const onDelete =
    expense &&
    (async () => {
      if (await confirm({ title: "Delete expense?", confirmLabel: "Delete", danger: true })) {
        if (await run(() => data.deleteExpense(expense), "Expense deleted")) onClose();
      }
    });

  return (
    <Modal open onClose={onClose} title={expense ? "Edit expense" : "Add expense"} footer={<FormFooter formId="expense-form" onClose={onClose} saving={saving} onDelete={onDelete} />}>
      <form id="expense-form" onSubmit={submit} className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
        <Field label="Description *" className="sm:col-span-2">{(id) => <Input id={id} required autoFocus value={x.description} onChange={(e) => set("description", e.target.value)} />}</Field>
        <Field label="Amount *">{(id) => <Input id={id} required type="number" inputMode="decimal" min="0" step="0.01" value={x.amount} onChange={(e) => set("amount", e.target.value)} />}</Field>
        <Field label="Date *">{(id) => <Input id={id} required type="date" value={x.date} onChange={(e) => set("date", e.target.value)} />}</Field>
        <Field
          label="Category"
          className="sm:col-span-2"
          hint={x.category === "Parts stock" ? "Parts stock purchases are tracked as inventory and aren't deducted from profit — part costs count when used." : undefined}
        >
          {(id) => <Select id={id} options={EXPENSE_CATEGORIES} value={x.category} onChange={(e) => set("category", e.target.value)} />}
        </Field>
      </form>
    </Modal>
  );
}

export function InvestmentForm({ investment, onClose }: { investment?: Investment; onClose(): void }) {
  const data = useData();
  const { run, confirm } = useFeedback();
  const [draft, set] = useDraft({
    investor: investment?.investor ?? "",
    contact: investment?.contact ?? "",
    amount: str(investment?.amount),
    receivedAt: investment?.receivedAt ?? today(),
    promisedReturn: str(investment?.promisedReturn),
    dueAt: investment?.dueAt ?? "",
    repaidAmount: str(investment?.repaidAmount ?? 0),
    repaidAt: investment?.repaidAt ?? "",
    notes: investment?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const ok = await run(() => data.saveInvestment({
      ...draft,
      id: investment?.id,
      investor: draft.investor.trim(),
      contact: draft.contact.trim(),
      amount: Number(draft.amount),
      promisedReturn: Number(draft.promisedReturn),
      repaidAmount: Number(draft.repaidAmount),
      repaidAt: num(draft.repaidAmount) > 0 ? draft.repaidAt : "",
      notes: draft.notes.trim(),
    }), investment ? "Investment updated" : "Investment added");
    setSaving(false);
    if (ok) onClose();
  };
  const onDelete = investment && (async () => {
    if (await confirm({ title: "Delete investment?", text: "The investment and its repayment details will be permanently removed.", confirmLabel: "Delete", danger: true })) {
      if (await run(() => data.deleteInvestment(investment), "Investment deleted")) onClose();
    }
  });

  return (
    <Modal open onClose={onClose} title={investment ? "Edit investment" : "Add investment"} footer={<FormFooter formId="investment-form" onClose={onClose} saving={saving} onDelete={onDelete} />}>
      <form id="investment-form" onSubmit={submit} className="space-y-3 py-2">
        <Grid>
          <Field label="Investor *">{(id) => <Input id={id} required autoFocus maxLength={200} value={draft.investor} onChange={(event) => set("investor", event.target.value)} />}</Field>
          <Field label="Contact">{(id) => <Input id={id} maxLength={200} value={draft.contact} onChange={(event) => set("contact", event.target.value)} />}</Field>
          <Field label="Amount received *">{(id) => <Input id={id} required type="number" inputMode="decimal" min="0.01" step="0.01" value={draft.amount} onChange={(event) => set("amount", event.target.value)} />}</Field>
          <Field label="Received date *">{(id) => <Input id={id} required type="date" value={draft.receivedAt} onChange={(event) => set("receivedAt", event.target.value)} />}</Field>
          <Field label="Total repayment promised (incl. principal) *">{(id) => <Input id={id} required type="number" inputMode="decimal" min={num(draft.amount) || 0.01} step="0.01" value={draft.promisedReturn} onChange={(event) => set("promisedReturn", event.target.value)} />}</Field>
          <Field label="Repayment deadline *">{(id) => <Input id={id} required type="date" min={draft.receivedAt} value={draft.dueAt} onChange={(event) => set("dueAt", event.target.value)} />}</Field>
          <Field label="Total repaid">{(id) => <Input id={id} required type="number" inputMode="decimal" min="0" max={num(draft.promisedReturn)} step="0.01" value={draft.repaidAmount} onChange={(event) => {
            set("repaidAmount", event.target.value);
            if (num(event.target.value) > 0 && !draft.repaidAt) set("repaidAt", today());
          }} />}</Field>
          <Field label="Last repayment date">{(id) => <Input id={id} required={num(draft.repaidAmount) > 0} disabled={num(draft.repaidAmount) === 0} type="date" min={draft.receivedAt} value={draft.repaidAt} onChange={(event) => set("repaidAt", event.target.value)} />}</Field>
        </Grid>
        <Field label="Notes">{(id) => <Textarea id={id} maxLength={5000} value={draft.notes} onChange={(event) => set("notes", event.target.value)} />}</Field>
        <SummaryBar items={[
          ["Investor profit", fmt(num(draft.promisedReturn) - num(draft.amount))],
          ["Outstanding", fmt(Math.max(0, num(draft.promisedReturn) - num(draft.repaidAmount)))],
        ]} />
      </form>
    </Modal>
  );
}

// ---------- Part ----------

export function PartForm({ part, onClose }: { part?: Part; onClose(): void }) {
  const data = useData();
  const models = useModels();
  const { run, confirm } = useFeedback();
  const [p, set] = useDraft({
    name: part?.name ?? "",
    category: part?.category ?? PART_CATEGORIES[0],
    compatible: part?.compatible ?? "",
    qtyOnHand: str(part?.qtyOnHand ?? 0),
    unitCost: str(part?.unitCost),
    lowStock: str(part?.lowStock ?? 2),
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await run(
      () =>
        data.savePart({
          id: part?.id,
          name: p.name.trim(),
          category: p.category,
          compatible: canonicalModel(p.compatible, models.used),
          qtyOnHand: Math.round(num(p.qtyOnHand)),
          unitCost: num(p.unitCost),
          lowStock: Math.round(num(p.lowStock)),
        }),
      part ? "Part updated" : "Part added",
    );
    setSaving(false);
    if (ok) onClose();
  };
  const onDelete =
    part &&
    (async () => {
      if (await confirm({ title: "Delete part?", text: "Existing devices and repairs keep their recorded part costs.", confirmLabel: "Delete", danger: true })) {
        if (await run(() => data.deletePart(part), "Part deleted")) onClose();
      }
    });

  return (
    <Modal open onClose={onClose} title={part ? "Edit part" : "Add part"} footer={<FormFooter formId="part-form" onClose={onClose} saving={saving} onDelete={onDelete} />}>
      <form id="part-form" onSubmit={submit} className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
        <Field label="Name *" className="sm:col-span-2">{(id) => <Input id={id} required autoFocus placeholder="e.g. iPhone 13 OLED screen" value={p.name} onChange={(e) => set("name", e.target.value)} />}</Field>
        <Field label="Category">{(id) => <Select id={id} options={PART_CATEGORIES} value={p.category} onChange={(e) => set("category", e.target.value)} />}</Field>
        <Field label="Compatible with">{(id) => <Combobox id={id} placeholder="e.g. iPhone 13" value={p.compatible} onChange={(v) => set("compatible", v)} onCommit={(v) => set("compatible", canonicalModel(v, models.used))} suggestions={models.suggestions} />}</Field>
        <Field label="In stock">{(id) => <Input id={id} type="number" inputMode="numeric" step="1" value={p.qtyOnHand} onChange={(e) => set("qtyOnHand", e.target.value)} />}</Field>
        <Field label="Unit cost">{(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="0.01" value={p.unitCost} onChange={(e) => set("unitCost", e.target.value)} />}</Field>
        <Field label="Low-stock alert at" hint="Highlight when stock is at or below this.">{(id) => <Input id={id} type="number" inputMode="numeric" min="0" step="1" value={p.lowStock} onChange={(e) => set("lowStock", e.target.value)} />}</Field>
      </form>
    </Modal>
  );
}

export function RestockForm({ part, onClose }: { part: Part; onClose(): void }) {
  const data = useData();
  const { run } = useFeedback();
  const [f, set] = useDraft({ qty: "1", unitCost: str(part.unitCost), date: today(), logExpense: true });
  const [saving, setSaving] = useState(false);
  const total = num(f.qty) * num(f.unitCost);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await run(() => data.restockPart(part, Math.round(num(f.qty)), num(f.unitCost), f.date, f.logExpense), `Restocked ${part.name}`);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Restock · ${part.name}`} footer={<FormFooter formId="restock-form" onClose={onClose} saving={saving} />}>
      <form id="restock-form" onSubmit={submit} className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-3">
        <Field label="Quantity *">{(id) => <Input id={id} required autoFocus type="number" inputMode="numeric" min="1" step="1" value={f.qty} onChange={(e) => set("qty", e.target.value)} />}</Field>
        <Field label="Unit cost *">{(id) => <Input id={id} required type="number" inputMode="decimal" min="0" step="0.01" value={f.unitCost} onChange={(e) => set("unitCost", e.target.value)} />}</Field>
        <Field label="Date">{(id) => <Input id={id} type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />}</Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" className="size-4 rounded accent-accent-400" checked={f.logExpense} onChange={(e) => set("logExpense", e.target.checked)} />
          Log {fmt(total)} as a “Parts stock” expense
        </label>
        <p className="text-xs text-zinc-500 sm:col-span-3">
          Stock goes {part.qtyOnHand} → {part.qtyOnHand + Math.round(num(f.qty))}. Unit cost becomes the weighted average.
        </p>
      </form>
    </Modal>
  );
}
