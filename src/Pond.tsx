// src/Pond.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useFBO } from "@react-three/drei";

export type PondPhase = "off" | "filling" | "on" | "draining";

type PondProps = {
  phase: PondPhase;
  backgroundImage: string | null;
  onDrained?: () => void;
};

export default function Pond({
  phase,
  backgroundImage,
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
        style={{ pointerEvents: "none" }}
      >
        <PondScene
          phase={phase}
          backgroundImage={backgroundImage}
          onDrained={onDrained}
        />
      </Canvas>
    </div>
  );
}

type PondSceneProps = {
  phase: PondPhase;
  backgroundImage: string | null;
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
  const simSize = 512;

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
        simSize={simSize}
        onTexture={setRippleTex}
      />
      {/* Leaves: subtle floating sprites under the water surface */}
      <LeafSystem
        enabled={phase === "on" || phase === "filling"}
        level={level}
        rippleTex={rippleTex}
        simSize={simSize}
        maxLeaves={9}
        spawnEvery={[2.5, 6.5]}
      />

      <WaterPlane level={level} backgroundImage={backgroundImage} rippleTex={rippleTex} rippleSimSize={simSize}/>
    </>
  );
}


// -------------------------
// LeafSystem: occasionally spawns a few floating leaves that drift across the pond.
// - Uses an instanced mesh for performance.
// - Keeps a hard cap (maxLeaves) + randomized spawn intervals so it doesn't crowd.
// -------------------------
type LeafSystemProps = {
  enabled: boolean;
  level: number;
  rippleTex?: THREE.Texture | null;
  simSize: number;
  maxLeaves?: number;
  spawnEvery?: [number, number]; // seconds, [min,max]
};

type Leaf = {
  id: number;
  x: number;
  y: number;
  s: number;
  r: number;
  vx: number;
  wobble: number;
};

