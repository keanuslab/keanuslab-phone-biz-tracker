import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "react-router";
import { Download, FileUp, LogOut, Plus, RotateCcw, Sparkles, Trash2, Upload } from "lucide-react";
import { useAuth } from "../data/auth";
import { useData } from "../data/store";
import { useFeedback } from "../components/feedback";
import { AccessManager } from "../components/AccessManager";
import { Button, Card, Field, IconButton, Input, Modal, PageHeader, Select } from "../components/ui";
import { exportCsv, parseCsv, type ParsedImport } from "../lib/csv";
import { GOAL_METRICS } from "../lib/goals";
import { num } from "../lib/format";
import { COLLECTIONS, CURRENCIES, type CollectionName, type GoalMetric } from "../lib/types";

const labels: Record<CollectionName, string> = { devices: "Inventory", repairs: "Repairs", expenses: "Expenses", parts: "Parts stock", investments: "Investments" };
const metricKeys = Object.keys(GOAL_METRICS) as GoalMetric[];

function Section({ id, title, text, children }: { id?: string; title: string; text: string; children: ReactNode }) {
  return (
    <Card className="grid scroll-mt-24 gap-6 p-6 md:grid-cols-[16rem_1fr]">
      <div id={id}>
        <h2 className="font-medium">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{text}</p>
      </div>
      <div>{children}</div>
    </Card>
  );
}

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const data = useData();
  const { run, confirm } = useFeedback();
  const [businessName, setBusinessName] = useState(data.settings.businessName);
  const [currency, setCurrency] = useState(data.settings.currency);
  const [importCol, setImportCol] = useState<CollectionName>("devices");
  const [preview, setPreview] = useState<ParsedImport | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [goals, setGoals] = useState(() => data.settings.goals.map((g) => ({ metric: g.metric, target: String(g.target) })));
  const { hash } = useLocation();

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [hash]);

  const saveProfile = (e: FormEvent) => {
    e.preventDefault();
    void run(() => data.saveSettings({ ...data.settings, businessName: businessName.trim(), currency }), "Settings saved");
  };

  const saveGoals = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = goals.filter((g) => num(g.target) > 0).map((g) => ({ metric: g.metric, target: num(g.target) }));
    void run(() => data.saveSettings({ ...data.settings, goals: cleaned }), "Goals saved");
  };
  const unusedMetric = metricKeys.find((m) => !goals.some((g) => g.metric === m));

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      setPreview(await parseCsv(importCol, file));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doImport = async () => {
    if (!preview) return;
    setBusy(true);
    const ok = await run(() => data.importRecords(importCol, preview.docs), `Imported ${preview.docs.length} ${labels[importCol].toLowerCase()} records`);
    setBusy(false);
    if (ok) setPreview(null);
  };

  const previewKeys = preview?.matched.slice(0, 6) ?? [];

  return (
    <>
      <PageHeader title="Settings" subtitle={user?.demo ? "Demo session" : `Signed in as ${user?.email}`} />
      <div className="space-y-4">
        <Section title="Business" text="Shown in the sidebar and dashboard. Currency is used for all amounts.">
          <form onSubmit={saveProfile} className="grid max-w-lg gap-3 sm:grid-cols-[1fr_9rem]">
            <Field label="Business name">{(id) => <Input id={id} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="My Phone Shop" maxLength={80} />}</Field>
            <Field label="Currency">{(id) => <Select id={id} options={CURRENCIES} value={currency} onChange={(e) => setCurrency(e.target.value)} />}</Field>
            <div className="sm:col-span-2">
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </Section>

        <Section id="goals" title="Monthly goals" text="Targets reset each month. The dashboard shows progress and projects when you'll hit each one, based on your last 30 days.">
          <form onSubmit={saveGoals} className="max-w-lg space-y-3">
            {goals.map((g, i) => (
              <div key={g.metric} className="grid grid-cols-[1fr_9rem_auto] items-end gap-2">
                <Field label="Metric">
                  {(id) => (
                    <Select
                      id={id}
                      options={metricKeys.filter((m) => m === g.metric || !goals.some((o) => o.metric === m)).map((m) => GOAL_METRICS[m].label)}
                      value={GOAL_METRICS[g.metric].label}
                      onChange={(e) => {
                        const metric = metricKeys.find((m) => GOAL_METRICS[m].label === e.target.value)!;
                        setGoals(goals.map((x, j) => (j === i ? { ...x, metric } : x)));
                      }}
                    />
                  )}
                </Field>
                <Field label={GOAL_METRICS[g.metric].money ? `Target (${data.settings.currency})` : "Target"}>
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      inputMode="decimal"
                      min="1"
                      step={GOAL_METRICS[g.metric].money ? "0.01" : "1"}
                      required
                      value={g.target}
                      onChange={(e) => setGoals(goals.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}
                    />
                  )}
                </Field>
                <IconButton label="Remove goal" onClick={() => setGoals(goals.filter((_, j) => j !== i))} className="mb-0.5 hover:text-signal!">
                  <Trash2 />
                </IconButton>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              {unusedMetric && (
                <Button variant="secondary" onClick={() => setGoals([...goals, { metric: unusedMetric, target: "" }])}>
                  <Plus /> Add goal
                </Button>
              )}
              <Button type="submit">Save goals</Button>
            </div>
          </form>
        </Section>

        <Section title="Export" text="Download your data as CSV — opens in Excel, Numbers or Google Sheets.">
          <div className="flex flex-wrap gap-2">
            {COLLECTIONS.map((c) => (
              <Button key={c} variant="secondary" onClick={() => exportCsv(c, data[c])}>
                <Download /> {labels[c]} <span className="text-zinc-400 tabular">{data[c].length}</span>
              </Button>
            ))}
          </div>
        </Section>

        <Section title="Import" text="Add records from a CSV file. Column headers are matched to field names (e.g. model, purchasePrice, purchasedAt). Import doesn't change parts stock.">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Import into" className="w-48">{(id) => <Select id={id} options={COLLECTIONS.map((c) => labels[c])} value={labels[importCol]} onChange={(e) => setImportCol(COLLECTIONS.find((c) => labels[c] === e.target.value)!)} />}</Field>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <FileUp /> Choose CSV…
            </Button>
          </div>
          <p className="mt-3 text-xs text-zinc-500">Tip: export first to get a template with the right column names.</p>
        </Section>

        {data.isDemo ? (
          <Section title="Demo data" text="Everything here lives only in this browser.">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  if (await confirm({ title: "Reset demo data?", text: "All demo records will be deleted.", confirmLabel: "Reset", danger: true })) data.clearDemo();
                }}
              >
                <RotateCcw /> Clear all
              </Button>
              <Button variant="secondary" onClick={() => void run(() => data.loadSampleData(), "Sample data added")}>
                <Sparkles /> Add sample data
              </Button>
            </div>
          </Section>
        ) : null}

        {user?.admin && (
          <Section id="access" title="Access" text="Only these Google accounts can sign in and use the app.">
            <AccessManager />
          </Section>
        )}

        <Section title="Account" text={user?.demo ? "Leave the demo and return to the start page." : "Sign out of this device."}>
          <Button variant="secondary" onClick={() => void signOut()}>
            <LogOut /> {user?.demo ? "Exit demo" : "Sign out"}
          </Button>
        </Section>
      </div>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        wide
        title={`Import into ${labels[importCol]}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button onClick={() => void doImport()} disabled={busy || !preview?.docs.length}>
              <Upload /> {busy ? "Importing…" : `Import ${preview?.docs.length ?? 0} records`}
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950/60">
                <div className="text-xs text-zinc-500">Ready to import</div>
                <div className="text-lg font-semibold">{preview.docs.length}</div>
              </div>
              <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950/60">
                <div className="text-xs text-zinc-500">Skipped (missing required)</div>
                <div className="text-lg font-semibold">{preview.skipped}</div>
              </div>
              <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950/60">
                <div className="text-xs text-zinc-500">Columns matched</div>
                <div className="text-lg font-semibold">{preview.matched.length}</div>
              </div>
            </div>
            {preview.unmatched.length > 0 && <p className="font-mono text-[11px] text-signal">Ignored columns: {preview.unmatched.join(", ")}</p>}
            {preview.docs.length > 0 && (
              <div className="overflow-x-auto rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-950/60">
                    <tr>
                      {previewKeys.map((k) => (
                        <th key={k} className="px-3 py-2 text-left font-medium text-zinc-500">
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {preview.docs.slice(0, 5).map((d, i) => (
                      <tr key={i}>
                        {previewKeys.map((k) => (
                          <td key={k} className="max-w-48 truncate px-3 py-2">
                            {Array.isArray(d[k]) ? `${(d[k] as unknown[]).length} parts` : String(d[k] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
