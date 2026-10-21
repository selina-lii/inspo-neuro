// Which CCG panel a plot or options bar sits in, so each panel reads and sets its own options.
import { createContext, useContext } from "react";
import { setPanelCcg } from "../../actions";
import { panelCcg, type CcgOptions } from "../../core/store";
import { useStore } from "../useStore";

export const PanelId = createContext("ccg");

export function usePanelCcg(): [CcgOptions, (patch: Partial<CcgOptions>) => void] {
  const id = useContext(PanelId);
  const s = useStore();
  return [panelCcg(s, id), (patch) => setPanelCcg(id, patch)];
}
