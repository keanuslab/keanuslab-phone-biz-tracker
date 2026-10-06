import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { DeviceForm, ExpenseForm, InvestmentForm, PartForm, RepairForm, RestockForm } from "./forms";
import { WillhabenImport } from "./WillhabenImport";
import { ListingText } from "./ListingText";
import type { Device, Expense, Investment, Part, Repair } from "../lib/types";

type Editor =
  | { kind: "device"; record?: Device; preset?: Partial<Device> }
  | { kind: "willhaben" }
  | { kind: "listing"; record: Device }
  | { kind: "repair"; record?: Repair; preset?: Partial<Repair> }
  | { kind: "expense"; record?: Expense }
  | { kind: "investment"; record?: Investment }
  | { kind: "part"; record?: Part }
  | { kind: "restock"; record: Part };

type Open = (e: Editor) => void;
const EditorsContext = createContext<Open | null>(null);

export function EditorsProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const close = useCallback(() => setEditor(null), []);

  return (
    <EditorsContext.Provider value={setEditor}>
      {children}
      {editor?.kind === "device" && <DeviceForm key={editor.record?.id} device={editor.record} preset={editor.preset} onClose={close} />}
      {editor?.kind === "willhaben" && <WillhabenImport onClose={close} onContinue={(preset) => setEditor({ kind: "device", preset })} />}
      {editor?.kind === "listing" && <ListingText key={editor.record.id} device={editor.record} onClose={close} />}
      {editor?.kind === "repair" && <RepairForm key={editor.record?.id} repair={editor.record} preset={editor.preset} onClose={close} />}
      {editor?.kind === "expense" && <ExpenseForm expense={editor.record} onClose={close} />}
      {editor?.kind === "investment" && <InvestmentForm key={editor.record?.id} investment={editor.record} onClose={close} />}
      {editor?.kind === "part" && <PartForm part={editor.record} onClose={close} />}
      {editor?.kind === "restock" && <RestockForm part={editor.record} onClose={close} />}
    </EditorsContext.Provider>
  );
}

export function useEditors() {
  const open = useContext(EditorsContext);
  if (!open) throw new Error("useEditors must be used within EditorsProvider");
  return open;
}
