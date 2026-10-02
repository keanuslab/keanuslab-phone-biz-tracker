import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Link2, Plus, Trash2 } from "lucide-react";
import { useData } from "../data/store";
import { useEditors } from "../components/editors";
import { Button, Card, Field, Input, PageHeader, Profit, Select } from "../components/ui";
import { comparableSales, matchingParts, median, suggestedRepairs, type RepairCategory } from "../lib/deal";
import { fmt, num, today } from "../lib/format";
import { parseWillhaben, parseWillhabenUrl } from "../lib/willhaben";
import { CONDITIONS, PART_CATEGORIES, type Part } from "../lib/types";

interface Listing {
  url: string;
  adCode: string;
  title: string;
  description: string;
  price?: number;
  imageUrl?: string;
}

interface RepairRow {
  key: string;
  category: string;
  partId: string;
  name: string;
  cost: string;
}

const row = (category: string, part?: Part): RepairRow => ({
  key: crypto.randomUUID(), category, partId: part?.id ?? "", name: part?.name ?? category, cost: part ? String(part.unitCost) : "",
});
const validMoney = (value: string) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;

export function DealCheck() {
  const { devices, repairs, parts } = useData();
  const open = useEditors();
  const [url, setUrl] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState("");
  const [storage, setStorage] = useState("");
  const [color, setColor] = useState("");
  const [condition, setCondition] = useState<string>(CONDITIONS[1]);
  const [battery, setBattery] = useState<number | undefined>();
  const [unlocked, setUnlocked] = useState(false);
  const [purchase, setPurchase] = useState("");
  const [sale, setSale] = useState("");
  const [fees, setFees] = useState("0");
  const [shipping, setShipping] = useState("0");
  const [lines, setLines] = useState<RepairRow[]>([]);
  const [suggestions, setSuggestions] = useState<RepairCategory[]>([]);
  const [addCategory, setAddCategory] = useState<string>(PART_CATEGORIES[0]);

  const sales = useMemo(() => comparableSales(devices, model, storage), [devices, model, storage]);
  const historicalPrice = median(sales.map((device) => device.salePrice!));
  const missingCosts = lines.some((line) => !validMoney(line.cost));
  const partsTotal = lines.reduce((sum, line) => sum + num(line.cost), 0);
  const validPurchase = validMoney(purchase);
  const validSale = validMoney(sale);
  const validExtras = validMoney(fees) && validMoney(shipping);
  const totalCost = validPurchase && validExtras && !missingCosts ? num(purchase) + partsTotal + num(fees) + num(shipping) : null;
  const profit = totalCost != null && validSale ? num(sale) - totalCost : null;

  const load = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseWillhabenUrl(url);
    if (!parsed) { setError("Enter a valid willhaben listing link."); return; }
    setLoading(true);
    setError("");
    setListing(null);
    try {
      const response = await fetch(`/api/willhaben?url=${encodeURIComponent(parsed.toString())}`);
      const body = await response.json() as Listing & { error?: string };
      if (!response.ok) throw new Error(body.error || "The listing could not be loaded.");
      const used = [...devices.map((device) => device.model), ...repairs.map((repair) => repair.device)];
      const draft = parseWillhaben(body.url, `${body.title}\nBeschreibung ${body.description}`, used);
      const detectedModel = draft.model ?? "";
      const detectedStorage = draft.storage ?? "";
      const faults = suggestedRepairs(`${body.title}\n${body.description}`, draft.battery);
      const comps = comparableSales(devices, detectedModel, detectedStorage);
      setListing(body);
      setModel(detectedModel);
      setStorage(detectedStorage);
      setColor(draft.color ?? "");
      setCondition(draft.condition ?? CONDITIONS[1]);
      setBattery(draft.battery);
      setUnlocked(!!draft.unlocked);
      setPurchase(body.price != null ? String(body.price) : "");
      setSale(median(comps.map((device) => device.salePrice!))?.toString() ?? "");
      setFees(median(comps.map((device) => device.saleFees ?? 0))?.toString() ?? "0");
      setShipping(median(comps.map((device) => device.shippingCost ?? 0))?.toString() ?? "0");
      setSuggestions(faults);
      setLines(faults.map((category) => row(category, matchingParts(parts, detectedModel, category)[0])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The listing could not be loaded.");
    } finally { setLoading(false); }
  };

  const updateLine = (key: string, patch: Partial<RepairRow>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  const choosePart = (line: RepairRow, partId: string) => {
    const part = parts.find((item) => item.id === partId);
    updateLine(line.key, part ? { partId: part.id, name: part.name, cost: String(part.unitCost) } : { partId: "", name: line.category, cost: "" });
  };
  const toInventory = () => {
    if (!listing || !validPurchase || !model.trim()) return;
    open({ kind: "device", preset: {
      model: model.trim(), storage: storage.trim(), color: color.trim(), condition, batteryBought: battery,
      purchasePrice: num(purchase), purchasedAt: today(), source: "willhaben", status: "Acquired",
      imageUrl: listing.imageUrl,
      notes: [`willhaben: ${listing.url}`, `willhaben-Code: ${listing.adCode}`, `Ad: ${listing.title}`, listing.description && `Description: ${listing.description}`,
        `Deal check: planned parts ${lines.length ? lines.map((line) => `${line.name} ${fmt(num(line.cost))}`).join(", ") : "none"}; expected sale ${validSale ? fmt(num(sale)) : "unknown"}; expected fees ${fmt(num(fees))}; shipping ${fmt(num(shipping))}; forecast profit ${profit == null ? "unknown" : fmt(profit)}.`,
      ].filter(Boolean).join("\n").slice(0, 5000),
    } });
  };

  return <>
    <PageHeader title="Deal check" subtitle="Estimate a willhaben purchase before adding it to inventory." />
    <Card className="p-5 sm:p-6">
      <form onSubmit={load} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="willhaben ad link" className="flex-1">{(id) => <Input id={id} type="url" required disabled={loading} placeholder="https://www.willhaben.at/iad/kaufen-und-verkaufen/d/…" value={url} onChange={(event) => setUrl(event.target.value)} />}</Field>
        <Button type="submit" disabled={loading}><Link2 /> {loading ? "Loading…" : "Analyze"}</Button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-signal">{error}</p>}
    </Card>
    {listing && <div className="mt-5 space-y-5">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row">
          {listing.imageUrl && <img src={listing.imageUrl} alt="" referrerPolicy="no-referrer" className="h-36 w-full rounded-xl bg-zinc-50 object-contain sm:w-44 dark:bg-zinc-900" />}
          <div className="min-w-0 flex-1">
            <a href={listing.url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">{listing.title}</a>
            <p className="mt-1 text-sm text-zinc-500">Asking price: {fmt(listing.price)} · Code {listing.adCode}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Model">{(id) => <Input id={id} value={model} onChange={(event) => setModel(event.target.value)} />}</Field>
              <Field label="Storage">{(id) => <Input id={id} value={storage} onChange={(event) => setStorage(event.target.value)} />}</Field>
              <Field label="Colour">{(id) => <Input id={id} value={color} onChange={(event) => setColor(event.target.value)} />}</Field>
              <Field label="Condition">{(id) => <Select id={id} options={CONDITIONS} value={condition} onChange={(event) => setCondition(event.target.value)} />}</Field>
            </div>
            <p className="mt-3 text-xs text-zinc-500">Battery: {battery != null ? `${battery}%` : "not stated"} · Unlocked: {unlocked ? "stated" : "unknown"}. Check all extracted details against the ad.</p>
          </div>
        </div>
      </Card>
      <Card className="p-5 sm:p-6">
        <h2 className="font-dot text-xl font-bold uppercase">Repairs & parts</h2>
        <p className="mt-1 text-sm text-zinc-500">Suggestions come from faults mentioned in the ad. Check the device before buying; labour and hidden damage are not included.</p>
        {suggestions.length > 0 && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Detected: {suggestions.join(", ")}{battery != null && battery < 80 ? ` · battery ${battery}%` : ""}</p>}
        {condition === "Faulty" && suggestions.length === 0 && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">The ad says the device is faulty, but no specific repair could be identified. Inspect it and add likely costs manually.</p>}
        <div className="mt-4 space-y-3">
          {lines.map((line) => {
            const matches = matchingParts(parts, model, line.category);
            const selected = parts.find((part) => part.id === line.partId);
            return <div key={line.key} className="grid gap-2 rounded-xl bg-zinc-50 p-3 sm:grid-cols-[9rem_1fr_7rem_auto] dark:bg-zinc-900/60">
              <span className="self-center text-sm font-medium">{line.category}</span>
              <div>
                <select aria-label={`${line.category} part`} className="h-10 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-zinc-300 dark:bg-black dark:ring-zinc-700" value={line.partId} onChange={(event) => choosePart(line, event.target.value)}>
                  <option value="">Manual cost</option>
                  {matches.map((part) => <option key={part.id} value={part.id}>{part.name} · {fmt(part.unitCost)}{part.qtyOnHand < 1 ? " · out of stock" : ""}</option>)}
                  {selected && !matches.some((part) => part.id === selected.id) && <option value={selected.id}>{selected.name} · review compatibility</option>}
                </select>
                {!line.partId && <Input aria-label={`${line.category} part name`} className="mt-2" value={line.name} onChange={(event) => updateLine(line.key, { name: event.target.value })} />}
                {selected && selected.qtyOnHand < 1 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Out of stock; cost is from your catalogue.</p>}
                {!line.partId && matches.length === 0 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">No matching stock part. Enter an estimated cost.</p>}
              </div>
              <Input aria-label={`${line.category} cost`} type="number" min="0" step="0.01" placeholder="Cost €" value={line.cost} onChange={(event) => updateLine(line.key, { cost: event.target.value })} />
              <Button variant="ghost" aria-label={`Remove ${line.category}`} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}><Trash2 /></Button>
            </div>;
          })}
          {lines.length === 0 && <p className="text-sm text-zinc-500">No specific repair detected. Add any work you expect.</p>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select aria-label="Add repair category" value={addCategory} onChange={(event) => setAddCategory(event.target.value)} className="h-10 rounded-xl bg-white px-3 text-sm ring-1 ring-zinc-300 dark:bg-black dark:ring-zinc-700">
            {PART_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
          </select>
          <Button variant="secondary" onClick={() => setLines((current) => [...current, row(addCategory, matchingParts(parts, model, addCategory)[0])])}><Plus /> Add repair</Button>
        </div>
      </Card>
      <Card className="p-5 sm:p-6">
        <h2 className="font-dot text-xl font-bold uppercase">Estimated return</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Purchase price €">{(id) => <Input id={id} type="number" min="0" step="0.01" value={purchase} onChange={(event) => setPurchase(event.target.value)} />}</Field>
          <Field label="Expected sale €" hint={historicalPrice != null ? `Median of ${sales.length} matching sale${sales.length === 1 ? "" : "s"}: ${fmt(historicalPrice)}` : "No matching sales. Enter your own estimate."}>{(id) => <Input id={id} type="number" min="0" step="0.01" value={sale} onChange={(event) => setSale(event.target.value)} />}</Field>
          <Field label="Sale fees €">{(id) => <Input id={id} type="number" min="0" step="0.01" value={fees} onChange={(event) => setFees(event.target.value)} />}</Field>
          <Field label="Shipping €">{(id) => <Input id={id} type="number" min="0" step="0.01" value={shipping} onChange={(event) => setShipping(event.target.value)} />}</Field>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-zinc-50 p-4 text-sm sm:grid-cols-4 dark:bg-zinc-900/60">
          <div><span className="text-zinc-500">Parts</span><p className="font-mono">{missingCosts ? "Incomplete" : fmt(partsTotal)}</p></div>
          <div><span className="text-zinc-500">Total cost</span><p className="font-mono">{fmt(totalCost)}</p></div>
          <div><span className="text-zinc-500">Net profit</span><p><Profit value={profit} /></p></div>
          <div><span className="text-zinc-500">Return on cost</span><p className="font-mono">{profit != null && totalCost != null && totalCost > 0 ? `${Math.round(100 * profit / totalCost)}%` : "—"}</p></div>
        </div>
        {(missingCosts || !validExtras) && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Enter valid nonnegative costs for every part, fee and shipment to see a profit estimate.</p>}
        <p className="mt-3 text-xs text-zinc-500">Sale prices and fees come from your own completed sales when available. This is a forecast; actual sale price and repairs may differ.</p>
        <Button className="mt-5" disabled={!model.trim() || !validPurchase || missingCosts || !validExtras} onClick={toInventory}>Add to inventory <ArrowRight /></Button>
      </Card>
    </div>}
  </>;
}
