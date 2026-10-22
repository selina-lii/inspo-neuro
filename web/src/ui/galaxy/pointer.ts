// Who owns a drag in the 3D view: a board being moved takes it from the camera controls; whether Shift or ⌘ is held, for adding to the selection.
export const pointer = { busy: false, shift: false };

// every move in progress, each able to end itself where it stands
const moves = new Set<() => void>();
export const onStopMoves = (end: () => void) => (moves.add(end), () => void moves.delete(end));

/** Esc: whatever is moving stops where it is, and the camera has the pointer back. */
export function stopMoves(): void {
  for (const end of [...moves]) end();
  pointer.busy = false;
}

const MAC = /Mac/.test(navigator.platform);
type Keys = { ctrlKey: boolean; metaKey: boolean };
// on a Mac ctrl-click is the right click, so ⌘ alone is the modifier
export const modKey = (e: Keys) => (MAC ? e.metaKey : e.ctrlKey);
export const secondary = (e: Keys & { button: number }) => e.button === 2 || (MAC && e.button === 0 && e.ctrlKey);

for (const type of ["keydown", "keyup"] as const) window.addEventListener(type, (e) => void (pointer.shift = e.shiftKey || modKey(e)));
window.addEventListener("blur", () => void (pointer.shift = false));
