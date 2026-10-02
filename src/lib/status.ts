import type { Tone } from "../components/ui";
import type { DeviceStatus, RepairStatus } from "./types";

export const deviceTone: Record<DeviceStatus, Tone> = {
  Acquired: "zinc",
  "In repair": "amber",
  Ready: "sky",
  Listed: "violet",
  "Awaiting handover": "amber",
  Sold: "emerald",
  "Handed over": "emerald",
};

export const isSoldStatus = (status: DeviceStatus) => status === "Awaiting handover" || status === "Sold" || status === "Handed over";

export const repairTone: Record<RepairStatus, Tone> = {
  Intake: "zinc",
  Diagnosing: "sky",
  "Waiting parts": "amber",
  "In progress": "violet",
  Done: "blue",
  Collected: "emerald",
};
