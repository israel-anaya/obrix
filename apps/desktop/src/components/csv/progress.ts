import { listen } from "@tauri-apps/api/event";

// Must match `EVENTO_CSV_PROGRESO` in `src-tauri/src/commands/mod.rs` — the value is a wire
// constant shared with the Rust backend, not just an identifier.
export const CSV_PROGRESS_EVENT = "csv-progreso";

export interface CsvBackendProgress {
  actual: number;
  total: number;
}

export async function listenCsvProgress(
  onProgress: (p: CsvBackendProgress) => void,
): Promise<() => void> {
  return listen<CsvBackendProgress>(CSV_PROGRESS_EVENT, (e) => {
    onProgress(e.payload);
  });
}
