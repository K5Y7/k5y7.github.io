// src/Pond.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export type PondPhase = "off" | "filling" | "on" | "draining";

export default function Pond({ phase }: { phase: PondPhase }) {
  // Unmount only when fully off
  if (phase === "off") return null;

  return (
    <div className="fixed inset-0 z-20 pointer-events-auto">
      <Canvas
        orthographic
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 0, 10], zoom: 100 }}
      >
        <PondScene phase={phase} />
      </Canvas>
    </div>
  );
}

function PondScene({ phase }: { phase: PondPhase }) {
  const { viewport } = useThree();

  // Level represents “how close the water feels to the viewer”
  const [level, setLevel] = useState(phase === "on" ? 1 : 0);

  useEffect(() => {
    let raf = 0;

    const from = level;
    const to = phase === "draining" ? 0 : 1;
    const dur = phase === "draining" ? 500 : 650;
    const start = performance.now();

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const e = easeInOutCubic(p);
      setLevel(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <>
      {/* Subtle dim behind water (helps “depth” feel) */}
      <mesh position={[0, 0, -1]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshBasicMaterial transparent opacity={0.08 + 0.12 * level} color="#000" />
      </mesh>

      <WaterPlane level={level} />
    </>
  );
}

function WaterPlane({ level }: { level: number }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();

  // Subtle “approach” motion: tiny zoom + slight forward Z shift
  const z = THREE.MathUtils.lerp(-0.35, 0.0, level);
  const s = THREE.MathUtils.lerp(0.98, 1.02, level);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLevel: { value: level },
      uTint: { value: new THREE.Color("#2b74ff") },
    }),
    []
  );

  useFrame((_state, dt: number) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value += dt;
    materialRef.current.uniforms.uLevel.value = level;
  });

  return (
    <mesh position={[0, 0, z]} scale={[s, s, 1]}>
      {/* Fullscreen plane in viewport units */}
      <planeGeometry args={[viewport.width, viewport.height, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          precision highp float;
          varying vec2 vUv;
          uniform float uTime;
          uniform float uLevel;
          uniform vec3 uTint;

          float waves(vec2 p) {
            float t = uTime;
            float w = 0.0;
            w += sin((p.x * 10.0) + t * 1.2) * 0.08;
            w += sin((p.y * 12.0) - t * 1.0) * 0.06;
            w += sin((p.x * 18.0 + p.y * 6.0) + t * 0.8) * 0.04;
            return w;
          }

          void main() {
            // “Toward viewer” effect:
            // - no vertical reveal
            // - water presence increases with uLevel
            // - wave intensity & highlights increase with uLevel

            float strength = mix(0.18, 1.0, uLevel);

            // Slight “zoom” in UV space as it approaches
            vec2 p = (vUv - 0.5) * (1.0 + uLevel * 0.10) + 0.5;

            float h = waves(p) * strength;
            float highlight = smoothstep(0.05, 0.12, abs(h));

            // Base color + highlights
            vec3 col = uTint;
            col += vec3(0.12, 0.18, 0.22) * highlight;

            // A little fresnel-like brightening near edges (adds realism)
            float distToCenter = distance(vUv, vec2(0.5));
            float edge = smoothstep(0.20, 0.75, distToCenter);
            col += vec3(0.06, 0.10, 0.14) * edge * (0.3 + 0.7 * uLevel);

            // Opacity grows as water “comes toward you”
            float alpha = 0.06 + 0.48 * uLevel;

            // Gentle vignette so it feels like a volume, not a flat overlay
            float vignette = smoothstep(0.98, 0.45, distToCenter);
            alpha *= vignette;

            gl_FragColor = vec4(col, alpha);
          }
        `}
      />
    </mesh>
  );
}