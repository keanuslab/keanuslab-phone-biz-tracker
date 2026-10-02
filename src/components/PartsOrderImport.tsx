import { useState, type FormEvent } from "react";
import { FileUp, Plus, Trash2 } from "lucide-react";
import { useData } from "../data/store";
import { useFeedback } from "./feedback";
import { Button, Field, IconButton, Input, Modal, Select, Textarea } from "./ui";
import { parsePartsOrder, type OrderLine } from "../lib/partsOrder";
import { PART_CATEGORIES } from "../lib/types";
import { fmt, today } from "../lib/format";

export function PartsOrderImport({ onClose }: { onClose(): void }) {
  const data = useData();
  const { run, toast } = useFeedback();
  const [text, setText] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [logExpense, setLogExpense] = useState(false);
  const update = (key: string, patch: Partial<OrderLine>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  const total = lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitCost) || 0), 0);

  const read = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setProgress("Opening document...");
    try {
      const { readOrderDocument } = await import("../lib/orderDocument");
      const extracted = await readOrderDocument(file, setProgress);
      setText(extracted);
      setReference(file.name);
      const detected = parsePartsOrder(extracted, data.parts);
      setLines(detected);
      if (!detected.length) toast("No order rows detected. Edit the extracted text or add rows manually.", "error");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not read this document.", "error");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const ok = await run(() => data.receivePartsOrder(lines, date, reference.trim() || "Parts receipt", logExpense), "Order added to the shelf");
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal open wide onClose={busy ? () => undefined : onClose} title="Import parts order" footer={<>
      <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button type="submit" form="parts-order" disabled={busy || !lines.length}><FileUp /> {busy ? "Processing..." : `Receive ${lines.length} lines`}</Button>
    </>}>
      <form id="parts-order" onSubmit={submit} className="space-y-4 py-2">
        <Field label="PDF or screenshot">
          {(id) => <Input id={id} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { void read(event.target.files?.[0]); event.target.value = ""; }} />}
        </Field>
        {busy && <p role="status" className="font-mono text-xs text-zinc-500">{progress || "Saving order..."}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Order reference">{(id) => <Input id={id} value={reference} maxLength={200} disabled={busy} onChange={(event) => setReference(event.target.value)} />}</Field>
          <Field label="Received date">{(id) => <Input id={id} type="date" required disabled={busy} value={date} onChange={(event) => setDate(event.target.value)} />}</Field>
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-zinc-500">Extracted text</summary>
          <Textarea aria-label="Extracted order text" className="mt-2 font-mono text-xs" rows={6} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} />
          <Button className="mt-2" variant="secondary" disabled={busy} onClick={() => setLines(parsePartsOrder(text, data.parts))}>Detect rows again</Button>
        </details>
        <fieldset disabled={busy} className="space-y-3">
          {lines.map((line) => <div key={line.key} className="border-b border-dashed border-zinc-200 py-3 dark:border-zinc-800">
            <div className="mb-2 flex gap-2">
              <select aria-label="Shelf part" value={line.partId} onChange={(event) => {
                const part = data.parts.find((item) => item.id === event.target.value);
                update(line.key, part ? { partId: part.id, name: part.name, category: part.category ?? "Other", compatible: part.compatible ?? "" } : { partId: "" });
              }} className="min-w-0 flex-1 rounded-lg bg-zinc-100 p-2 text-sm dark:bg-zinc-900">
                <option value="">Create a new shelf part</option>
                {data.parts.map((part) => <option key={part.id} value={part.id}>{part.name} ({part.qtyOnHand} in stock)</option>)}
              </select>
              <IconButton label="Remove order line" onClick={() => setLines(lines.filter((item) => item.key !== line.key))}><Trash2 /></IconButton>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Part name">{(id) => <Input id={id} required maxLength={200} value={line.name} readOnly={!!line.partId} onChange={(event) => update(line.key, { name: event.target.value })} />}</Field>
              <Field label="Category">{(id) => <Select id={id} disabled={!!line.partId} options={PART_CATEGORIES} value={line.category} onChange={(event) => update(line.key, { category: event.target.value })} />}</Field>
              <Field label="Compatible models">{(id) => <Input id={id} value={line.compatible} readOnly={!!line.partId} onChange={(event) => update(line.key, { compatible: event.target.value })} />}</Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Quantity">{(id) => <Input id={id} required type="number" min="1" step="1" value={line.qty} onChange={(event) => update(line.key, { qty: event.target.value })} />}</Field>
                <Field label={`Unit cost (${data.settings.currency})`}>{(id) => <Input id={id} required type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => update(line.key, { unitCost: event.target.value })} />}</Field>
              </div>
            </div>
          </div>)}
          <Button variant="secondary" disabled={lines.length >= 100} onClick={() => setLines([...lines, { key: crypto.randomUUID(), partId: "", name: "", category: "Other", compatible: "", qty: "1", unitCost: "" }])}><Plus /> Add line</Button>
          <div className="flex flex-wrap justify-between gap-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={logExpense} onChange={(event) => setLogExpense(event.target.checked)} />Log as a parts-stock expense</label>
            <span className="font-mono">Total: {fmt(total)}</span>
          </div>
        </fieldset>
        <p className="text-xs text-zinc-500">Review every row before receiving. Confirm unit prices, currency and tax treatment; shipping and totals are not shelf parts. Receiving the same order twice adds stock twice. Files are read on this device; OCR language files are downloaded when needed.</p>
      </form>
    </Modal>
  );
}