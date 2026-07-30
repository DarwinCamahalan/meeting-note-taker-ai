'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, RoundedBox } from '@react-three/drei';
import type { SceneProps } from './types';

/**
 * The WebGL hero: a glassy representation of the Cue overlay slowly floating in
 * front of a blurred "meeting" plane — "a private layer only you see".
 *
 * This module is the ONLY place `three` / `@react-three/*` are imported, and it
 * is reached exclusively via `next/dynamic(..., { ssr: false })` from
 * {@link Hero3D}. That guarantees the ~600KB three bundle is a separate async
 * chunk, excluded from the initial route JS and the RSC/SSR payload
 * (docs/11-web-landing.md §4.1, §4.4).
 *
 * No `<Environment>` HDR and no `.glb` asset are loaded — the scene is fully
 * procedural and self-contained, so it works offline with zero extra network
 * requests. Power discipline per §4.2: `frameloop="demand"` + a `Ticker` that
 * only calls `invalidate()` while un-paused, so a scrolled-away or backgrounded
 * hero idles the GPU.
 */
export function Scene({ paused }: SceneProps): React.JSX.Element {
  return (
    <Canvas
      frameloop={paused ? 'never' : 'demand'}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
      camera={{ position: [0, 0, 6], fov: 40 }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 5]} intensity={1.4} />
      <pointLight position={[-4, -2, 2]} intensity={30} color="#7c5cff" />

      {/* Blurred "meeting" plane behind the overlay. */}
      <mesh position={[0, 0, -1.6]}>
        <planeGeometry args={[9, 5.5]} />
        <meshStandardMaterial color="#2a2440" roughness={1} metalness={0} />
      </mesh>

      <Float
        speed={paused ? 0 : 1.2}
        rotationIntensity={paused ? 0 : 0.4}
        floatIntensity={paused ? 0 : 0.8}
      >
        <OverlayCard />
      </Float>

      <Ticker paused={paused} />
    </Canvas>
  );
}

/** The glassy overlay panel plus a cue-purple accent bar. */
function OverlayCard(): React.JSX.Element {
  return (
    <group rotation={[0.15, -0.35, 0]}>
      <RoundedBox args={[3.2, 2, 0.12]} radius={0.14} smoothness={6}>
        <meshPhysicalMaterial
          color="#c9c4ff"
          transmission={0.9}
          thickness={0.6}
          roughness={0.12}
          metalness={0}
          ior={1.3}
          clearcoat={1}
          clearcoatRoughness={0.15}
          transparent
          opacity={0.9}
        />
      </RoundedBox>

      {/* Accent "cue" bar floating just above the glass surface. */}
      <RoundedBox args={[2.4, 0.34, 0.06]} radius={0.08} smoothness={4} position={[0, -0.55, 0.12]}>
        <meshStandardMaterial
          color="#7c5cff"
          emissive="#7c5cff"
          emissiveIntensity={0.6}
          roughness={0.35}
          metalness={0.1}
        />
      </RoundedBox>
    </group>
  );
}

/**
 * Drives demand-mode renders. In `frameloop="demand"`, three paints only when
 * something calls `invalidate()`; we do so each frame while un-paused to keep
 * the Float animation alive, and stop entirely when paused so the GPU idles.
 */
function Ticker({ paused }: SceneProps): null {
  const invalidate = useThree((state) => state.invalidate);
  useFrame(() => {
    if (!paused) invalidate();
  });
  return null;
}
