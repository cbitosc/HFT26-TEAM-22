import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { siteContent } from '../content';
import { getHeroObjectTextures } from '../lib/artTextures';
import { gsap, EASINGS } from '../lib/gsap';
import {
  computeHeroUnfoldState,
  dampValue,
  getSceneWeights,
  readCssThemePalette,
  scrollState,
  ThemeMode,
} from '../lib/scroll';
import {
  streakBackdropFragmentShader,
  streakBackdropVertexShader,
} from '../lib/shaders';

/**
 * SCENE 3 – Hero Object Scroll Story (src/scenes/HeroObject.tsx)
 * -----------------------------------------------------------------------------
 * ONE composite hero 3D object (stylised hardware booklet/device built from
 * rounded boxes with procedural texture faces, cylindrical metallic spine
 * hinge, rising holographic core, floor contact shadow, and diagonal streak
 * atmosphere shader).
 * Scroll scrubs: rotates in from above, tilts, and hinges open to reveal its
 * inner luminous face while 4 serif captions reveal beneath it.
 */
export function HeroObjectScene3D({ theme }: { theme: ThemeMode }) {
  const rootRef = useRef<THREE.Group>(null);
  const deviceGroupRef = useRef<THREE.Group>(null);
  const hingePivotRef = useRef<THREE.Group>(null);
  const innerCoreRef = useRef<THREE.Mesh>(null);
  const shadowMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const palette = useMemo(() => readCssThemePalette(), [theme]);
  const { outer: outerTex, inner: innerTex } = useMemo(
    () => getHeroObjectTextures(),
    []
  );

  // Soft radial contact shadow canvas texture
  const shadowTexture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }, []);

  const streakUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    }),
    []
  );

  useEffect(() => {
    return () => {
      shadowTexture.dispose();
    };
  }, [shadowTexture]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.25);
    const root = rootRef.current;
    const device = deviceGroupRef.current;
    const hinge = hingePivotRef.current;
    if (!root || !device || !hinge) return;

    const weights = getSceneWeights(scrollState.dampedProgress);
    const w = scrollState.showcaseHeroWeight;
    root.visible = w > 0.01;
    if (w <= 0.01) return;

    const unfold = computeHeroUnfoldState(weights.heroLocalProgress);

    // Smoothly damp position, tilt, rotation, and hinge unfolding angle
    device.position.x = dampValue(
      device.position.x,
      unfold.innerGlowIntensity * 0.68,
      6.5,
      dt
    );
    device.position.y = dampValue(device.position.y, 0.12 + unfold.entryY, 6.5, dt);
    device.rotation.x = dampValue(
      device.rotation.x,
      unfold.tiltX - scrollState.dampedPointerY * 0.14,
      6.5,
      dt
    );
    device.rotation.y = dampValue(
      device.rotation.y,
      unfold.rotateY + scrollState.dampedPointerX * 0.22,
      6.5,
      dt
    );

    const scaleTarget = Math.max(0.001, w * 0.76);
    const s = dampValue(device.scale.x, scaleTarget, 7.0, dt);
    device.scale.setScalar(s);

    // Hinge opens along the left spine (-Z rotation opens top cover like a booklet/laptop)
    hinge.rotation.z = dampValue(hinge.rotation.z, unfold.hingeAngleRad, 6.5, dt);

    // Inner holographic core rises and spins as cover unfolds
    if (innerCoreRef.current) {
      const coreRise = unfold.innerGlowIntensity * 0.42;
      innerCoreRef.current.position.y = dampValue(
        innerCoreRef.current.position.y,
        0.12 + coreRise,
        6.5,
        dt
      );
      innerCoreRef.current.rotation.y = state.clock.elapsedTime * 1.1;
      innerCoreRef.current.rotation.x = state.clock.elapsedTime * 0.7;
      innerCoreRef.current.scale.setScalar(
        Math.max(0.001, unfold.innerGlowIntensity * 0.36)
      );
    }

    if (shadowMatRef.current) {
      shadowMatRef.current.opacity = w * (theme === 'light' ? 0.14 : 0.6);
    }

    streakUniforms.uTime.value = state.clock.elapsedTime;
    streakUniforms.uOpacity.value = w * (theme === 'light' ? 0.15 : 0.9);
  });

  return (
    <group ref={rootRef}>
      {/* Faint Diagonal Streaks Atmosphere Backdrop */}
      <mesh position={[0, 0, -3.5]}>
        <planeGeometry args={[16, 10]} />
        <shaderMaterial
          vertexShader={streakBackdropVertexShader}
          fragmentShader={streakBackdropFragmentShader}
          uniforms={streakUniforms}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* Dedicated Soft Key Light for the Dark Room */}
      <spotLight
        position={[2.5, 4.5, 3.5]}
        intensity={2.4}
        angle={0.55}
        penumbra={0.85}
        color="#ffffff"
      />
      <pointLight position={[0, 0.9, 0.5]} intensity={1.4} color={palette.green} />

      {/* Unfolding Composite 3D Booklet / Device */}
      <group ref={deviceGroupRef} position={[0, 0.05, 0]}>
        {/* 1. Bottom Base Chassis Deck */}
        <RoundedBox args={[2.2, 0.12, 1.56]} radius={0.04} smoothness={4} position={[0, 0, 0]}>
          <meshStandardMaterial color="#14151b" roughness={0.28} metalness={0.75} />
        </RoundedBox>

        {/* 2. Inner Base Luminous Screen Face */}
        <mesh position={[0, 0.065, 0]} rotation={[-Math.PI * 0.5, 0, 0]}>
          <planeGeometry args={[2.0, 1.38]} />
          <meshStandardMaterial
            map={innerTex}
            emissiveMap={innerTex}
            emissive="#ffffff"
            emissiveIntensity={0.45}
            roughness={0.2}
          />
        </mesh>

        {/* 3. Metallic Spine Hinge Cylinder on Left Edge (x = -1.08) */}
        <mesh position={[-1.08, 0.07, 0]} rotation={[Math.PI * 0.5, 0, 0]}>
          <cylinderGeometry args={[0.065, 0.065, 1.48, 24]} />
          <meshStandardMaterial
            color={palette.lilac}
            roughness={0.2}
            metalness={0.9}
          />
        </mesh>

        {/* 4. Rising Inner Holographic Core Artifact */}
        <mesh ref={innerCoreRef} position={[0, 0.12, 0]}>
          <octahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            color={palette.green}
            emissive={palette.green}
            emissiveIntensity={0.65}
            roughness={0.15}
            metalness={0.4}
            wireframe
          />
        </mesh>

        {/* 5. Hinged Upper Cover Leaf (pivots around x = -1.08) */}
        <group ref={hingePivotRef} position={[-1.08, 0.08, 0]}>
          <group position={[1.08, 0.06, 0]}>
            <RoundedBox args={[2.2, 0.1, 1.56]} radius={0.04} smoothness={4}>
              <meshStandardMaterial color="#191a22" roughness={0.24} metalness={0.78} />
            </RoundedBox>

            {/* Outer Cover Emblem Face */}
            <mesh position={[0, 0.055, 0]} rotation={[-Math.PI * 0.5, 0, 0]}>
              <planeGeometry args={[2.0, 1.38]} />
              <meshStandardMaterial
                map={outerTex}
                roughness={0.3}
                metalness={0.4}
              />
            </mesh>

            {/* Inner Cover Unfolded Display Face */}
            <mesh position={[0, -0.055, 0]} rotation={[Math.PI * 0.5, 0, 0]}>
              <planeGeometry args={[2.0, 1.38]} />
              <meshStandardMaterial
                map={innerTex}
                emissiveMap={innerTex}
                emissive={palette.blue}
                emissiveIntensity={0.35}
                roughness={0.18}
              />
            </mesh>
          </group>
        </group>
      </group>

      {/* Subtle Floor Contact Shadow */}
      <mesh position={[0, -0.82, 0]} rotation={[-Math.PI * 0.5, 0, 0]}>
        <planeGeometry args={[3.4, 2.2]} />
        <meshBasicMaterial
          ref={shadowMatRef}
          map={shadowTexture}
          transparent
          depthWrite={false}
          opacity={theme === 'light' ? 0.14 : 0.55}
        />
      </mesh>
    </group>
  );
}

