// Whether Shift or ⌘ is held, for adding to the selection; which button and modifier make a press the menu or a rotate.
export const pointer = { shift: false };

const MAC = /Mac/.test(navigator.platform);
type Keys = { ctrlKey: boolean; metaKey: boolean };
// on a Mac ctrl-click is the right click, so ⌘ alone is the modifier
export const modKey = (e: Keys) => (MAC ? e.metaKey : e.ctrlKey);
export const secondary = (e: Keys & { button: number }) => e.button === 2 || (MAC && e.button === 0 && e.ctrlKey);

for (const type of ["keydown", "keyup"] as const) window.addEventListener(type, (e) => void (pointer.shift = e.shiftKey || modKey(e)));
window.addEventListener("blur", () => void (pointer.shift = false));
