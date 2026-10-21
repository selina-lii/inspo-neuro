// A see-through body: nearly clear where it faces the viewer, its colour gathering toward the silhouette, so the dots
// inside a violin or bar stay visible from any angle while its shape still reads.
import { Color, DoubleSide, ShaderMaterial } from "three";
import { vivid } from "../vivid";

export function rimMaterial(color: string, fade = 1): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { color: { value: new Color(vivid(color, 0.58)) }, fade: { value: fade } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float fade;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
        gl_FragColor = vec4(color, mix(0.06, 0.75, pow(rim, 1.6)) * fade);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}
