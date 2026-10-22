// A node in 3D: a title bar that drags it, a body, and its cable ports' places; a new one comes to the middle of the view.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ReactNode } from "react";
import { Vector3, type Group, Quaternion } from "three";
import type { Quat, Vec3 } from "../../../core/stats";
import { useStore } from "../../useStore";
import { PICK_COLOR } from "../../../core/colors";
import { selected3 } from "../../../core/select";
import { useBody } from "../select3";
import { claimMenu, type Target } from "../SpaceMenu";
import { rename, titleTip } from "../titleTip";
import { Label3D } from "../stats/Label3D";
import { anchors, centers, ports } from "../tie/portAt";
import { barPress } from "../gesture";

export const NODE_W = 3.2;
export const NODE_BAR = 0.44;

type Props = { target: Target; title: string; height: number; pose: { p: Vec3; q: Quat; summon?: boolean }; place(patch: { p: Vec3; q: Quat; summon?: false }): void; output: string; dark: boolean; children?: ReactNode };

export function NodeShell({ target, title, height, pose, place, output, dark, children }: Props) {
  const { objectScale } = useStore();
  const group = useRef<Group>(null);
  const camera = useThree((t) => t.camera);
  const kind = target.kind as "node" | "style";
  const body = useBody(kind, target.id, group);
  const s = useStore();
  const picked = selected3(s, kind, target.id);
  const key = `${target.kind}:${target.id}`;

  useEffect(() => {
    if (!pose.summon) return;
    const at = camera.position.clone().addScaledVector(camera.getWorldDirection(new Vector3()), 14).addScaledVector(new Vector3(1, 0, 0).applyQuaternion(camera.quaternion), (-NODE_W / 2) * objectScale);
    place({ summon: false, p: at.toArray() as Vec3, q: camera.quaternion.toArray() as Quat });
  }, [pose.summon]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    ports.set(output, g.localToWorld(new Vector3(NODE_W + 0.25, -height / 2, 0)));
    centers.set(key, { at: g.localToWorld(new Vector3(NODE_W / 2, -height / 2, 0)), size: NODE_W * g.scale.x });
    anchors.set(key, { at: g.localToWorld(new Vector3(0, NODE_BAR, 0)), q: g.getWorldQuaternion(new Quaternion()), scale: g.getWorldScale(new Vector3()).x, size: NODE_W, width: NODE_W });
  });

  return (
    <group ref={group} position={pose.p} quaternion={pose.q} scale={objectScale} {...body} onContextMenu={() => claimMenu(target)}>
      <mesh position={[NODE_W / 2, NODE_BAR / 2, -0.01]} onPointerDown={barPress({ kind, id: target.id })} {...titleTip(title)} onDoubleClick={(e) => (e.stopPropagation(), rename({ kind, id: target.id }))}>
        <planeGeometry args={[NODE_W, NODE_BAR]} />
        <meshBasicMaterial color={picked ? PICK_COLOR : "#3a6df0"} side={2} />
      </mesh>
      <Label3D text={title} position={[0.12, NODE_BAR / 2, 0]} height={0.24} color="#ffffff" anchor="left" bold />
      <mesh position={[NODE_W / 2, -height / 2 + NODE_BAR / 2, -0.02]}>
        <planeGeometry args={[NODE_W, height - NODE_BAR]} />
        <meshBasicMaterial color={dark ? "#20242b" : "#ffffff"} side={2} />
      </mesh>
      {children}
    </group>
  );
}
