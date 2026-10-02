import type { Part } from "./types";

export interface OrderLine {
  key: string;
  partId: string;
  name: string;
  category: string;
  compatible: string;
  qty: string;
  unitCost: string;
}

const categories: [RegExp, string][] = [
  [/screen|display|oled|lcd/i, "Screen"],
  [/battery|batterie|akku/i, "Battery"],
  [/charging|ladebuchse|usb.?c|lightning/i, "Charging port"],
  [/back.?glass|backcover|rückglas/i, "Back glass"],
  [/camera|kamera/i, "Camera"],
  [/speaker|lautsprecher/i, "Speaker"],
];

const decimal = (text: string) => Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
const keyOf = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

export function parsePartsOrder(text: string, stock: Part[]): OrderLine[] {
  const result: OrderLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(subtotal|total|summe|gesamt|shipping|versand|tax|vat|mwst|discount|rabatt)\b/i.test(line)) continue;
    const prices = [...line.matchAll(/(?:[€$£]\s*)?(\d+(?:[.,]\d{3})*[.,]\d{2})(?:\s*(?:€|EUR|USD|GBP))?/g)];
    if (!prices.length) continue;
    const before = line.slice(0, prices[0].index).trim();
    const quantity = before.match(/(?:\b(?:qty|quantity|menge|anzahl)\s*:?\s*|\s)(\d+)\s*(?:x|pcs|stk|stück)?\s*$/i);
    const leading = before.match(/^(\d+)\s*[x×]\s*/i);
    const name = (quantity ? before.slice(0, quantity.index) : leading ? before.slice(leading[0].length) : before).replace(/[|\t]+/g, " ").trim();
    if (!name || !/[a-z]/i.test(name) || /^(price|unit price|preis|artikel|description|beschreibung)\b/i.test(name)) continue;
    const match = stock.find((part) => keyOf(part.name) === keyOf(name));
    result.push({
      key: crypto.randomUUID(), partId: match?.id ?? "", name,
      category: match?.category ?? categories.find(([pattern]) => pattern.test(name))?.[1] ?? "Other",
      compatible: match?.compatible ?? "",
      qty: quantity?.[1] ?? leading?.[1] ?? "",
      unitCost: prices.length > 1 ? String(decimal(prices[0][1])) : "",
    });
  }
  return result;
}

export function applyOrderLine(part: Part, qty: number, unitCost: number): Part {
  const held = Math.max(0, part.qtyOnHand);
  return { ...part, qtyOnHand: part.qtyOnHand + qty, unitCost: Math.round(((held * part.unitCost + qty * unitCost) / (held + qty)) * 100) / 100 };
}