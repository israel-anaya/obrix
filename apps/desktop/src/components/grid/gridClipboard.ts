export interface GridClipboard {
  copy: () => Promise<void>;
  cut: () => Promise<void>;
  paste: () => Promise<void>;
}

/** Last grid to receive focus — `App`'s Edit menu uses it for Cut/Copy/Paste. */
let active: GridClipboard | null = null;

export function activeGridClipboard(): GridClipboard | null {
  return active;
}

export function setActiveGridClipboard(api: GridClipboard | null) {
  active = api;
}
