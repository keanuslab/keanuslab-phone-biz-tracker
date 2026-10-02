import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { useData } from "../data/store";
import { useAuth } from "../data/auth";
import { Button, Field, Input, Modal } from "./ui";
import { parseWillhaben, parseWillhabenUrl } from "../lib/willhaben";
import { fmt, today } from "../lib/format";
import type { Device } from "../lib/types";
import { auth } from "../lib/firebase";

interface ListingResponse {
  url: string;
  adCode: string;
  title: string;
  description: string;
  price?: number;
  imageUrl?: string;
}

export function WillhabenImport({ onClose, onContinue }: { onClose(): void; onContinue(preset: Partial<Device>): void }) {
  const { devices, repairs } = useData();
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [listing, setListing] = useState<ListingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const used = useMemo(() => [...devices.map((d) => d.model), ...repairs.map((r) => r.device)].filter(Boolean), [devices, repairs]);
  const parsedUrl = parseWillhabenUrl(url);
  const manual = pastedText.trim().length > 0;
  const draft = useMemo(() => listing || manual ? parseWillhaben(url, manual ? pastedText : `${listing?.title ?? ""}\n${listing?.description ?? ""}`, used) : null, [listing, manual, pastedText, url, used]);

  useEffect(() => {
    setListing(null);
    setError("");
    setLoading(false);
    if (!parsedUrl || manual || !user || user.demo || !auth?.currentUser) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const token = await auth!.currentUser!.getIdToken();
        const response = await fetch(`/api/willhaben?url=${encodeURIComponent(parsedUrl.toString())}`, { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } });
        const body = await response.json().catch(() => ({})) as ListingResponse & { error?: string };
        if (!response.ok) throw new Error(body.error || "Automatic loading is unavailable. Paste the ad text instead.");
        setListing(body);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Automatic loading is unavailable. Paste the ad text instead.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [parsedUrl?.toString(), manual, user?.uid, user?.demo]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft || (!manual && (!listing || listing.url !== parsedUrl?.toString()))) return;
    const source = manual ? pastedText : listing?.description ?? "";
    const notes = [
      parsedUrl && `willhaben: ${parsedUrl}`,
      (listing?.adCode || draft.adCode) && `willhaben-Code: ${listing?.adCode ?? draft.adCode}`,
      (listing?.title || draft.title) && `Ad: ${listing?.title ?? draft.title}`,
      source && `Description: ${source}`,
      draft.unlocked && "Unlocked (no SIM lock)",
    ].filter(Boolean).join("\n").slice(0, 5000);
    onContinue({
      model: draft.model ?? listing?.title ?? "",
      storage: draft.storage,
      color: draft.color,
      condition: draft.condition,
      batteryBought: draft.battery,
      purchasePrice: manual ? draft.price : listing?.price,
      purchasedAt: today(),
      source: "willhaben",
      status: "Acquired",
      imageUrl: manual ? undefined : listing?.imageUrl,
      notes,
    });
  };

  const rows: [string, string | undefined][] = [
    ["Model", draft?.model],
    ["Storage", draft?.storage],
    ["Colour", draft?.color],
    ["Condition", draft?.condition],
    ["Price", (manual ? draft?.price : listing?.price) != null ? fmt((manual ? draft?.price : listing?.price)!) : undefined],
    ["Battery", draft?.battery != null ? `${draft.battery}%` : undefined],
    ["Unlocked", draft?.unlocked ? "Yes" : undefined],
  ];

  return (
    <Modal open onClose={onClose} title="Import from willhaben" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button type="submit" form="willhaben-form" disabled={!draft || (!manual && (loading || !listing || listing.url !== parsedUrl?.toString()))}>Continue <ArrowRight /></Button>
    </>}>
      <form id="willhaben-form" onSubmit={submit} className="space-y-4 py-2">
        <Field label="Ad link" hint="Paste a willhaben listing link. Signed-in users can load details automatically.">
          {(id) => <Input id={id} type="url" autoFocus placeholder="https://www.willhaben.at/iad/kaufen-und-verkaufen/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />}
        </Field>
        {url.trim() && !parsedUrl && <p className="text-sm text-signal">Enter a valid willhaben listing link.</p>}
        {loading && <p role="status" className="text-sm text-zinc-500">Loading listing…</p>}
        {error && !manual && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        <Field label="Ad text" hint="Paste the title, description and price when automatic loading is unavailable. You can edit all fields on the next screen.">
          {(id) => <textarea id={id} value={pastedText} onChange={(e) => setPastedText(e.target.value)} rows={5} maxLength={20000} placeholder="Paste the listing text here…" className="w-full rounded-xl border border-zinc-300 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" />}
        </Field>
        {(listing || manual) && (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
            {!manual && listing?.imageUrl && <img src={listing.imageUrl} alt={listing.title} referrerPolicy="no-referrer" className="h-48 w-full object-contain bg-zinc-50 dark:bg-zinc-900" />}
            <div className="p-4">
              <p className="mb-3 font-medium">{manual ? draft?.title ?? "Pasted listing" : listing?.title}</p>
              <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
                {rows.map(([label, value]) => <div key={label} className="contents"><dt className="text-zinc-500">{label}</dt><dd className={value ? "font-mono" : "text-zinc-400"}>{value ?? "—"}</dd></div>)}
              </dl>
              <p className="mt-3 text-xs text-zinc-500">The asking price is prefilled as the purchase price. You can adjust it on the next screen.</p>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
