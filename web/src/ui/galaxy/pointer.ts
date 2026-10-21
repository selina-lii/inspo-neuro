// Who owns a drag in the 3D view: a board being moved takes it from the camera controls; whether Shift is held, for adding to the selection.
export const pointer = { busy: false, shift: false };

for (const type of ["keydown", "keyup"] as const) window.addEventListener(type, (e) => void (pointer.shift = e.shiftKey));
window.addEventListener("blur", () => void (pointer.shift = false));

const MAC = /Mac/.test(navigator.platform);
type Keys = { button: number; ctrlKey: boolean; metaKey: boolean };
// on a Mac ctrl-click is the right click, so ⌘ alone is the modifier
export const modKey = (e: Keys) => (MAC ? e.metaKey : e.ctrlKey);
export const secondary = (e: Keys) => e.button === 2 || (MAC && e.button === 0 && e.ctrlKey);
