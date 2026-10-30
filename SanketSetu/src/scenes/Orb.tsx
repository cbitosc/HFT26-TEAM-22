import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Section } from '../components/Section';
import { Pill } from '../components/ui';
import { siteContent } from '../content';
import { getOrbFaceTexture } from '../lib/artTextures';
import {
  bindVariableProximityChars,
  gsap,
  SplitText,
  EASINGS,
} from '../lib/gsap';
import {
  computeOrbGuideState,
  dampValue,
  OrbExpression,
  readCssThemePalette,
  scrollState,
  setDiscreteState,
  ThemeMode,
} from '../lib/scroll';

/**
 * Persistent 3D Glass Orb Guide (src/scenes/Orb.tsx)
 * -----------------------------------------------------------------------------
 * Moves and scales to a section-specific guide coordinate across the entire
 * product story, updates its emissive face expression ('neutral', 'worried',
 * 'thinking', 'happy'), and modulates its orbital ring speed with heavy damping.
 */
export function OrbScene3D({
  isMobile,
  theme,
}: {
  isMobile: boolean;
  theme: ThemeMode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const coreMeshRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const ringAngleRef = useRef(0);
  const currentExprRef = useRef<OrbExpression>('neutral');

  const palette = useMemo(() => readCssThemePalette(), [theme]);
  const initialTex = useMemo(() => getOrbFaceTexture('neutral'), []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.25);
    const group = groupRef.current;
    if (!group) return;

    const guide = computeOrbGuideState(
      scrollState.activeSectionId,
      scrollState.pipelineProgress,
      scrollState.problemOrderProgress,
      scrollState.demoStatus,
      isMobile
    );

    // Sync expression to discrete store when it changes
    if (guide.expression !== currentExprRef.current) {
      currentExprRef.current = guide.expression;
      setDiscreteState({ orbExpression: guide.expression });

      const mesh = coreMeshRef.current;
      if (mesh) {
        const mat = mesh.material as
          | THREE.MeshPhysicalMaterial
          | THREE.MeshStandardMaterial;
        const nextTex = getOrbFaceTexture(guide.expression);
        mat.map = nextTex;
        mat.emissiveMap = nextTex;
        mat.emissive = new THREE.Color(
          guide.expression === 'worried'
            ? palette.coral
            : guide.expression === 'thinking'
            ? palette.lilac
            : palette.green
        );
        mat.needsUpdate = true;
      }
    }

    // Use guide coordinates directly (for use-cases, guide places orb in "corner-small" top-right)
    const heroOverride = scrollState.showcaseHeroWeight;
    const floatY = Math.sin(state.clock.elapsedTime * 1.8) * 0.06;

    const targetX = guide.x * (1 - heroOverride) + 2.95 * heroOverride;
    const targetY = (guide.y + floatY) * (1 - heroOverride) + 1.34 * heroOverride;
    const targetZ = guide.z * (1 - heroOverride) + -1.25 * heroOverride;
    const targetScale = guide.scale * (1 - heroOverride) + 0.25 * heroOverride;

    group.position.x = dampValue(group.position.x, targetX, 5.5, dt);
    group.position.y = dampValue(group.position.y, targetY, 5.5, dt);
    group.position.z = dampValue(group.position.z, targetZ, 5.5, dt);

    const nextScale = dampValue(
      group.scale.x,
      Math.max(0.05, targetScale),
      6.0,
      dt
    );
    group.scale.setScalar(nextScale);
    group.visible = true;

    // Look toward cursor with smooth heavy damping
    const targetRotY = scrollState.dampedPointerX * 0.58;
    const targetRotX = -scrollState.dampedPointerY * 0.42;
    group.rotation.y = dampValue(group.rotation.y, targetRotY, 5.5, dt);
    group.rotation.x = dampValue(group.rotation.x, targetRotX, 5.5, dt);

    if (haloRef.current) {
      ringAngleRef.current += guide.ringSpeed * dt;
      haloRef.current.rotation.z = ringAngleRef.current;
      haloRef.current.rotation.x =
        Math.PI * 0.38 + Math.sin(state.clock.elapsedTime * 1.2) * 0.08;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.28, 0]}>
      {/* Primary Glossy 3D Orb with Clearcoat, Iridescence & Emissive Face */}
      <mesh ref={coreMeshRef} rotation={[0, -Math.PI * 0.5, 0]}>
        <sphereGeometry args={[1, isMobile ? 32 : 64, isMobile ? 32 : 64]} />
        {isMobile ? (
          <meshStandardMaterial
            map={initialTex}
            emissiveMap={initialTex}
            emissive={new THREE.Color(palette.green)}
            emissiveIntensity={0.42}
            roughness={0.14}
            metalness={0.35}
          />
        ) : (
          <meshPhysicalMaterial
            map={initialTex}
            emissiveMap={initialTex}
            emissive={new THREE.Color(palette.green)}
            emissiveIntensity={0.48}
            roughness={0.08}
            metalness={0.25}
            clearcoat={1}
            clearcoatRoughness={0.06}
            iridescence={0.92}
            iridescenceIOR={1.35}
            iridescenceThicknessRange={[120, 420]}
            reflectivity={1}
          />
        )}
      </mesh>

      {/* Secondary Sculptural Orbital Ring */}
      <mesh ref={haloRef}>
        <torusGeometry args={[1.38, 0.018, 16, 96]} />
        <meshStandardMaterial
          color={palette.lilac}
          emissive={palette.blue}
          emissiveIntensity={0.45}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Tiny Orbiting Satellite Bead */}
      <mesh position={[1.38, 0, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial
          color={palette.coral}
          emissive={palette.coral}
          emissiveIntensity={0.65}
          roughness={0.15}
        />
      </mesh>
    </group>
  );
}