/**
 * SCENE 3 DOM Overlay – 4 Scroll Beats (problem, idea, how it works, impact)
 * with short serif captions revealed line-by-line beneath the 3D object.
 */
export function HeroObjectDOMOverlay({
  activeScene,
  heroBeatIndex,
}: {
  activeScene: number;
  heroBeatIndex: 0 | 1 | 2 | 3;
}) {
  const beatContainerRef = useRef<HTMLDivElement>(null);
  const line1Ref = useRef<HTMLSpanElement>(null);
  const line2Ref = useRef<HTMLSpanElement>(null);
  const detailRef = useRef<HTMLParagraphElement>(null);

  const beats = siteContent.scene3HeroObject.beats;
  const currentBeat = beats[heroBeatIndex] ?? beats[0];
  const isVisible = scrollState.showcaseHeroWeight > 0.25 && activeScene === 3;

  useEffect(() => {
    if (!isVisible || !beatContainerRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        [line1Ref.current, line2Ref.current],
        { yPercent: 105, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: 0.72,
          stagger: 0.08,
          ease: EASINGS.expoOut,
          overwrite: 'auto',
        }
      );

      gsap.fromTo(
        detailRef.current,
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.65,
          delay: 0.12,
          ease: EASINGS.expoOut,
          overwrite: 'auto',
        }
      );
    }, beatContainerRef);

    return () => ctx.revert();
  }, [heroBeatIndex, isVisible]);

  return (
    <section
      aria-label={siteContent.scene3HeroObject.sectionKicker}
      className={`pointer-events-none fixed inset-0 z-10 flex flex-col justify-between px-6 py-20 text-center transition-opacity duration-500 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Top Kicker + 4-Beat Progress Dots */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <span className="font-grotesk text-xs tracking-widest text-[var(--muted)] lowercase">
          {siteContent.scene3HeroObject.sectionKicker}
        </span>
        <div className="flex items-center gap-2">
          {beats.map((b, idx) => (
            <span
              key={b.id}
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === heroBeatIndex
                  ? 'w-7 border border-[#0B0B0B]/25 bg-[var(--accent)]'
                  : 'w-2 bg-[var(--fg)]/18'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Bottom Centered Emotional Serif Caption for Active Beat */}
      <div ref={beatContainerRef} className="mx-auto max-w-2xl pb-4">
        <div className="mb-2 flex items-center justify-center gap-2 font-grotesk text-xs font-medium lowercase">
          <span className="rounded-full bg-[var(--accent)] px-2.5 py-0.5 font-semibold text-[#0B0B0B]">
            {currentBeat.step}
          </span>
          <span className="text-[var(--muted)]">•</span>
          <span className="text-[var(--fg)]">{currentBeat.tag}</span>
        </div>

        <h2 className="text-caption-serif italic text-[var(--fg)]">
          <span className="split-line-mask">
            <span ref={line1Ref} className="block">
              {currentBeat.captionLine1}
            </span>
          </span>
          <span className="split-line-mask">
            <span ref={line2Ref} className="block text-[var(--accent-3)]">
              {currentBeat.captionLine2}
            </span>
          </span>
        </h2>

        <p
          ref={detailRef}
          className="mx-auto mt-3 max-w-lg font-grotesk text-xs leading-relaxed text-[var(--muted)] lowercase md:text-sm"
        >
          {currentBeat.detail}
        </p>
      </div>
    </section>
  );
}
