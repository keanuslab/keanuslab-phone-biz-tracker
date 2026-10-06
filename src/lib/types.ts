export const DEVICE_STATUSES = ["Acquired", "In repair", "Ready", "Listed", "Sold"] as const;
export const REPAIR_STATUSES = ["Intake", "Diagnosing", "Waiting parts", "In progress", "Done", "Collected"] as const;
export const CONDITIONS = ["A — Like new", "B — Good", "C — Fair", "Faulty"] as const;
export const EXPENSE_CATEGORIES = ["Parts stock", "Tools", "Shipping supplies", "Fees & subscriptions", "Advertising", "Rent & utilities", "Other"] as const;
export const PART_CATEGORIES = ["Screen", "Battery", "Charging port", "Back glass", "Camera", "Speaker", "Microphone", "Buttons / flex", "Housing", "Other"] as const;
export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "PLN", "SEK", "DKK", "NOK", "CZK", "HUF"] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];
export type RepairStatus = (typeof REPAIR_STATUSES)[number];

export interface PartLine {
  partId?: string;
  name: string;
  unitCost: number;
  qty: number;
}

export interface Device {
  id: string;
  stockId?: string;
  model: string;
  storage?: string;
  color?: string;
  imei?: string;
  condition?: string;
  batteryBought?: number | null;
  batterySold?: number | null;
  source?: string;
  purchasePrice: number;
  purchasedAt: string;
  status: DeviceStatus;
  parts: PartLine[];
  platform?: string;
  salePrice?: number | null;
  soldAt?: string;
  saleFees?: number | null;
  shippingCost?: number | null;
  notes?: string;
}

export interface Repair {
  id: string;
  date: string;
  completedAt?: string;
  customer: string;
  contact?: string;
  device: string;
  issue?: string;
  status: RepairStatus;
  parts: PartLine[];
  charged?: number | null;
  notes?: string;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
}

export interface Part {
  id: string;
  name: string;
  category?: string;
  compatible?: string;
  qtyOnHand: number;
  unitCost: number;
  lowStock: number;
}

export interface Investment {
  id: string;
  investor: string;
  contact: string;
  amount: number;
  receivedAt: string;
  promisedReturn: number;
  dueAt: string;
  repaidAmount: number;
  repaidAt: string;
  notes: string;
}

export type GoalMetric = "net" | "revenue" | "soldCount" | "repairCount";

export interface Goal {
  metric: GoalMetric;
  target: number;
}

export interface Settings {
  businessName: string;
  currency: string;
  goals: Goal[];
}

export interface Collections {
  devices: Device;
  repairs: Repair;
  expenses: Expense;
  parts: Part;
  investments: Investment;
}

export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = ["devices", "repairs", "expenses", "parts", "investments"];

export const DEFAULT_SETTINGS: Settings = { businessName: "", currency: "EUR", goals: [] };