/**
 * HOME Section – Hero Statement Framing the Glossy 3D Orb (id="home")
 */
export function OrbDOMOverlay({
  isPreloaderDone,
  reducedMotion,
  hasScrolled,
}: {
  isPreloaderDone: boolean;
  reducedMotion: boolean;
  activeScene?: number;
  hasScrolled: boolean;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const statementRef = useRef<HTMLHeadingElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!isPreloaderDone || !statementRef.current) return;

    let unbindProximity = () => {};

    const ctx = gsap.context(() => {
      if (reducedMotion) {
        gsap.set([statementRef.current, captionRef.current], { opacity: 1, y: 0 });
        return;
      }

      const split = new SplitText(statementRef.current, {
        type: 'words,chars',
        wordsClass: 'split-word',
        charsClass: 'split-char',
      });

      gsap.fromTo(
        split.chars,
        { yPercent: 110, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: 1.0,
          stagger: 0.018,
          ease: EASINGS.expoOut,
        }
      );

      gsap.fromTo(
        captionRef.current,
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          delay: 0.3,
          ease: 'power3.out',
        }
      );

      unbindProximity = bindVariableProximityChars(split.chars, reducedMotion);

      return () => {
        unbindProximity();
        split.revert();
      };
    }, containerRef);

    return () => {
      unbindProximity();
      ctx.revert();
    };
  }, [isPreloaderDone, reducedMotion]);

  const line1Words = siteContent.scene1Orb.line1.split(' ');
  const line2Words = siteContent.scene1Orb.line2.split(' ');

  const heroHeader = (
    <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
      <div className="mb-2.5">
        <Pill dot>{siteContent.scene1Orb.indexLabel}</Pill>
      </div>

      <h1
        ref={statementRef}
        className="orb-overlap-legible font-grotesk text-statement-compact max-w-5xl font-semibold text-[var(--fg)] lowercase"
      >
        <span className="split-line-mask">
          <span className="block">
            {line1Words.map((word, idx) => (
              <span
                key={`l1-${idx}`}
                className={
                  idx === 0 ? 'text-treatment-outline' : 'text-treatment-solid'
                }
              >
                {word}
                {idx < line1Words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </span>
        </span>

        <span className="split-line-mask">
          <span className="block">
            {line2Words.map((word, idx) => {
              let treatment = 'text-treatment-solid';
              if (idx === 2) {
                treatment = 'text-treatment-chrome';
              } else if (idx === 1) {
                treatment = 'text-treatment-outline';
              }
              return (
                <span key={`l2-${idx}`} className={treatment}>
                  {word}
                  {idx < line2Words.length - 1 ? ' ' : ''}
                </span>
              );
            })}
          </span>
        </span>
      </h1>
    </div>
  );

  return (
    <Section
      id="home"
      ref={containerRef}
      sectionName="hero"
      pinned
      ariaLabel={siteContent.scene1Orb.line1}
      header={heroHeader}
      bodyClassName="justify-between items-center text-center"
    >
      {/* Dedicated open center stage so the 3D Glass Orb is never overlapped by text */}
      <div className="pointer-events-none flex-1 min-h-0 w-full" aria-hidden="true" />

      {/* Bottom caption + scroll prompt cleanly below the 3D Orb and above HUD safe zone */}
      <div className="relative z-[var(--z-header)] flex flex-col items-center">
        <p
          ref={captionRef}
          className="max-w-[62ch] rounded-[var(--r-20)] border border-[var(--line)] bg-[var(--surface)] px-5 py-2 font-serif-editorial text-lg italic text-[var(--muted)] shadow-[var(--shadow-1)] md:text-xl"
        >
          {siteContent.scene1Orb.serifCaption}
        </p>

        <div
          className={`mt-3 flex flex-col items-center gap-1.5 transition-opacity duration-500 ${
            hasScrolled ? 'opacity-0' : 'opacity-95'
          }`}
        >
          <Pill accent="lime">{siteContent.chrome.scrollPrompt}</Pill>
        </div>
      </div>
    </Section>
  );
}
