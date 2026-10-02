import type { Op } from "./backend";
import { isoDate } from "../lib/format";

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
};

export function buildSeed(newId: () => string): Op[] {
  const ops: Op[] = [];
  const add = (col: string, data: Record<string, unknown>) => {
    const id = newId();
    ops.push({ type: "set", col, id, data });
    return id;
  };

  const screen13 = add("parts", { name: "iPhone 13 OLED screen", category: "Screen", compatible: "iPhone 13", qtyOnHand: 3, unitCost: 62, lowStock: 2 });
  const batt12 = add("parts", { name: "iPhone 12 battery", category: "Battery", compatible: "iPhone 12 / 12 Pro", qtyOnHand: 1, unitCost: 18, lowStock: 2 });
  const s21port = add("parts", { name: "Galaxy S21 USB-C port", category: "Charging port", compatible: "Galaxy S21", qtyOnHand: 5, unitCost: 7.5, lowStock: 2 });
  add("parts", { name: "iPhone 11 back glass", category: "Back glass", compatible: "iPhone 11", qtyOnHand: 4, unitCost: 9, lowStock: 1 });

  const devices: [string, number, number, string, number | null, number | null, { partId: string; name: string; unitCost: number; qty: number }[]][] = [
    ["iPhone 13 128GB", 210, 170, "Handed over", 399, 142, [{ partId: screen13, name: "iPhone 13 OLED screen", unitCost: 62, qty: 1 }]],
    ["iPhone 12 64GB", 150, 150, "Handed over", 289, 128, [{ partId: batt12, name: "iPhone 12 battery", unitCost: 18, qty: 1 }]],
    ["Galaxy S21 128GB", 140, 120, "Handed over", 245, 105, [{ partId: s21port, name: "Galaxy S21 USB-C port", unitCost: 7.5, qty: 1 }]],
    ["iPhone 13 128GB", 230, 95, "Handed over", 419, 71, []],
    ["iPhone 11 64GB", 110, 80, "Handed over", 199, 62, []],
    ["Pixel 7 128GB", 160, 60, "Handed over", 269, 41, []],
    ["iPhone 12 64GB", 145, 45, "Handed over", 279, 20, []],
    ["iPhone 14 128GB", 330, 30, "Awaiting handover", 499, 9, []],
    ["Galaxy S22 256GB", 190, 21, "Listed", null, null, []],
    ["iPhone 13 mini", 175, 14, "Ready", null, null, [{ partId: screen13, name: "iPhone 13 OLED screen", unitCost: 62, qty: 1 }]],
    ["iPhone 12 Pro 128GB", 220, 6, "In repair", null, null, []],
    ["iPhone 11 128GB", 120, 2, "Acquired", null, null, []],
  ];
  for (const [name, price, bought, status, sale, soldAgo, parts] of devices) {
    const [, model, storage] = name.match(/^(.*?)(?:\s+(\d+(?:GB|TB)))?$/)!;
    add("devices", {
      model,
      ...(storage ? { storage } : {}),
      condition: parts.length ? "Faulty" : "B — Good",
      source: bought % 2 ? "Marketplace" : "Trade-in",
      purchasePrice: price,
      purchasedAt: daysAgo(bought),
      status,
      parts,
      ...(sale != null && soldAgo != null
        ? { salePrice: sale, soldAt: daysAgo(soldAgo), platform: "eBay", saleFees: Math.round(sale * 0.11), shippingCost: 6.5 }
        : {}),
    });
  }

  const repairs: [string, string, string, number, string, number, { partId?: string; name: string; unitCost: number; qty: number }[]][] = [
    ["Anna K.", "iPhone 13", "Cracked screen", 150, "Collected", 160, [{ partId: screen13, name: "iPhone 13 OLED screen", unitCost: 62, qty: 1 }]],
    ["Marco R.", "iPhone 12", "Battery health 71%", 69, "Collected", 120, [{ partId: batt12, name: "iPhone 12 battery", unitCost: 18, qty: 1 }]],
    ["Lea S.", "Galaxy S21", "Not charging", 59, "Collected", 88, [{ partId: s21port, name: "Galaxy S21 USB-C port", unitCost: 7.5, qty: 1 }]],
    ["Tom B.", "iPhone 11", "Back glass shattered", 79, "Collected", 50, [{ name: "iPhone 11 back glass", unitCost: 9, qty: 1 }]],
    ["Sara M.", "iPhone 13", "Screen lines", 149, "Done", 12, [{ partId: screen13, name: "iPhone 13 OLED screen", unitCost: 62, qty: 1 }]],
    ["Jonas W.", "Pixel 6", "Water damage", 0, "Diagnosing", 3, []],
    ["Mia L.", "iPhone 12", "Battery replacement", 69, "Waiting parts", 1, []],
  ];
  for (const [customer, device, issue, charged, status, ago, parts] of repairs) {
    const done = status === "Done" || status === "Collected";
    add("repairs", { customer, device, issue, charged: charged || null, status, date: daysAgo(ago + 2), ...(done ? { completedAt: daysAgo(ago) } : {}), parts });
  }

  const expenses: [string, string, number, number][] = [
    ["Tools", "Precision screwdriver kit", 45, 170],
    ["Advertising", "Marketplace boost", 20, 130],
    ["Shipping supplies", "Bubble mailers x50", 28, 100],
    ["Fees & subscriptions", "eBay store subscription", 25, 75],
    ["Parts stock", "Restock: 4× iPhone 13 OLED screen", 248, 65],
    ["Advertising", "Local flyers", 35, 40],
    ["Fees & subscriptions", "eBay store subscription", 25, 15],
    ["Shipping supplies", "Boxes & tape", 18, 5],
  ];
  for (const [category, description, amount, ago] of expenses) {
    add("expenses", { category, description, amount, date: daysAgo(ago) });
  }

  return ops;
}
