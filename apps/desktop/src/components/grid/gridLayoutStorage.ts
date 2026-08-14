/**
 * Reads and writes the per-user layout of a grid: column widths, column order,
 * hidden columns and sort. One `localStorage` entry per grid, in the same place
 * and with the same naming as the theme (`obrix-theme`).
 *
 * Everything is stored *by field*, never by position: adding, removing or
 * reordering a column in code does not invalidate what the user had arranged.
 * Fields that no longer exist are dropped on load, and new ones simply take
 * their default. That is why there is no schema hash in the key.
 */

const PREFIX = "obrix-grid-";

/** Bumped only if the stored shape ever changes in a way this file cannot read. */
const VERSION = 1;

export interface GridSort {
  /** The column's `field`. */
  id: string;
  desc: boolean;
}

export interface GridLayout {
  /** Width in px, only for the fields the user actually resized. */
  widths: Record<string, number>;
  /** Fields in the user's order. Fields missing here keep their definition order. */
  order: string[];
  /** Fields the user hid. */
  hidden: string[];
  sort: GridSort[];
}

export const EMPTY_LAYOUT: GridLayout = { widths: {}, order: [], hidden: [], sort: [] };

function storageKey(key: string): string {
  return `${PREFIX}${key}`;
}

/** Anything can be in `localStorage` — another version, a hand edit, a half
 * written entry. Every piece is validated on its own so one bad field does not
 * throw the whole layout away. */
function sanitize(raw: unknown): GridLayout {
  if (typeof raw !== "object" || raw === null) return EMPTY_LAYOUT;
  const data = raw as Record<string, unknown>;
  if (data.v !== VERSION) return EMPTY_LAYOUT;

  const widths: Record<string, number> = {};
  if (typeof data.widths === "object" && data.widths !== null) {
    for (const [field, value] of Object.entries(data.widths as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) widths[field] = value;
    }
  }

  const stringList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

  const sort: GridSort[] = Array.isArray(data.sort)
    ? data.sort.flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        const { id, desc } = entry as Record<string, unknown>;
        return typeof id === "string" ? [{ id, desc: desc === true }] : [];
      })
    : [];

  return { widths, order: stringList(data.order), hidden: stringList(data.hidden), sort };
}

export function loadLayout(key: string): GridLayout {
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw ? sanitize(JSON.parse(raw)) : EMPTY_LAYOUT;
  } catch {
    // Unavailable storage (private mode, a locked-down webview) or invalid
    // JSON: the grid works fine without a saved layout, it just does not
    // remember one.
    return EMPTY_LAYOUT;
  }
}

function isDefault(layout: GridLayout): boolean {
  return (
    Object.keys(layout.widths).length === 0 &&
    layout.order.length === 0 &&
    layout.hidden.length === 0 &&
    layout.sort.length === 0
  );
}

export function saveLayout(key: string, layout: GridLayout): void {
  try {
    // A layout back to its defaults removes the entry instead of storing an
    // empty object — that way "reset" really leaves no trace.
    if (isDefault(layout)) localStorage.removeItem(storageKey(key));
    else localStorage.setItem(storageKey(key), JSON.stringify({ v: VERSION, ...layout }));
  } catch {
    // Nothing to do: not being able to remember the layout must never break
    // the interaction that changed it.
  }
}
