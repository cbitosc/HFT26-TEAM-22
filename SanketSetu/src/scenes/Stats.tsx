import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { siteContent } from '../content';
import { Marquee } from '../components/Marquee';
import { gsap, EASINGS } from '../lib/gsap';
import {
  dampValue,
  getSceneWeights,
  readCssThemePalette,
  scrollState,
  ThemeMode,
} from '../lib/scroll';

/**
 * SCENE 4 – Stats & Orbiting Glossy 3D Shapes (src/scenes/Stats.tsx)
 * -----------------------------------------------------------------------------
 * Camera pulls back. Four giant numbers count up as floating text in front of
 * slowly orbiting small glossy shapes. A marquee of tech keywords runs across
 * the bottom as flat text that reverses direction with scroll direction.
 */
export function StatsScene3D({ theme }: { theme: ThemeMode }) {
  const groupRef = useRef<THREE.Group>(null);
  const shapeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const palette = useMemo(() => readCssThemePalette(), [theme]);

  const shapesConfig = useMemo(
    () => [
      { pos: [-2.8, 1.15, -0.5], color: palette.green, speed: 0.85, type: 'torus' },
      { pos: [2.9, 1.0, -0.8], color: palette.coral, speed: -0.7, type: 'octa' },
      { pos: [-2.4, -1.05, -0.3], color: palette.lilac, speed: 0.65, type: 'icosa' },
      { pos: [2.5, -1.1, -0.6], color: palette.blue, speed: -0.9, type: 'capsule' },
    ],
    [palette]
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.25);
    const group = groupRef.current;
    if (!group) return;

    const targetW =
      scrollState.activeSectionId === 'technology' &&
      scrollState.showcaseSpiralWeight < 0.12
        ? 0.85
        : 0;
    const currentW = dampValue(group.scale.x, targetW, 6.5, dt);
    group.visible = currentW > 0.01;
    if (currentW <= 0.01) return;

    const t = state.clock.elapsedTime;
    group.scale.setScalar(Math.max(0.001, currentW));

    shapeRefs.current.forEach((mesh, idx) => {
      if (!mesh) return;
      const cfg = shapesConfig[idx];
      const orbitAngle = t * cfg.speed * 0.45 + idx * 1.5;
      mesh.position.x = cfg.pos[0] + Math.cos(orbitAngle) * 0.45;
      mesh.position.y = cfg.pos[1] + Math.sin(orbitAngle * 1.3) * 0.32;
      mesh.rotation.x = t * 0.6 * cfg.speed;
      mesh.rotation.y = t * 0.8 * cfg.speed;
    });
  });

  return (
    <group ref={groupRef}>
      {shapesConfig.map((cfg, idx) => (
        <mesh
          key={idx}
          ref={(el) => {
            shapeRefs.current[idx] = el;
          }}
          position={cfg.pos as [number, number, number]}
        >
          {cfg.type === 'torus' && <torusGeometry args={[0.42, 0.16, 24, 48]} />}
          {cfg.type === 'octa' && <octahedronGeometry args={[0.52, 0]} />}
          {cfg.type === 'icosa' && <icosahedronGeometry args={[0.5, 0]} />}
          {cfg.type === 'capsule' && <capsuleGeometry args={[0.26, 0.45, 16, 24]} />}
          <meshPhysicalMaterial
            color={cfg.color}
            roughness={0.1}
            metalness={0.25}
            clearcoat={1}
            clearcoatRoughness={0.08}
          />
        </mesh>
      ))}
    </group>
  );
}

export function StatsDOMOverlay({
  activeScene,
  reducedMotion,
}: {
  activeScene: number;
  reducedMotion: boolean;
}) {
  const isVisible = activeScene === 4;
  const [counts, setCounts] = useState<number[]>(() =>
    siteContent.scene4Stats.items.map((item) => (reducedMotion ? item.value : 0))
  );
  const animatedRef = useRef(false);

  useEffect(() => {
    if (!isVisible) return;
    if (reducedMotion) {
      setCounts(siteContent.scene4Stats.items.map((i) => i.value));
      return;
    }
    if (animatedRef.current) return;
    animatedRef.current = true;

    const proxies = siteContent.scene4Stats.items.map(() => ({ val: 0 }));
    const ctx = gsap.context(() => {
      proxies.forEach((proxy, idx) => {
        const target = siteContent.scene4Stats.items[idx].value;
        gsap.to(proxy, {
          val: target,
          duration: 1.5,
          delay: idx * 0.1,
          ease: EASINGS.expoOut,
          onUpdate: () => {
            setCounts((prev) => {
              const next = [...prev];
              next[idx] = Math.round(proxy.val);
              return next;
            });
          },
        });
      });
    });

    return () => ctx.revert();
  }, [isVisible, reducedMotion]);

  return (
    <section
      aria-label={siteContent.scene4Stats.sectionKicker}
      className={`pointer-events-none fixed inset-0 z-10 flex flex-col justify-between pt-24 pb-10 transition-opacity duration-500 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="text-center">
        <span className="font-grotesk text-xs tracking-widest text-[var(--muted)] lowercase">
          {siteContent.scene4Stats.sectionKicker}
        </span>
      </div>

      {/* 4 Giant Floating Count-Up Numbers with Solid/Outline/Chrome Treatments & Lime Pill Suffix */}
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-8 px-6 text-center md:grid-cols-4 md:gap-6">
        {siteContent.scene4Stats.items.map((stat, idx) => {
          const numTreatment =
            idx === 1
              ? 'text-treatment-outline'
              : idx === 2
              ? 'text-treatment-chrome'
              : 'text-treatment-solid';
          return (
            <div key={stat.label} className="flex flex-col items-center">
              <div className="font-grotesk text-stat-giant flex items-start justify-center font-semibold text-[var(--fg)] lowercase">
                <span className={numTreatment}>{counts[idx]}</span>
                <span className="mt-2 ml-1.5 inline-flex items-center rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold tracking-normal text-[#0B0B0B] md:text-sm">
                  {stat.suffix}
                </span>
              </div>
              <p className="mt-2 font-grotesk text-sm font-medium text-[var(--fg)] lowercase md:text-base">
                {stat.label}
              </p>
              <p className="mt-0.5 font-serif-editorial text-base italic text-[var(--muted)] md:text-lg">
                {stat.sublabel}
              </p>
            </div>
          );
        })}
      </div>

      {/* Bottom Velocity-Reversing Marquee */}
      <div className="w-full">
        <Marquee reducedMotion={reducedMotion} />
      </div>
    </section>
  );
}
