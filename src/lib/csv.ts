import Papa from "papaparse";
import type { CollectionName } from "./types";
import { DEVICE_STATUSES, REPAIR_STATUSES } from "./types";
import { num, today } from "./format";

type FieldType = "string" | "number" | "optNumber" | "date" | "parts";
interface FieldDef {
  key: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
}

export const csvFields: Record<CollectionName, FieldDef[]> = {
  devices: [
    { key: "stockId", type: "string" },
    { key: "model", type: "string", required: true },
    { key: "storage", type: "string" },
    { key: "color", type: "string" },
    { key: "imageUrl", type: "string" },
    { key: "imei", type: "string" },
    { key: "condition", type: "string" },
    { key: "batteryBought", type: "optNumber" },
    { key: "batterySold", type: "optNumber" },
    { key: "source", type: "string" },
    { key: "purchasePrice", type: "number", required: true },
    { key: "purchasedAt", type: "date", required: true },
    { key: "status", type: "string", options: DEVICE_STATUSES },
    { key: "platform", type: "string" },
    { key: "salePrice", type: "optNumber" },
    { key: "soldAt", type: "date" },
    { key: "saleFees", type: "optNumber" },
    { key: "shippingCost", type: "optNumber" },
    { key: "parts", type: "parts" },
    { key: "notes", type: "string" },
  ],
  repairs: [
    { key: "date", type: "date", required: true },
    { key: "completedAt", type: "date" },
    { key: "customer", type: "string", required: true },
    { key: "contact", type: "string" },
    { key: "device", type: "string", required: true },
    { key: "issue", type: "string" },
    { key: "status", type: "string", options: REPAIR_STATUSES },
    { key: "charged", type: "optNumber" },
    { key: "parts", type: "parts" },
    { key: "notes", type: "string" },
  ],
  expenses: [
    { key: "date", type: "date", required: true },
    { key: "category", type: "string" },
    { key: "description", type: "string", required: true },
    { key: "amount", type: "number", required: true },
  ],
  parts: [
    { key: "name", type: "string", required: true },
    { key: "category", type: "string" },
    { key: "compatible", type: "string" },
    { key: "qtyOnHand", type: "number" },
    { key: "unitCost", type: "number" },
    { key: "lowStock", type: "number" },
  ],
};

export function exportCsv(col: CollectionName, rows: object[]) {
  const fields = csvFields[col];
  const data = rows.map((r) => {
    const rec = r as Record<string, unknown>;
    return fields.map((f) => {
      const v = rec[f.key];
      if (f.type === "parts") {
        const lines = (v as { name: string; unitCost: number; qty: number }[] | undefined) ?? [];
        return lines.length ? JSON.stringify(lines.map(({ name, unitCost, qty }) => ({ name, unitCost, qty }))) : "";
      }
      return v ?? "";
    });
  });
  const csv = Papa.unparse({ fields: fields.map((f) => f.key), data }, { escapeFormulae: true });
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `phonebiz-${col}-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const unescapeFormula = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

function parseDate(s: string) {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

function parseParts(s: string) {
  if (!s.trim()) return [];
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 50).map((p) => ({ name: String(p.name ?? "").slice(0, 200), unitCost: num(p.unitCost ?? p.cost), qty: num(p.qty ?? p.quantity) || 1 })).filter((p) => p.name);
  } catch {
    return [];
  }
}

export interface ParsedImport {
  matched: string[];
  unmatched: string[];
  docs: Record<string, unknown>[];
  skipped: number;
}

export function parseCsv(col: CollectionName, file: File): Promise<ParsedImport> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        const fields = csvFields[col];
        const headers = meta.fields ?? [];
        const map = new Map<string, FieldDef>();
        for (const h of headers) {
          const f = fields.find((f) => norm(f.key) === norm(h));
          if (f) map.set(h, f);
        }
        let skipped = 0;
        const docs: Record<string, unknown>[] = [];
        for (const row of data) {
          const doc: Record<string, unknown> = {};
          for (const [h, f] of map) {
            const raw = unescapeFormula(String(row[h] ?? "").trim()).slice(0, 2000);
            if (f.type === "number") doc[f.key] = num(raw);
            else if (f.type === "optNumber") doc[f.key] = raw === "" ? null : num(raw);
            else if (f.type === "date") doc[f.key] = parseDate(raw);
            else if (f.type === "parts") doc[f.key] = parseParts(raw);
            else if (f.options) doc[f.key] = f.options.find((o) => norm(o) === norm(raw)) ?? f.options[0];
            else doc[f.key] = raw;
          }
          for (const f of fields) {
            if (f.type === "parts" && !doc[f.key]) doc[f.key] = [];
            if (f.options && !doc[f.key]) doc[f.key] = f.options[0];
          }
          if (fields.some((f) => f.required && (doc[f.key] === "" || doc[f.key] == null))) {
            skipped++;
            continue;
          }
          docs.push(doc);
        }
        resolve({
          matched: [...map.values()].map((f) => f.key),
          unmatched: headers.filter((h) => !map.has(h)),
          docs,
          skipped,
        });
      },
      error: reject,
    });
  });
}
