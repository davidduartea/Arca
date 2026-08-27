import type { EntryView } from "@/models/transfers/EntryView";

/** Un movimiento completo: los asientos que se guardan juntos o no se guardan. */
export interface TransactionView {
  id: string;
  description: string;
  reversesId: string | null;
  createdAt: string;
  entries: EntryView[];
}
