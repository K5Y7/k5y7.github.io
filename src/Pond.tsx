// src/Pond.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useFBO } from "@react-three/drei";

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

  const [rippleTex, setRippleTex] = useState<THREE.Texture | null>(null);

  return (
    <>
      {/* Subtle dim behind water (helps “depth” feel) */}
      <mesh position={[0, 0, -1]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshBasicMaterial transparent opacity={0.08 + 0.12 * level} color="#000" />
      </mesh>

      <RippleSim
        enabled={phase === "on" || phase === "filling"}
        strength={0.9}
        simSize={512}
        onTexture={setRippleTex}
      />

      <WaterPlane level={level} backgroundImage={backgroundImage} rippleTex={rippleTex}/>
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
  rippleTex: THREE.Texture | null;
};

function WaterPlane({ level, backgroundImage, rippleTex }: WaterPlaneProps) {
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
      uRippleTex: { value: null as THREE.Texture | null },
      uHasRipple: { value: 0 },
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

    materialRef.current.uniforms.uRippleTex.value = rippleTex;
    materialRef.current.uniforms.uHasRipple.value = rippleTex ? 1 : 0;
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
          uniform sampler2D uRippleTex;
          uniform float uHasRipple;

                    
          float drift(vec2 p){
            // very subtle slow drift (keep pond mostly still)
            float t = uTime * 0.08;
            float a = 0.015; // small
            return sin((p.x*2.5) + t) * a + sin((p.y*2.2) - t*1.2) * a;
          }

          float rippleH(vec2 uv){
            if (uHasRipple < 0.5) return 0.0;
            // height in [-1..1] approx
            return texture2D(uRippleTex, uv).r;
          }

          vec2 rippleGrad(vec2 uv){
            if (uHasRipple < 0.5) return vec2(0.0);
            vec2 e = vec2(1.0/512.0, 1.0/512.0); // match simSize
            float hL = texture2D(uRippleTex, uv - vec2(e.x,0.0)).r;
            float hR = texture2D(uRippleTex, uv + vec2(e.x,0.0)).r;
            float hD = texture2D(uRippleTex, uv - vec2(0.0,e.y)).r;
            float hU = texture2D(uRippleTex, uv + vec2(0.0,e.y)).r;
            return vec2(hR - hL, hU - hD);
          }

          void main() {
            // “Toward viewer” effect:
            // - no vertical reveal
            // - water presence increases with uLevel
            // - wave intensity & highlights increase with uLevel

            // Slight “zoom” in UV space as it approaches
            vec2 p = (vUv - 0.5) * (1.0 + uLevel * 0.10) + 0.5;

            // Global ripple height + gradient from simulation
            float h = drift(p) + rippleH(p) * 0.20;
            vec2 g = rippleGrad(p) * 0.35;

            // highlights based on ripple “energy”
            float rippleEnergy = length(g);
            float highlight = smoothstep(0.06, 0.22, rippleEnergy);

            // Background: screenshot (if available) with refraction-like distortion.
            vec2 uv = vUv;
            vec2 distort = g * (0.015 * uLevel);

            // tiny background drift distortion so it’s not dead-still
            distort += vec2(
              sin((uv.y * 6.0) + uTime * 0.15),
              sin((uv.x * 6.0) - uTime * 0.12)
            ) * (0.0015 * uLevel);

            // slight height-based push
            distort += vec2(h) * (0.006 * uLevel);

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

// -------------------------
// RippleSim: wave equation ping-pong sim
// -------------------------
function RippleSim({
  enabled,
  strength = 1.0,
  simSize = 512,
  onTexture,
}: {
  enabled: boolean;
  strength?: number;
  simSize?: number;
  onTexture: (tex: THREE.Texture | null) => void;
}) {
  const { gl } = useThree();

  const rtA = useFBO(simSize, simSize, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
  const rtB = useFBO(simSize, simSize, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });

  // We need two previous states (t and t-1). We'll store:
  // prev = readTex
  // prevPrev = readTex2
  // and write into writeRT
  const read0 = useRef<THREE.WebGLRenderTarget>(rtA);
  const read1 = useRef<THREE.WebGLRenderTarget>(rtB);
  const write = useRef<THREE.WebGLRenderTarget>(rtA);

  // scene/camera for full-screen sim quad
  const simScene = useMemo(() => new THREE.Scene(), []);
  const simCam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null as THREE.Texture | null },
        uPrevPrev: { value: null as THREE.Texture | null },
        uDt: { value: 1 / 60 },
        uTexel: { value: new THREE.Vector2(1 / simSize, 1 / simSize) },
        uMouse: { value: new THREE.Vector2(-10, -10) },
        uImpulse: { value: 0 },
        uImpulseRadius: { value: 0.02 }, // in UV units
        uC: { value: 0.35 }, // wave speed-ish
        uDamping: { value: 0.020 }, // higher = faster fade
        uStrength: { value: strength },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;

        uniform sampler2D uPrev;
        uniform sampler2D uPrevPrev;
        uniform vec2 uTexel;
        uniform float uDt;
        uniform vec2 uMouse;
        uniform float uImpulse;
        uniform float uImpulseRadius;
        uniform float uC;
        uniform float uDamping;
        uniform float uStrength;

        float sampleH(sampler2D tex, vec2 uv) {
          return texture2D(tex, uv).r;
        }

        void main() {
          float h  = sampleH(uPrev, vUv);
          float h1 = sampleH(uPrevPrev, vUv);

          // Laplacian
          float l = 0.0;
          l += sampleH(uPrev, vUv + vec2( uTexel.x, 0.0));
          l += sampleH(uPrev, vUv + vec2(-uTexel.x, 0.0));
          l += sampleH(uPrev, vUv + vec2(0.0,  uTexel.y));
          l += sampleH(uPrev, vUv + vec2(0.0, -uTexel.y));
          l -= 4.0 * h;

          // wave equation step (discrete)
          float c2 = (uC * uC);
          float next = (2.0 * h - h1) + c2 * l;

          // damping (damps velocity)
          float vel = (h - h1);
          next -= uDamping * vel;

          // impulse (splat) based on mouse movement speed
          // gaussian falloff
          float d = distance(vUv, uMouse);
          float splat = exp(-(d*d) / (uImpulseRadius*uImpulseRadius));
          next += splat * uImpulse * uStrength;

          // keep values bounded a bit
          next = clamp(next, -1.0, 1.0);

          gl_FragColor = vec4(next, 0.0, 0.0, 1.0);
        }
      `,
    });
  }, [simSize, strength]);

  const quad = useMemo(() => {
    const geo = new THREE.PlaneGeometry(2, 2);
    const m = mat;
    const mesh = new THREE.Mesh(geo, m);
    simScene.add(mesh);
    return mesh;
  }, [mat, simScene]);

  // Mouse velocity -> impulse strength
  const mouseUv = useRef(new THREE.Vector2(-10, -10));
  const lastMouse = useRef(new THREE.Vector2(0, 0));
  const lastT = useRef(performance.now());
  const impulse = useRef(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!enabled) return;
      const x = e.clientX / window.innerWidth;
      const y = 1.0 - e.clientY / window.innerHeight;
      mouseUv.current.set(x, y);

      const now = performance.now();
      const dt = Math.max(1, now - lastT.current);
      const dx = x - lastMouse.current.x;
      const dy = y - lastMouse.current.y;
      const speed = Math.sqrt(dx * dx + dy * dy) / (dt / 1000); // uv/sec
      lastMouse.current.set(x, y);
      lastT.current = now;

      // map speed -> impulse (tweak)
      impulse.current = Math.min(1.0, speed * 0.15);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [enabled]);

  useFrame((_s, dt) => {
    if (!enabled) return;

    // ping-pong targets:
    // read0 = prev, read1 = prevPrev, write = output
    const prev = read0.current;
    const prevPrev = read1.current;

    // swap write target (alternate between A and B)
    write.current = write.current === rtA ? rtB : rtA;

    mat.uniforms.uPrev.value = prev.texture;
    mat.uniforms.uPrevPrev.value = prevPrev.texture;
    mat.uniforms.uDt.value = dt;
    mat.uniforms.uMouse.value.copy(mouseUv.current);
    mat.uniforms.uImpulse.value = impulse.current;

    // decay impulse so you get discrete “strokes”
    impulse.current *= 0.85;

    gl.setRenderTarget(write.current);
    gl.clear();
    gl.render(simScene, simCam);
    gl.setRenderTarget(null);

    // advance history: prevPrev <- prev, prev <- write
    read1.current = prev;
    read0.current = write.current;
  });

  // output “latest” height texture
  useEffect(() => {
    onTexture(enabled ? read0.current.texture : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, onTexture]);

  useFrame(() => {
    onTexture(enabled ? read0.current.texture : null);
  });
  return null;
}