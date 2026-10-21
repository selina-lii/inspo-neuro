import { useSyncExternalStore } from "react";
import { store, type State } from "../core/store";

export const useStore = (): State => useSyncExternalStore(store.subscribe, store.get);