function LeafSystem({ enabled, level, rippleTex, simSize, maxLeaves = 8, spawnEvery = [3, 7] }: LeafSystemProps) {
  const { viewport } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const leavesRef = useRef<Leaf[]>([]);
  const idRef = useRef(1);
  const nextSpawnAt = useRef(0);

  const tmpObj = useMemo(() => new THREE.Object3D(), []);

  const leafTex = useMemo(() => {
    if (typeof document === "undefined") return null;

    // Tiny canvas texture (keeps bundle small vs importing images)
    const size = 128;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);

    // Leaf body (teardrop-ish)
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-0.35);

    const grad = ctx.createRadialGradient(-10, -10, 8, 0, 0, 60);
    grad.addColorStop(0, "rgba(170, 220, 150, 0.95)");
    grad.addColorStop(1, "rgba(50, 120, 75, 0.92)");
    ctx.fillStyle = grad;

    ctx.beginPath();
    // A simple bezier leaf silhouette
    ctx.moveTo(-8, -26);
    ctx.bezierCurveTo(26, -20, 32, 12, 0, 30);
    ctx.bezierCurveTo(-34, 16, -32, -12, -8, -26);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-6, -22);
    ctx.quadraticCurveTo(10, -2, 4, 26);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }, []);

  // --- Leaf shader material that samples rippleTex ---
  const leafMat = useMemo(() => {
    if (!leafTex) return null;

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uMap: { value: leafTex },
        uOpacity: { value: 0.0 },

        // ripple stuff
        uRippleTex: { value: null as THREE.Texture | null },
        uHasRipple: { value: 0.0 },
        uTexel: { value: new THREE.Vector2(1 / simSize, 1 / simSize) },

        // viewport dims so we can map world XY -> UV (0..1)
        uViewport: { value: new THREE.Vector2(viewport.width, viewport.height) },

        // tuning:
        uRide: { value: 0.010 },   // height ride amount (z offset)
        uTilt: { value: 0.10 },    // tilt amount from gradient
      },
      vertexShader: `
        precision highp float;

        attribute vec3 position;
        attribute vec2 uv;

        uniform sampler2D uRippleTex;
        uniform float uHasRipple;
        uniform vec2 uTexel;
        uniform vec2 uViewport;
        uniform float uRide;
        uniform float uTilt;

        varying vec2 vUv;

        float decodeH(float r) { return r * 2.0 - 1.0; }

        void main() {
          vUv = uv;

          // Start in leaf-local coords
          vec3 p = position;

          // World center of this instance:
          vec4 worldCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

          // Map world XY (viewport units centered at 0) -> ripple UV (0..1)
          vec2 ruv = (worldCenter.xy / uViewport) + vec2(0.5);

          // Clamp so sampling is safe near edges
          ruv = clamp(ruv, vec2(0.001), vec2(0.999));

          float h = 0.0;
          vec2 grad = vec2(0.0);

          if (uHasRipple > 0.5) {
            float hC = decodeH(texture2D(uRippleTex, ruv).r);
            float hL = decodeH(texture2D(uRippleTex, ruv - vec2(uTexel.x, 0.0)).r);
            float hR = decodeH(texture2D(uRippleTex, ruv + vec2(uTexel.x, 0.0)).r);
            float hD = decodeH(texture2D(uRippleTex, ruv - vec2(0.0, uTexel.y)).r);
            float hU = decodeH(texture2D(uRippleTex, ruv + vec2(0.0, uTexel.y)).r);

            h = hC;
            grad = vec2(hR - hL, hU - hD);
          }

          // Ride the surface (small Z offset)
          p.z += h * uRide;

          // Optional: tilt leaf slightly along slope
          // (In ortho this is subtle, but it helps the "stuck to surface" feel.)
          p.x += grad.x * uTilt * p.z;
          p.y += grad.y * uTilt * p.z;

          gl_Position = projectionMatrix * viewMatrix * (modelMatrix * instanceMatrix) * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        varying vec2 vUv;

        uniform sampler2D uMap;
        uniform float uOpacity;

        void main() {
          vec4 c = texture2D(uMap, vUv);
          float a = c.a * uOpacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(c.rgb, a);
        }
      `,
    });

    mat.toneMapped = false;
    return mat;
  }, [leafTex, simSize]); // viewport dimensions are updated via uViewport uniform in useFrame — not needed here

  // Reset when disabled
  useEffect(() => {
    if (enabled) return;
    leavesRef.current = [];
    nextSpawnAt.current = 0;
  }, [enabled]);

  const spawnLeaf = () => {
    const w = viewport.width;
    const h = viewport.height;
    const margin = 0.65;

    // Avoid crowding: don't spawn if there is already a leaf close to the spawn edge
    if (leavesRef.current.length >= Math.floor(maxLeaves * 0.7)) {
      const tooClose = leavesRef.current.some((l) => l.x < -w / 2 + 1.6);
      if (tooClose) return;
    }

    const s = THREE.MathUtils.lerp(0.13, 0.26, Math.random());
    const y = THREE.MathUtils.lerp(-h / 2 + 0.6, h / 2 - 0.6, Math.random());
    const vx = THREE.MathUtils.lerp(0.10, 0.22, Math.random());

    leavesRef.current.push({
      id: idRef.current++,
      x: -w / 2 - margin,
      y,
      s,
      r: THREE.MathUtils.lerp(-Math.PI, Math.PI, Math.random()),
      vx,
      wobble: Math.random() * Math.PI * 2,
    });
  };

  useFrame(({ clock }, dt) => {
    if (!enabled || !meshRef.current || !leafMat || !leafTex) return;

    const now = clock.getElapsedTime();
    // keep uniforms fresh
    leafMat.uniforms.uViewport.value.set(viewport.width, viewport.height);
    leafMat.uniforms.uRippleTex.value = rippleTex;
    leafMat.uniforms.uHasRipple.value = rippleTex ? 1.0 : 0.0;

    leafMat.uniforms.uOpacity.value = 1.0

    if (nextSpawnAt.current === 0) {
    // Spawn quickly once so it never looks "broken" (otherwise you may wait several seconds).
    const firstDelay = THREE.MathUtils.lerp(0.2, 0.8, Math.random());
    nextSpawnAt.current = now + firstDelay;

    // Force an immediate first leaf the first time we run
    if (leavesRef.current.length === 0) {
      spawnLeaf();
    }
  }

    // Spawn at most one leaf per interval, and only if under the cap.
    if (now >= nextSpawnAt.current && leavesRef.current.length < maxLeaves) {
      spawnLeaf();
      nextSpawnAt.current = now + THREE.MathUtils.lerp(spawnEvery[0], spawnEvery[1], Math.random());
    }

    // Move + bob
    for (const l of leavesRef.current) {
      l.x += l.vx * dt;
      l.y += Math.sin(now * 0.35 + l.wobble) * 0.03 * dt * 60.0;
      l.r += Math.sin(now * 0.25 + l.wobble) * 0.004 * dt * 60.0;
    }

    const w = viewport.width;
    const h = viewport.height;
    const margin = 0.8;
    // Cull offscreen
    leavesRef.current = leavesRef.current.filter(
      (l) => l.x < w / 2 + margin && l.y > -h / 2 - margin && l.y < h / 2 + margin
    );

    // Write instance matrices
    const count = Math.min(leavesRef.current.length, maxLeaves);
    const waterZ = THREE.MathUtils.lerp(-0.35, 0.0, level);

    const EPS = 0.002; // tiny lift to avoid z-fighting

    for (let i = 0; i < count; i++) {
      const l = leavesRef.current[i];
      // Always keep leaves just *under* the water surface
      tmpObj.position.set(l.x, l.y, waterZ + EPS);
      tmpObj.rotation.set(0, 0, l.r);
      tmpObj.scale.set(l.s, l.s, 1);
      tmpObj.updateMatrix();
      meshRef.current.setMatrixAt(i, tmpObj.matrix);
    }

    meshRef.current.count = count;
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!leafMat || !leafTex) return null;

  return (
    <instancedMesh
      ref={meshRef}
      // r3f InstancedMesh ctor signature: (geometry, material, count)
      args={[null as any, null as any, maxLeaves]}
      frustumCulled={false}
      renderOrder={2}
    >
      <planeGeometry args={[1, 1]} />
      <primitive object={leafMat} attach="material" />
    </instancedMesh>
  );
}



