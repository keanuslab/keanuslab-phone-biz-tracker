import { today } from "./format";
import type { Investment } from "./types";

export const INVESTMENT_STATUSES = ["Open", "Overdue", "Repaid"] as const;
export type InvestmentStatus = (typeof INVESTMENT_STATUSES)[number];

export function investmentOutstanding(investment: Investment) {
  return Math.max(0, Math.round((investment.promisedReturn - investment.repaidAmount) * 100) / 100);
}

export function investmentStatus(investment: Investment, date = today()): InvestmentStatus {
  if (investmentOutstanding(investment) === 0) return "Repaid";
  return investment.dueAt < date ? "Overdue" : "Open";
}

export function validateInvestment(data: Omit<Investment, "id">) {
  if (!data.investor.trim() || data.investor.length > 200 || data.contact.length > 200 || data.notes.length > 5000) throw new Error("Enter an investor name and keep contact and notes within their limits.");
  if (![data.amount, data.promisedReturn, data.repaidAmount].every((value) => Number.isFinite(value) && value >= 0) || data.amount <= 0 || data.promisedReturn < data.amount || data.repaidAmount > data.promisedReturn) throw new Error("Amounts must be valid: total repayment must cover the investment and repayments cannot exceed it.");
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!isDate(data.receivedAt) || !isDate(data.dueAt) || data.dueAt < data.receivedAt) throw new Error("The deadline must be on or after the received date.");
  if (data.repaidAmount > 0 && (!isDate(data.repaidAt) || data.repaidAt < data.receivedAt)) throw new Error("Enter a repayment date on or after the received date.");
}