/**
 * Live Mesh Status 3D / Battery-Aware Orb Stage (src/scenes/MeshOrbStage.tsx)
 * Per §6 & §8.3:
 * - Preserves the exact NOVA glossy iridescent glass Orb + orbiting peer dots (one per connected peer).
 * - Semantic states:
 *   - `idle`: lilac (var(--relay))
 *   - `scanning`: gentle pulse
 *   - `connected`: orbiting satellite spheres (one per peer) + electric blue / lime rim
 *   - `sos`: high-urgency coral (var(--sos))
 * - Battery efficiency (§6):
 *   - In `saver` mode (<15% battery), `prefers-reduced-motion`, or when off the Home screen,
 *     automatically pauses WebGL and renders a zero-GPU CSS glass orb so battery drain is near zero.
 */

import React, { Component, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PeerNode, PowerMode } from '../mesh/types';
import { ThemeMode } from '../ui/theme';

export type OrbMeshState = 'idle' | 'scanning' | 'connected' | 'sos';

interface MeshOrbStageProps {
  orbState: OrbMeshState;
  peers: PeerNode[];
  powerMode: PowerMode;
  batteryPct: number;
  theme: ThemeMode;
  isHomeScreen: boolean;
  reducedMotion: boolean;
}

class WebGLErrorBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function LiveOrbMesh3D({
  orbState,
  peers,
  theme,
}: {
  orbState: OrbMeshState;
  peers: PeerNode[];
  theme: ThemeMode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const coreMeshRef = useRef<THREE.Mesh>(null);
  const satellitesRef = useRef<THREE.Group>(null);

  const palette = useMemo(() => {
    if (orbState === 'sos') {
      return {
        primary: 'var(--sos)',
        emissive: '#FF3B1F',
        rim: '#FFB58C',
      };
    }
    if (orbState === 'connected') {
      return {
        primary: theme === 'light' ? 'var(--relay)' : '#9E7BFF',
        emissive: 'var(--verified)',
        rim: 'var(--lime)',
      };
    }
    return {
      primary: 'var(--relay)',
      emissive: theme === 'light' ? '#6D4AFF' : '#4C28CC',
      rim: 'var(--verified)',
    };
  }, [orbState, theme]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;

    if (groupRef.current) {
      groupRef.current.rotation.y += dt * (orbState === 'sos' ? 0.95 : 0.38);
      groupRef.current.position.y = Math.sin(t * 1.6) * 0.08;
    }

    if (coreMeshRef.current) {
      const pulseSpeed = orbState === 'sos' ? 5.5 : orbState === 'scanning' ? 2.8 : 1.4;
      const pulseAmp = orbState === 'sos' ? 0.065 : 0.03;
      const scale = 1 + Math.sin(t * pulseSpeed) * pulseAmp;
      coreMeshRef.current.scale.setScalar(scale);
    }

    if (satellitesRef.current) {
      satellitesRef.current.rotation.y -= dt * 0.65;
      satellitesRef.current.rotation.z = Math.sin(t * 0.7) * 0.18;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Outer Glass Iridescent Shell */}
      <mesh ref={coreMeshRef}>
        <icosahedronGeometry args={[1.22, 6]} />
        <meshPhysicalMaterial
          color={palette.primary}
          emissive={palette.emissive}
          emissiveIntensity={orbState === 'sos' ? 0.55 : 0.24}
          roughness={0.14}
          metalness={0.12}
          transmission={0.62}
          thickness={1.4}
          ior={1.45}
          clearcoat={1}
          clearcoatRoughness={0.08}
        />
      </mesh>

      {/* Inner Core */}
      <mesh>
        <sphereGeometry args={[0.58, 24, 24]} />
        <meshStandardMaterial
          color={palette.rim}
          emissive={palette.primary}
          emissiveIntensity={0.65}
          roughness={0.25}
        />
      </mesh>

      {/* Orbiting Peer Dots (one per known/connected peer) */}
      <group ref={satellitesRef}>
        {peers.map((peer, idx) => {
          const angle = (idx / Math.max(1, peers.length)) * Math.PI * 2;
          const radius = peer.isDirectNeighbor ? 1.72 : 2.08;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          const y = Math.sin(angle * 2) * 0.28;
          const dotColor =
            peer.trustStatus === 'key_changed'
              ? 'var(--sos)'
              : peer.isDirectNeighbor
                ? 'var(--lime)'
                : 'var(--verified)';

          return (
            <mesh key={peer.nodeId} position={[x, y, z]}>
              <sphereGeometry args={[peer.isDirectNeighbor ? 0.12 : 0.085, 16, 16]} />
              <meshStandardMaterial
                color={dotColor}
                emissive={dotColor}
                emissiveIntensity={0.8}
                roughness={0.2}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function StaticCssOrbFallback({
  orbState,
  peers,
  powerMode,
  batteryPct,
}: {
  orbState: OrbMeshState;
  peers: PeerNode[];
  powerMode: PowerMode;
  batteryPct: number;
}) {
  const gradient =
    orbState === 'sos'
      ? 'radial-gradient(circle at 32% 28%, var(--on-sos) 0%, #FFB58C 22%, var(--sos) 58%, #3B0D08 100%)'
      : orbState === 'connected'
        ? 'radial-gradient(circle at 32% 28%, var(--on-sos) 0%, var(--lime) 24%, var(--relay) 56%, var(--verified) 92%)'
        : 'radial-gradient(circle at 32% 28%, var(--on-sos) 0%, var(--relay) 34%, var(--verified) 78%, var(--on-fill) 100%)';

  return (
    <div
      data-testid="orb-static-saver"
      className="relative flex h-56 w-56 items-center justify-center sm:h-64 sm:w-64"
    >
      {/* Outer Orbital Ring */}
      <div className="absolute inset-0 rounded-full border border-dashed border-[var(--line)] opacity-80" />

      {/* Peer Orbit Dots */}
      {peers.map((peer, idx) => {
        const angleDeg = (idx / Math.max(1, peers.length)) * 360;
        return (
          <div
            key={peer.nodeId}
            style={{
              transform: `rotate(${angleDeg}deg) translateX(108px) rotate(-${angleDeg}deg)`,
            }}
            className="absolute flex items-center gap-1"
            title={`${peer.displayName} (${peer.hopsAway} hop${peer.hopsAway > 1 ? 's' : ''})`}
          >
            <span
              className={`block h-3.5 w-3.5 rounded-full border border-[var(--on-fill)] shadow-sm ${
                peer.isDirectNeighbor
                  ? 'bg-[var(--accent-green)]'
                  : 'bg-[var(--accent-blue)]'
              }`}
            />
            <span className="rounded bg-[var(--surface)]/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--fg)] shadow-xs">
              {peer.displayName.split(' ')[0]}
            </span>
          </div>
        );
      })}

      {/* Core Glossy CSS Orb */}
      <div
        className="relative h-36 w-36 rounded-full shadow-2xl transition-transform duration-500 sm:h-42 sm:w-42"
        style={{ background: gradient }}
      >
        <div className="absolute top-4 left-6 h-8 w-12 -rotate-25 rounded-full bg-white/45 blur-[2px]" />
      </div>

      {(powerMode === 'saver' || batteryPct < 15) && (
        <div className="absolute -bottom-3 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1 font-mono text-[10px] font-semibold tracking-wider text-[var(--muted)] uppercase shadow-xs">
          saver mode · webgl paused (0% gpu)
        </div>
      )}
    </div>
  );
}

export function MeshOrbStage({
  orbState,
  peers,
  powerMode,
  batteryPct,
  theme,
  isHomeScreen,
  reducedMotion,
}: MeshOrbStageProps) {
  const shouldPauseWebGL =
    !isHomeScreen ||
    powerMode === 'saver' ||
    batteryPct < 15 ||
    reducedMotion;

  const dprCap: [number, number] =
    powerMode === 'balanced' || batteryPct < 30 ? [1, 1.2] : [1, 1.5];

  const fallbackNode = (
    <StaticCssOrbFallback
      orbState={orbState}
      peers={peers}
      powerMode={powerMode}
      batteryPct={batteryPct}
    />
  );

  if (shouldPauseWebGL) {
    return fallbackNode;
  }

  return (
    <WebGLErrorBoundary fallback={fallbackNode}>
      <div
        data-testid="orb-webgl-stage"
        className="relative flex h-56 w-56 items-center justify-center sm:h-68 sm:w-68"
      >
        <Canvas
          dpr={dprCap}
          camera={{ position: [0, 0, 4.4], fov: 42 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        >
          <ambientLight intensity={theme === 'light' ? 0.85 : 0.55} />
          <directionalLight position={[4, 5, 4]} intensity={1.7} color="#fff7ed" />
          <pointLight position={[-3, -2, 3]} intensity={1.1} color="var(--relay)" />
          <LiveOrbMesh3D orbState={orbState} peers={peers} theme={theme} />
        </Canvas>

        {/* Peer Callsign Labels Around Orb */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {peers.slice(0, 5).map((peer, idx) => {
            const angleRad =
              (idx / Math.max(1, Math.min(5, peers.length))) * Math.PI * 2 -
              Math.PI / 4;
            const rx = Math.cos(angleRad) * 116;
            const ry = Math.sin(angleRad) * 96;
            return (
              <div
                key={peer.nodeId}
                style={{ transform: `translate(${rx}px, ${ry}px)` }}
                className="absolute flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)]/92 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--fg)] shadow-xs backdrop-blur-xs"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    peer.isDirectNeighbor
                      ? 'bg-[var(--accent-green)]'
                      : 'bg-[var(--accent-blue)]'
                  }`}
                />
                <span>{peer.displayName.split(' ')[0]}</span>
                <span className="text-[var(--muted)]">{peer.hopsAway}h</span>
              </div>
            );
          })}
        </div>
      </div>
    </WebGLErrorBoundary>
  );
}
