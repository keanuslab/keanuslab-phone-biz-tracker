import { modelKey } from "./models";
import type { Device, Part } from "./types";
import { isSoldStatus } from "./status";

export type RepairCategory = "Screen" | "Battery" | "Back glass" | "Charging port" | "Camera";

const damage: [RepairCategory, RegExp][] = [
  ["Screen", /(?:display|bildschirm|screen|glas vorne).{0,28}(?:bruch|gebrochen|gerissen|riss|defekt|kaputt|schaden|streifen|schwarz|tausch)|(?:bruch|riss|defekt|kaputt|schaden).{0,28}(?:display|bildschirm|screen|glas vorne)/i],
  ["Back glass", /(?:rückseite|rückglas|backglass|back glass|glas hinten).{0,28}(?:bruch|gebrochen|gerissen|riss|defekt|kaputt|schaden)|(?:bruch|riss|defekt|kaputt|schaden).{0,28}(?:rückseite|rückglas|backglass|back glass|glas hinten)/i],
  ["Charging port", /(?:ladebuchse|ladeanschluss|charging port|lightning port|usb[ -]?c).{0,28}(?:defekt|kaputt|lädt nicht|laedt nicht|wackelkontakt)|(?:lädt nicht|laedt nicht).{0,28}(?:kabel|anschluss|buchse)/i],
  ["Camera", /(?:kamera|camera).{0,28}(?:defekt|kaputt|gebrochen|funktioniert nicht)|(?:defekt|kaputt).{0,28}(?:kamera|camera)/i],
];

/** Only explicit faults are suggested. A low battery percentage is a review hint. */
export function suggestedRepairs(text: string, battery?: number): RepairCategory[] {
  const found = damage.filter(([, pattern]) => pattern.test(text)).map(([category]) => category);
  if (/\b(?:akku|batterie|battery).{0,25}(?:defekt|kaputt|tausch|wechsel|schwach)|(?:defekt|kaputt).{0,25}(?:akku|batterie|battery)/i.test(text) || (battery != null && battery < 80)) found.push("Battery");
  return [...new Set(found)];
}

export function matchingParts(parts: Part[], model: string, category: string): Part[] {
  const key = modelKey(model);
  if (!key) return [];
  return parts.filter((part) => {
    if (part.category !== category) return false;
    const compatibility = part.compatible?.trim();
    if (!compatibility) return false;
    const names = compatibility.split(/\s*[,;/|]\s*/);
    const prefix = names[0]?.match(/^(iPhone|Galaxy|Pixel|Xiaomi|Redmi Note|OnePlus)\s+/i)?.[1];
    return names.some((name) => modelKey(name) === key || (prefix && modelKey(`${prefix} ${name}`) === key));
  }).sort((a, b) => Number(b.qtyOnHand > 0) - Number(a.qtyOnHand > 0) || a.unitCost - b.unitCost);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function comparableSales(devices: Device[], model: string, storage?: string) {
  const key = modelKey(model);
  if (!key) return [];
  return devices.filter((device) => isSoldStatus(device.status) && device.salePrice != null && device.salePrice > 0 && device.condition !== "Faulty" && modelKey(device.model) === key && (!storage || modelKey(device.storage ?? "") === modelKey(storage)));
}
