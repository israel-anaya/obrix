import { listen } from "@tauri-apps/api/event";

export const EVENTO_CSV_PROGRESO = "csv-progreso";

export interface CsvProgresoBackend {
  actual: number;
  total: number;
}

export async function escucharProgresoCsv(
  onProgreso: (p: CsvProgresoBackend) => void,
): Promise<() => void> {
  return listen<CsvProgresoBackend>(EVENTO_CSV_PROGRESO, (e) => {
    onProgreso(e.payload);
  });
}