function useDataUrlTexture(dataUrl: string | null) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!dataUrl) {
      setTex((prev) => {
        prev?.dispose();
        return null;
      });
      return;
    }

    const loader = new THREE.TextureLoader();
    const t = loader.load(dataUrl, () => {
      // loaded
    });

    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;

    setTex((prev) => {
      prev?.dispose();
      return t;
    });

    return () => {
      t.dispose();
    };
  }, [dataUrl]);

  return tex;
}

type WaterPlaneProps = {
  level: number;
  backgroundImage: string | null;
  rippleTex: THREE.Texture | null;
  rippleSimSize: number;
};

function WaterPlane({ level, backgroundImage, rippleTex, rippleSimSize }: WaterPlaneProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();

  // Subtle “approach” motion: tiny zoom + slight forward Z shift
  const z = THREE.MathUtils.lerp(-0.35, 0.0, level);
  const s = THREE.MathUtils.lerp(0.98, 1.02, level);

  const sceneTex = useDataUrlTexture(backgroundImage);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLevel: { value: level },
      uTint: { value: new THREE.Color("#2b74ff") },

      uSceneTex: { value: null as THREE.Texture | null },
      uHasSceneTex: { value: 0 },

      uRippleTex: { value: null as THREE.Texture | null },
      uHasRipple: { value: 0 },
      uRippleTexel: { value: new THREE.Vector2(1 / rippleSimSize, 1 / rippleSimSize) },
    }),
    [rippleSimSize]
  );

  useFrame((_state, dt: number) => {
    const mat = materialRef.current;
    if (!mat) return;

    mat.uniforms.uTime.value += dt;
    mat.uniforms.uLevel.value = level;

    mat.uniforms.uSceneTex.value = sceneTex;
    mat.uniforms.uHasSceneTex.value = sceneTex ? 1 : 0;

    mat.uniforms.uRippleTex.value = rippleTex;
    mat.uniforms.uHasRipple.value = rippleTex ? 1 : 0;
  });

  return (
    <mesh position={[0, 0, z]} scale={[s, s, 1]} renderOrder={3}>
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

          uniform sampler2D uRippleTex;
          uniform float uHasRipple;
          uniform vec2 uRippleTexel;
                    
          float drift(vec2 p){
            float t = uTime * 0.08;
            float a = 0.015;
            return sin((p.x*2.5) + t) * a + sin((p.y*2.2) - t*1.2) * a;
          }

          float decodeH(float r) { return r * 2.0 - 1.0; }

          float rippleH(vec2 uv){
            if (uHasRipple < 0.5) return 0.0;
            return decodeH(texture2D(uRippleTex, uv).r);
          }

          vec2 rippleGrad(vec2 uv){
            if (uHasRipple < 0.5) return vec2(0.0);
            vec2 e = uRippleTexel;
            float hL = decodeH(texture2D(uRippleTex, uv - vec2(e.x,0.0)).r);
            float hR = decodeH(texture2D(uRippleTex, uv + vec2(e.x,0.0)).r);
            float hD = decodeH(texture2D(uRippleTex, uv - vec2(0.0,e.y)).r);
            float hU = decodeH(texture2D(uRippleTex, uv + vec2(0.0,e.y)).r);
            return vec2(hR - hL, hU - hD);
          }

          void main() {
            // “Toward viewer” effect:
            // - no vertical reveal
            // - water presence increases with uLevel
            // - wave intensity & highlights increase with uLevel

            // Slight “zoom” in UV space as it approaches
            vec2 p = (vUv - 0.5) * (1.0 + uLevel * 0.10) + 0.5;

            vec2 rUv = vUv;

            // Global ripple height + gradient from simulation
            float h = drift(p) + rippleH(rUv) * 0.45;
            vec2 g = rippleGrad(rUv) * 0.85;

            // highlights based on ripple “energy”
            float rippleEnergy = length(g);
            float highlight = smoothstep(0.06, 0.22, rippleEnergy);

            // Background: screenshot (if available) with refraction-like distortion.
            vec2 uv = vUv;
            vec2 distort = g * (0.03 * uLevel);

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
            col += vec3(0.18, 0.26, 0.32) * highlight;

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
  const rtC = useFBO(simSize, simSize, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });

  useEffect(() => {
    const prevRT = gl.getRenderTarget();
    const prevClear = gl.getClearColor(new THREE.Color());
    const prevAlpha = gl.getClearAlpha();

    gl.setClearColor(new THREE.Color(0.5, 0, 0), 1);

    for (const rt of [rtA, rtB, rtC]) {
      gl.setRenderTarget(rt);
      gl.clear(true, false, false);
    }

    gl.setClearColor(prevClear, prevAlpha);
    gl.setRenderTarget(prevRT);
  }, [gl, rtA, rtB, rtC]);

  const rts = useMemo(() => [rtA, rtB, rtC] as const, [rtA, rtB, rtC]);
  const prevIdx = useRef(0);
  const prevPrevIdx = useRef(1);
  const writeIdx = useRef(2);

  // scene/camera for full-screen sim quad
  const simScene = useMemo(() => new THREE.Scene(), []);
  const simCam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null as THREE.Texture | null },
        uPrevPrev: { value: null as THREE.Texture | null },
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

        uniform vec2 uMouse;
        uniform float uImpulse;
        uniform float uImpulseRadius;

        uniform float uC;
        uniform float uDamping;
        uniform float uStrength;

        float decodeH(float r) { return r * 2.0 - 1.0; }   // 0..1 -> -1..1
        float encodeH(float h) { return h * 0.5 + 0.5; }   // -1..1 -> 0..1

        float sampleH(sampler2D tex, vec2 uv) {
          return decodeH(texture2D(tex, uv).r);
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

          float next = (2.0 * h - h1) + (uC * uC) * l;

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

          gl_FragColor = vec4(encodeH(next), 0.0, 0.0, 1.0);
        }
      `,
    });
  }, [simSize, strength]);

  useEffect(() => {
    const geo = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geo, mat);
    simScene.add(mesh);

    return () => {
      simScene.remove(mesh);
      geo.dispose();
      // mat disposed by React/three when unmounting; fine to leave here
    };
  }, [mat, simScene]);

  // Mouse velocity -> impulse strength
  const mouseUv = useRef(new THREE.Vector2(-10, -10));
  const lastMouse = useRef(new THREE.Vector2(0, 0));
  const lastT = useRef(performance.now());
  const impulse = useRef(0);

  const baseRadius = 0.02;
  const impulseRadius = useRef(baseRadius);

  const getUvFromEvent = useCallback((e: PointerEvent) => {
    const rect = gl.domElement.getBoundingClientRect();

    const x = (e.clientX - rect.left) / rect.width;
    const y = 1.0 - (e.clientY - rect.top) / rect.height;

    return new THREE.Vector2(
      THREE.MathUtils.clamp(x, 0, 1),
      THREE.MathUtils.clamp(y, 0, 1)
    );
  }, [gl]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!enabled) return;

      const uv = getUvFromEvent(e);
      mouseUv.current.copy(uv);

      const now = performance.now();
      const dt = Math.max(1, now - lastT.current);

      const dx = uv.x - lastMouse.current.x;
      const dy = uv.y - lastMouse.current.y;

      const speed = Math.sqrt(dx * dx + dy * dy) / (dt / 1000); // uv/sec

      lastMouse.current.copy(uv);
      lastT.current = now;

      // map speed -> impulse (tweak)
      impulse.current = Math.min(1.0, speed * 0.35);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [enabled]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!enabled) return;

      const uv = getUvFromEvent(e);
      mouseUv.current.copy(uv);

      // Big splash on click
      impulse.current = Math.max(impulse.current, 1.25);

      // Slightly larger splat radius for clicks (then it eases back)
      impulseRadius.current = 0.04;

      // keep velocity bookkeeping sane
      lastMouse.current.copy(uv);
      lastT.current = performance.now();
    };

    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, [enabled]);

  useFrame((_s, dt) => {
    if (!enabled) {
      onTexture(null);
      return;
    }

    // ping-pong targets:
    // read0 = prev, read1 = prevPrev, write = output
    const prev = rts[prevIdx.current];
    const prevPrev = rts[prevPrevIdx.current];
    const write = rts[writeIdx.current];

    mat.uniforms.uPrev.value = prev.texture;
    mat.uniforms.uPrevPrev.value = prevPrev.texture;
    mat.uniforms.uMouse.value.copy(mouseUv.current);
    mat.uniforms.uImpulse.value = impulse.current;
    mat.uniforms.uImpulseRadius.value = impulseRadius.current;

    // decay impulse so you get discrete “strokes”
    impulse.current *= 0.85;

    // ease click radius back to normal
    impulseRadius.current = THREE.MathUtils.lerp(impulseRadius.current, baseRadius, 0.18);

    const prevRT = gl.getRenderTarget();
    const prevClear = gl.getClearColor(new THREE.Color());
    const prevAlpha = gl.getClearAlpha();

    gl.setClearColor(new THREE.Color(0.5, 0, 0), 1);
    gl.setRenderTarget(write);
    gl.clear(true, false, false);
    gl.render(simScene, simCam);

    gl.setClearColor(prevClear, prevAlpha);
    gl.setRenderTarget(prevRT);

    // advance history: prevPrev <- prev, prev <- write
    const oldPrevIdx = prevIdx.current;
    const oldPrevPrevIdx = prevPrevIdx.current;

    prevPrevIdx.current = oldPrevIdx;
    prevIdx.current = writeIdx.current;
    writeIdx.current = oldPrevPrevIdx;

    onTexture(rts[prevIdx.current].texture);
  });
  return null;
}