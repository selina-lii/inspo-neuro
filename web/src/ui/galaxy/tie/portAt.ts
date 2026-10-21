// Where each cable port sits in the world, written each frame by its object: "board:<id>", "net:main", "net:<copy id>".
import type { Quaternion, Vector3 } from "three";

export const ports = new Map<string, Vector3>();

/** Each board's and grid's middle in the world and its size there, for "center on this item". */
export const centers = new Map<string, { at: Vector3; size: number }>();

/** Per object, the world point at its top-left where its toolbar stands, its turn, its scale, and its size. */
export const anchors = new Map<string, { at: Vector3; q: Quaternion; scale: number; size: number; width: number }>();
