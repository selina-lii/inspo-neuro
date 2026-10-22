// What the server is still sending: requests open longer than a beat, named for the bottom-of-screen notice.
import { useSyncExternalStore } from "react";

const SLOW_MS = 400;
let open: string[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** "/traces/day1/lowres.bin?…" reads "traces · day1". */
const nameOf = (path: string) => path.split("?")[0]!.split("/").filter(Boolean).slice(0, 2).map((p) => decodeURIComponent(p).replace(/\.bin$/, "")).join(" · ");

/** fetch under /api, listed as loading once it outlasts a beat. */
export async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  const name = nameOf(path);
  let shown = false;
  // only slow requests show: quick ones (polls, saves) would blink the notice
  const timer = window.setTimeout(() => ((shown = true), (open = [...open, name]), emit()), SLOW_MS);
  try {
    return await fetch(`/api${path}`, init);
  } finally {
    window.clearTimeout(timer);
    if (shown) (open = open.filter((n, i) => i !== open.indexOf(name))), emit();
  }
}

export const useLoading = (): string[] => useSyncExternalStore((f) => (listeners.add(f), () => listeners.delete(f)), () => open);
