// Copies of the session's network placed elsewhere in the 3D space, each coloured and screened for its own segment, so
// segments can be compared side by side. Its frame's bar selects it (corner ticks resize it) and drags it; Delete removes it.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Vector3, type Group } from "three";
import { moveNetwork, resizeNetwork } from "../../actions";
import { tiedPairs } from "../../stackActions";
import { useBody } from "./select3";
import { NetworkFrame } from "./NetworkFrame";
import { useBoardDrag } from "./stats/boardDrag";
import { linkStyle } from "../../core/colors";
import type { NetworkCopy } from "../../core/store";
import { linkKey, type Link, type Point3 } from "../../core/types";
import { useStore } from "../useStore";
import { buildBatches, Heads, LinkBatch, Neurons } from "./networkParts";
import { claimMenu } from "./SpaceMenu";
import { Corners } from "./stats/BoardCorners";
import { ports } from "./tie/portAt";
import { selected3 } from "../../core/select";

const NONE = new Set<string>();
const shownAll = () => false;

type CopyProps = { links: Link[]; pts: Point3[]; center: [number, number, number]; extent: number; dark: boolean };

function Copy({ net, links: all, pts, center, extent, dark }: CopyProps & { net: NetworkCopy }) {
  const s = useStore();
  const group = useRef<Group>(null);
  const body = useBody("network", net.id, group);
  const box = useMemo<[number, number, number, number]>(() => {
    const [xs, ys] = [pts.map((p) => p.x), pts.map((p) => p.y)];
    return [Math.min(...xs) - 0.5, Math.min(...ys) - 0.5, Math.max(...xs) + 0.5, Math.max(...ys) + 0.5];
  }, [pts]);
  const inTest = s.session ? tiedPairs(net.id, s.session) : null;
  const inTestKey = inTest ? [...inTest].join() : null;
  const shown = useMemo(() => (inTest ? all.filter((l) => inTest.has(linkKey(l.ref, l.tgt))) : all), [all, inTestKey]);
  const faded = useMemo(() => {
    if (!inTest) return undefined;
    const ends = new Set(shown.flatMap((l) => [l.ref, l.tgt]));
    return (idx: number) => !ends.has(idx);
  }, [shown, inTestKey]);
  const map = useMemo(() => ({ id: net.id, segment: net.segment, dx: 0, dy: 0 }), [net.id, net.segment]);
  const styles = useMemo(() => new Map(shown.map((l) => [l.i, linkStyle(s, map, l)])), [shown, s.linkColor, s.encoding, s.segLinks, map, s.linkAlpha]);
  const batches = useMemo(() => buildBatches(shown, styles, {
    solo: null, touch: null, picked: NONE, alpha: s.linkAlpha, off: (l) => s.filters.onOnly && s.segLinks[net.segment]?.on[l.i] === false,
  }), [shown, styles, s.linkAlpha, s.filters.onOnly, s.segLinks, net.segment]);
  const scale = net.s ?? 1;
  const picked = selected3(s, "network", net.id);
  // the bar drags the group; its centre is where the copy's network centre now sits
  const drag = useBoardDrag(net.id, group, (p) => moveNetwork(net.id, [p[0] + center[0] * scale, p[1] + center[1] * scale, p[2] + center[2] * scale]), "network");
  // its cable port sits right of its label
  useFrame(() => group.current && ports.set(`net:${net.id}`, group.current.localToWorld(new Vector3(box[2] + 0.6, box[3] + 0.3, center[2]))));
  return (
    <group ref={group} position={[net.p[0] - center[0] * scale, net.p[1] - center[1] * scale, net.p[2] - center[2] * scale]} scale={scale}
      {...body} onContextMenu={() => claimMenu({ kind: "network", id: net.id })}>
      <NetworkFrame box={box} z={center[2]} label={`network · ${net.segment}`} picked={picked} drag={drag}
        onMenu={() => claimMenu({ kind: "network", id: net.id })} />
      {batches.map((b) => <LinkBatch key={b.key} batch={b} pts={pts} dark={dark} onHover={() => undefined} />)}
      <Heads links={shown} styles={styles} pts={pts} touch={null} />
      <Neurons pts={pts} touch={null} hidden={shownAll} faded={faded} onHover={() => undefined} />
      {picked && <Corners group={group} box={box} size={scale} onResize={(k) => resizeNetwork(net.id, k)} />}
    </group>
  );
}

export function NetworkCopies(props: CopyProps) {
  const { networks } = useStore();
  return <>{networks.map((n) => <Copy key={n.id} net={n} {...props} />)}</>;
}

