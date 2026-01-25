// src/Pond.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export type PondPhase = "off" | "filling" | "on" | "draining";

type PondProps = {
  phase: PondPhase;
  backgroundImage: string | null;
  isCapturing?: boolean;
  onDrained?: () => void;
};

export default function Pond({
  phase,
  backgroundImage,
  isCapturing,
  onDrained,
}: PondProps) {
  // Unmount only when fully off
  if (phase === "off") return null;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none">
      <Canvas
        orthographic
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 0, 10], zoom: 100 }}
      >
        <PondScene
          phase={phase}
          backgroundImage={backgroundImage}
          isCapturing={isCapturing}
          onDrained={onDrained}
        />
      </Canvas>
    </div>
  );
}

type PondSceneProps = {
  phase: PondPhase;
  backgroundImage: string | null;
  isCapturing?: boolean;
  onDrained?: () => void;
};

function PondScene({ phase, backgroundImage, onDrained }: PondSceneProps) {
  const { viewport } = useThree();

  // Level represents “how close the water feels to the viewer”
  const [level, setLevel] = useState(phase === "on" ? 1 : 0);
  const levelRef = useRef(level);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
  let raf = 0;

  const from = levelRef.current;
  const to = phase === "draining" ? 0 : 1;
  const dur = phase === "draining" ? 500 : 650;
  const start = performance.now();

  const easeInOutCubic = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / dur);
    const e = easeInOutCubic(p);
    const v = from + (to - from) * e;

    setLevel(v);

    if (p < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      setLevel(to);
      if (phase === "draining" && to === 0) {
        onDrained?.();
      }
    }
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}, [phase, onDrained]);

  return (
    <>
      {/* Subtle dim behind water (helps “depth” feel) */}
      <mesh position={[0, 0, -1]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshBasicMaterial transparent opacity={0.08 + 0.12 * level} color="#000" />
      </mesh>

      <WaterPlane level={level} backgroundImage={backgroundImage}/>
    </>
  );
}

function useDataUrlTexture(dataUrl: string | null) {
  return useMemo(() => {
    if (!dataUrl) return null;
    const tex = new THREE.TextureLoader().load(dataUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }, [dataUrl]);
}

type WaterPlaneProps = {
  level: number;
  backgroundImage: string | null;
};

function WaterPlane({ level, backgroundImage }: WaterPlaneProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();

  // Subtle “approach” motion: tiny zoom + slight forward Z shift
  const z = THREE.MathUtils.lerp(-0.35, 0.0, level);
  const s = THREE.MathUtils.lerp(0.98, 1.02, level);

  // Mouse-driven ripple inputs (UV space)
  const mouseUV = useRef(new THREE.Vector2(0.5, 0.5));
  const mouseStrength = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseUV.current.set(
        e.clientX / window.innerWidth,
        1 - e.clientY / window.innerHeight
      );
      mouseStrength.current = 1; // "kick" ripples on movement
    };

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const sceneTex = useDataUrlTexture(backgroundImage);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLevel: { value: level },
      uTint: { value: new THREE.Color("#2b74ff") },
      uSceneTex: { value: null as THREE.Texture | null },
      uHasSceneTex: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uMouseStrength: { value: 0 },
    }),
    []
  );

  useFrame((_state, dt: number) => {
    if (!materialRef.current) return;
    const u = materialRef.current.uniforms;
    u.uTime.value += dt;
    u.uLevel.value = level;
    u.uSceneTex.value = sceneTex;
    u.uHasSceneTex.value = sceneTex ? 1 : 0;

    // NEW: drive shader with mouse
    u.uMouse.value.copy(mouseUV.current);
    u.uMouseStrength.value = mouseStrength.current;

    // smooth decay
    mouseStrength.current *= 0.92;
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
          uniform sampler2D uSceneTex;
          uniform float uHasSceneTex;
          uniform vec2 uMouse;
          uniform float uMouseStrength;

          float waves(vec2 p) {
            float t = uTime;
            float w = 0.0;
            w += sin((p.x * 10.0) + t * 1.2) * 0.08;
            w += sin((p.y * 12.0) - t * 1.0) * 0.06;
            w += sin((p.x * 18.0 + p.y * 6.0) + t * 0.8) * 0.04;
            return w;
          }

          float cursorRipple(vec2 uv, vec2 mouse) {
            float d = distance(uv, mouse);
            float wave = sin(d * 40.0 - uTime * 6.0) * exp(-d * 10.0);
            return wave;
          }

          void main() {
            // “Toward viewer” effect:
            // - no vertical reveal
            // - water presence increases with uLevel
            // - wave intensity & highlights increase with uLevel

            float strength = mix(0.18, 1.0, uLevel);

            // Slight “zoom” in UV space as it approaches
            vec2 p = (vUv - 0.5) * (1.0 + uLevel * 0.10) + 0.5;

            // base waves
            float h = waves(p) * strength;

            // NEW: cursor ripple (scaled by uLevel so it’s subtle when pond is low)
            float r = cursorRipple(p, uMouse) * uMouseStrength * (0.06 + 0.10 * uLevel);
            h += r;

            float highlight = smoothstep(0.05, 0.12, abs(h));

            // Background: screenshot (if available) with refraction-like distortion.
            vec2 uv = vUv;
            vec2 distort = vec2(
              sin((uv.y * 14.0) + uTime * 0.9),
              sin((uv.x * 16.0) - uTime * 0.8)
            ) * (0.006 * uLevel);

            // Add some distortion from the wave height as well.
            distort += vec2(h) * (0.02 * uLevel);

            vec3 bg = uTint;
            if (uHasSceneTex > 0.5) {
              bg = texture2D(uSceneTex, uv + distort).rgb;
            }

            // Water tinting over background + highlights
            vec3 col = mix(bg, uTint, 0.25 + 0.35 * uLevel);
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