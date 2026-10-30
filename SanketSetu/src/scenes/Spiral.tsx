import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { ArrowRight, ArrowUpRight, Layers, List } from 'lucide-react';
import { Section } from '../components/Section';
import { Button, Pill } from '../components/ui';
import { siteContent, ScenarioItem } from '../content';
import {
  getScenarioCardDataUrls,
  getScenarioCardTextures,
} from '../lib/artTextures';
import { soundEngine } from '../lib/audio';
import { gsap, ScrollTrigger, EASINGS } from '../lib/gsap';
import {
  computeSpiralCardTransform,
  dampValue,
  scrollState,
  setDiscreteState,
  ThemeMode,
} from '../lib/scroll';
import {
  setSelectedScenario,
  useScenarioStore,
} from '../lib/scenarioStore';
import { spiralCardFragmentShader, spiralCardVertexShader } from '../lib/shaders';
import { SectionHeader } from '../sections/SectionHeader';

/**
 * SECTION 06 – USE CASES (src/scenes/Spiral.tsx, id="use-cases")
 * -----------------------------------------------------------------------------
 * Converts the 3D Spiral / List gallery into the 8 NOVA Product Scenarios
 * showcase, wired directly into the 07 LIVE DEMO section:
 * - Light 2x DPR scenario cards (pastel mesh gradient + 1px inner border + crisp text),
 *   regenerating automatically in dark mode.
 * - Front-face only (THREE.FrontSide) with front-facing orientation so no
 *   mirrored or upside-down text ever appears.
 * - Screen-space vertical shader mask fades cards to alpha = 0 before touching
 *   the top header/toggle or bottom detail dock.
 * - Pinned (+=300%), scroll scrubs spiral rotation & active scenario index.
 * - Single SPIRAL | LIST toggle docked centered under the section header.
 * - Detail Dock inside safe area with "run in live demo" and "next scenario".
 */

interface SpiralPlaneProps {
  scenario: ScenarioItem;
  index: number;
  total: number;
  texture: THREE.CanvasTexture;
  sharedGeometry: THREE.PlaneGeometry;
  listBlendRef: React.MutableRefObject<{ value: number }>;
  theme: ThemeMode;
}

function SpiralCardPlane({
  scenario,
  index,
  total,
  texture,
  sharedGeometry,
  listBlendRef,
  theme,
}: SpiralPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const hoverTargetRef = useRef(0);
  const selectedTargetRef = useRef(0);

  const fogColorVec = useMemo(
    () => new THREE.Color(theme === 'dark' ? '#0c0d14' : '#F6F4EF'),
    [theme]
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: spiralCardVertexShader,
        fragmentShader: spiralCardFragmentShader,
        uniforms: {
          uTexture: { value: texture },
          uOpacity: { value: 1 },
          uBend: { value: 0.16 },
          uVelocity: { value: 0 },
          uHover: { value: 0 },
          uDim: { value: 0 },
          uSelected: { value: 0 },
          uPlaneSize: { value: new THREE.Vector2(2.15, 1.48) },
          uRadius: { value: 0.14 },
          uFogColor: { value: fogColorVec },
        },
        transparent: true,
        depthWrite: false,
        // Render FRONT FACE ONLY so mirrored or upside-down text never appears
        side: THREE.FrontSide,
      }),
    [texture, fogColorVec]
  );

  useEffect(() => {
    material.uniforms.uTexture.value = texture;
    material.uniforms.uFogColor.value = fogColorVec;
    material.needsUpdate = true;
  }, [material, texture, fogColorVec]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.25);
    const mesh = meshRef.current;
    if (!mesh) return;

    const sceneWeight = scrollState.showcaseSpiralWeight;
    const isSelected = scrollState.selectedProjectId === scenario.id;
    const isAnySelected = scrollState.selectedProjectId !== null;
    const isHovered = scrollState.hoveredProjectId === scenario.id;
    const isAnyHovered = scrollState.hoveredProjectId !== null;

    hoverTargetRef.current = isHovered && sceneWeight > 0.2 ? 1 : 0;
    selectedTargetRef.current = isSelected && sceneWeight > 0.15 ? 1 : 0;

    const listBlend = listBlendRef.current.value;
    const baseTransform = computeSpiralCardTransform(
      index,
      total,
      scrollState.useCasesProgress,
      listBlend
    );

    const sel = dampValue(
      material.uniforms.uSelected.value,
      selectedTargetRef.current,
      7.5,
      dt
    );
    material.uniforms.uSelected.value = sel;

    const hov = dampValue(
      material.uniforms.uHover.value,
      hoverTargetRef.current,
      9.0,
      dt
    );
    material.uniforms.uHover.value = hov;

    const dimTarget =
      (isAnySelected && !isSelected) || (isAnyHovered && !isHovered && !isSelected)
        ? 1
        : 0;
    material.uniforms.uDim.value = dampValue(
      material.uniforms.uDim.value,
      dimTarget,
      8.0,
      dt
    );

    // Selected card eases to front-center (0, -0.10, 1.42) inside the safe middle stage
    const targetX = baseTransform.x * (1 - sel * 0.88);
    const targetY = baseTransform.y * (1 - sel * 0.88) + -0.10 * (sel * 0.88);
    const targetZ = baseTransform.z * (1 - sel) + 1.42 * sel;

    const targetRotY = baseTransform.rotY * (1 - sel);
    const targetRotZ = baseTransform.rotZ * (1 - sel);

    mesh.position.x = dampValue(mesh.position.x, targetX, 7.5, dt);
    mesh.position.y = dampValue(mesh.position.y, targetY, 7.5, dt);
    mesh.position.z = dampValue(mesh.position.z, targetZ, 7.5, dt);

    mesh.rotation.y = dampValue(mesh.rotation.y, targetRotY, 7.5, dt);
    mesh.rotation.z = dampValue(mesh.rotation.z, targetRotZ, 7.5, dt);

    const scaleBoost = 0.78 + hov * 0.07 + sel * 0.18;
    const currentScale = dampValue(
      mesh.scale.x,
      scaleBoost * Math.max(0.001, sceneWeight),
      8.0,
      dt
    );
    mesh.scale.setScalar(currentScale);

    material.uniforms.uBend.value = dampValue(
      material.uniforms.uBend.value,
      baseTransform.bend,
      7.0,
      dt
    );
    material.uniforms.uVelocity.value = scrollState.dampedVelocity;

    // Fade non-selected and back-of-helix cards smoothly
    const listFade = 1 - listBlend * 0.82;
    const activeAlpha = isSelected
      ? 1
      : baseTransform.backAlpha * (isAnySelected ? 0.68 : 0.92);
    material.uniforms.uOpacity.value = sceneWeight * activeAlpha * listFade;

    mesh.visible = sceneWeight > 0.01 && listBlend < 0.96;
  });

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (scrollState.showcaseSpiralWeight < 0.3 || listBlendRef.current.value > 0.5)
      return;
    if (scrollState.hoveredProjectId !== scenario.id) {
      setDiscreteState({ hoveredProjectId: scenario.id });
      soundEngine.playTick(760, 0.025);
    }
  };

  const handlePointerOut = () => {
    if (scrollState.hoveredProjectId === scenario.id) {
      setDiscreteState({ hoveredProjectId: null });
    }
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (scrollState.showcaseSpiralWeight < 0.3 || listBlendRef.current.value > 0.5)
      return;
    setDiscreteState({ selectedProjectId: scenario.id });
    setSelectedScenario(scenario.id);
    scrollState.useCasesProgress = index / Math.max(1, total - 1);
    soundEngine.playTick(920, 0.05);
  };

  return (
    <mesh
      ref={meshRef}
      geometry={sharedGeometry}
      material={material}
      frustumCulled={false}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    />
  );
}

export function SpiralScene3D({
  isMobile,
  viewMode,
  theme = 'light',
}: {
  isMobile: boolean;
  viewMode: 'spiral' | 'list';
  theme?: ThemeMode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const listBlendRef = useRef({ value: 0 });

  const textures = useMemo(() => getScenarioCardTextures(theme), [theme]);
  const sharedGeometry = useMemo(
    () => new THREE.PlaneGeometry(2.15, 1.48, 28, 18),
    []
  );

  useEffect(() => {
    return () => {
      sharedGeometry.dispose();
    };
  }, [sharedGeometry]);

  // Continuously damp showcaseSpiralWeight toward 1 whenever #use-cases is active
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.25);
    const targetWeight = scrollState.activeSectionId === 'use-cases' ? 1 : 0;
    scrollState.showcaseSpiralWeight = dampValue(
      scrollState.showcaseSpiralWeight,
      targetWeight,
      7.5,
      dt
    );
  });

  // Tween spiral <-> list transition with GSAP expo.inOut
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to(listBlendRef.current, {
        value: viewMode === 'list' ? 1 : 0,
        duration: 0.95,
        ease: EASINGS.inOut,
      });
    });
    return () => ctx.revert();
  }, [viewMode]);

  // Mobile (< 768px): 6 cards; Desktop: all 8 scenarios
  const visibleScenarios = useMemo(() => {
    const all = siteContent.useCasesSection.scenarios;
    return isMobile ? all.slice(0, 6) : all;
  }, [isMobile]);

  return (
    <group ref={groupRef}>
      {visibleScenarios.map((scenario, idx) => (
        <SpiralCardPlane
          key={scenario.id}
          scenario={scenario}
          index={idx}
          total={visibleScenarios.length}
          texture={textures[idx % textures.length]}
          sharedGeometry={sharedGeometry}
          listBlendRef={listBlendRef}
          theme={theme}
        />
      ))}
    </group>
  );
}

/**
 * 06 — USE CASES DOM Overlay (Spiral / List Toggle, List Rows with Cursor Thumbnail,
 * and Bottom Detail Dock wired to Live Demo)
 */
export function SpiralDOMOverlay({
  selectedProjectId,
  hoveredProjectId,
  viewMode = 'spiral',
  theme = 'light',
  reducedMotion = false,
  isMobile = false,
  onToggleViewMode,
  onRunInLiveDemo,
}: {
  activeScene?: number;
  selectedProjectId: string | null;
  hoveredProjectId: string | null;
  isArchiveOpen?: boolean;
  viewMode?: 'spiral' | 'list';
  theme?: ThemeMode;
  reducedMotion?: boolean;
  isMobile?: boolean;
  onToggleViewMode?: (mode: 'spiral' | 'list') => void;
  onCloseArchive?: () => void;
  onRunInLiveDemo?: (scenario: ScenarioItem) => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const listRowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const thumbRef = useRef<HTMLDivElement>(null);

  const { selectedScenarioId } = useScenarioStore();
  const scenarios = useMemo(() => {
    const all = siteContent.useCasesSection.scenarios;
    return isMobile ? all.slice(0, 6) : all;
  }, [isMobile]);

  const cardDataUrls = useMemo(() => getScenarioCardDataUrls(theme), [theme]);
  const [hoveredRowIdx, setHoveredRowIdx] = useState<number | null>(null);

  // Keep scrollState.selectedProjectId and scenarioStore in sync
  const effectiveScenarioId =
    selectedProjectId ?? selectedScenarioId ?? scenarios[0].id;

  const activeScenario = useMemo(
    () =>
      scenarios.find((s) => s.id === effectiveScenarioId) ??
      scenarios.find((s) => s.id === hoveredProjectId) ??
      scenarios[0],
    [scenarios, effectiveScenarioId, hoveredProjectId]
  );

  const selectScenarioByIndex = (idx: number) => {
    const wrapped = ((idx % scenarios.length) + scenarios.length) % scenarios.length;
    const target = scenarios[wrapped];
    if (!target) return;
    setDiscreteState({ selectedProjectId: target.id });
    setSelectedScenario(target.id);
    scrollState.useCasesProgress =
      wrapped / Math.max(1, scenarios.length - 1);
    soundEngine.playTick(780, 0.03);
  };

  // Pin #use-cases (+=300% on desktop) and scrub spiral rotation & active scenario
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: isMobile ? 'top 60%' : 'top top',
        end: isMobile ? 'bottom 40%' : '+=300%',
        pin: !isMobile && !reducedMotion,
        scrub: 1,
        onUpdate: (self) => {
          scrollState.useCasesProgress = self.progress;
          const idx = Math.min(
            scenarios.length - 1,
            Math.max(0, Math.round(self.progress * (scenarios.length - 1)))
          );
          const current = scenarios[idx];
          if (current && scrollState.selectedProjectId !== current.id) {
            setDiscreteState({ selectedProjectId: current.id });
            setSelectedScenario(current.id);
          }
        },
      });
    }, el);

    return () => ctx.revert();
  }, [isMobile, reducedMotion, scenarios]);

  // Animate LIST view rows stagger when switching to list mode
  useEffect(() => {
    if (viewMode !== 'list' || reducedMotion) return;
    const rows = listRowRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (rows.length === 0) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        rows,
        { y: 18, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.55,
          stagger: 0.045,
          ease: 'power3.out',
        }
      );
    });
    return () => ctx.revert();
  }, [viewMode, reducedMotion]);

  // Keyboard ArrowLeft / ArrowRight navigation while Use Cases is active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (scrollState.activeSectionId !== 'use-cases') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const currentIdx = Math.max(
        0,
        scenarios.findIndex((s) => s.id === activeScenario.id)
      );
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        selectScenarioByIndex(currentIdx + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        selectScenarioByIndex(currentIdx - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scenarios, activeScenario.id]);

  // Subtle detail dock transition when activeScenario changes
  useEffect(() => {
    if (!detailRef.current || reducedMotion) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        detailRef.current,
        { opacity: 0.75, y: 6 },
        { opacity: 1, y: 0, duration: 0.32, ease: 'power3.out' }
      );
    }, detailRef);
    return () => ctx.revert();
  }, [activeScenario.id, reducedMotion]);

  const handleListMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!thumbRef.current) return;
    gsap.to(thumbRef.current, {
      x: e.clientX + 20,
      y: e.clientY - 64,
      duration: 0.22,
      ease: EASINGS.expoOut,
      overwrite: 'auto',
    });
  };

  const data = siteContent.useCasesSection;

  const useCasesHeader = (
    <div className="flex flex-col items-center">
      <SectionHeader
        compact
        indexLabel={data.indexLabel}
        headlineLead={data.headline}
        chromeWord=""
        outlineWord={data.headlineOutlineWord}
        headlineTail={data.headlineTail}
        serifSubline={data.serifSubline}
        reducedMotion={reducedMotion}
      />

      {/* Single SPIRAL | LIST Toggle Docked Centered Under the Header Block */}
      {onToggleViewMode && (
        <div
          role="group"
          aria-label="Use cases view mode"
          className="mt-1 inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)] p-1 shadow-[var(--shadow-1)]"
        >
          <button
            type="button"
            onClick={() => {
              soundEngine.playTick(720, 0.03);
              onToggleViewMode('spiral');
            }}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--r-pill)] px-4 py-1.5 type-mono-label transition-all ${
              viewMode === 'spiral'
                ? 'border border-[#0B0B0B] bg-[var(--accent)] text-[#0B0B0B]'
                : 'text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
          >
            <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{siteContent.chrome.viewToggleSpiral}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playTick(780, 0.03);
              onToggleViewMode('list');
            }}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--r-pill)] px-4 py-1.5 type-mono-label transition-all ${
              viewMode === 'list'
                ? 'border border-[#0B0B0B] bg-[var(--accent)] text-[#0B0B0B]'
                : 'text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
          >
            <List className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{siteContent.chrome.viewToggleList}</span>
          </button>
        </div>
      )}
    </div>
  );

  const currentIdx = Math.max(
    0,
    scenarios.findIndex((s) => s.id === activeScenario.id)
  );

  return (
    <Section
      id="use-cases"
      ref={sectionRef}
      sectionName="use-cases"
      pinned={!isMobile && !reducedMotion}
      ariaLabel={data.indexLabel}
      className="border-t border-[var(--line)]"
      header={useCasesHeader}
      bodyClassName="justify-between items-center"
    >
      {/* MIDDLE STAGE: Open 3D Spiral Stage OR Solid Interactive List View */}
      {viewMode === 'list' ? (
        <div
          onMouseMove={handleListMouseMove}
          onMouseLeave={() => setHoveredRowIdx(null)}
          className="relative z-[var(--z-header)] my-auto w-full max-w-4xl max-h-[38svh] overflow-y-auto rounded-[var(--r-20)] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-2)]"
        >
          <div className="divide-y divide-[var(--line)]">
            {scenarios.map((scenario, idx) => {
              const isSelected = activeScenario.id === scenario.id;
              return (
                <button
                  key={scenario.id}
                  ref={(el) => {
                    listRowRefs.current[idx] = el;
                  }}
                  type="button"
                  onMouseEnter={() => setHoveredRowIdx(idx)}
                  onClick={() => selectScenarioByIndex(idx)}
                  className={`flex min-h-[64px] w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors rounded-[var(--r-14)] ${
                    isSelected
                      ? 'bg-[var(--surface-2)]'
                      : 'hover:bg-[var(--surface-2)]/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                        isSelected
                          ? 'border border-[#0B0B0B] bg-[var(--accent)] text-[#0B0B0B]'
                          : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]'
                      }`}
                    >
                      {scenario.index}
                    </span>
                    <span className="truncate font-grotesk text-base font-semibold text-[var(--fg)] lowercase md:text-lg">
                      {scenario.title}
                    </span>
                    <Pill accent={scenario.accent} className="hidden sm:inline-flex">
                      {scenario.domain}
                    </Pill>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="block font-mono text-[10px] uppercase text-[var(--muted)]">
                        {scenario.metricLabel}
                      </span>
                      <span className="font-grotesk text-sm font-bold text-[var(--fg)]">
                        {scenario.metricValue}
                      </span>
                    </div>
                    <ArrowUpRight
                      className="h-[18px] w-[18px] text-[var(--fg)]"
                      strokeWidth={1.75}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Cursor-Following Floating Card Texture Thumbnail on List Row Hover */}
          {hoveredRowIdx !== null && cardDataUrls[hoveredRowIdx] ? (
            <div
              ref={thumbRef}
              aria-hidden="true"
              className="pointer-events-none fixed top-0 left-0 z-[var(--z-modal)] hidden h-28 w-40 overflow-hidden rounded-[var(--r-14)] border-2 border-[#0B0B0B] bg-[var(--surface)] shadow-[var(--shadow-3)] md:block"
            >
              <img
                src={cardDataUrls[hoveredRowIdx]}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className="pointer-events-none flex-1 min-h-0 w-full"
          aria-hidden="true"
        />
      )}

      {/* DETAIL DOCK: Solid panel docked inside the safe area at the bottom */}
      <div
        ref={detailRef}
        style={{
          width: 'min(960px, calc(100% - 2 * var(--gutter)))',
          maxHeight: 'min(24svh, 210px)',
        }}
        className="relative z-[var(--z-header)] mx-auto flex flex-col justify-between gap-2.5 rounded-[var(--r-20)] border border-[var(--line)] bg-[var(--surface)] px-5 py-3.5 shadow-[var(--shadow-2)]"
      >
        {/* Top Row inside Dock: Index Chips (01..08) + Domain & Metric Pill */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Scenario index selector"
            className="flex flex-wrap items-center gap-1"
          >
            {scenarios.map((scen, idx) => {
              const isActive = activeScenario.id === scen.id;
              return (
                <button
                  key={scen.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => selectScenarioByIndex(idx)}
                  className={`cursor-pointer rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-2)] ${
                    isActive
                      ? 'border border-[#0B0B0B] bg-[var(--accent)] text-[#0B0B0B]'
                      : 'text-[var(--muted)] hover:text-[var(--fg)]'
                  }`}
                >
                  {scen.index}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Pill accent={activeScenario.accent}>{activeScenario.domain}</Pill>
            <Pill accent="lime">
              {activeScenario.metricLabel}: {activeScenario.metricValue}
            </Pill>
          </div>
        </div>

        {/* Bottom Row inside Dock: Scenario Title + Clamped Summary + Two Action Buttons */}
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-[var(--muted)]">
                {activeScenario.index}
              </span>
              <h3 className="truncate font-grotesk text-lg font-bold text-[var(--fg)] lowercase md:text-xl">
                {activeScenario.title}
              </h3>
            </div>
            <p className="mt-0.5 line-clamp-1 font-grotesk text-xs text-[var(--muted)] md:text-sm">
              {activeScenario.summary}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => selectScenarioByIndex(currentIdx + 1)}
            >
              <span>{data.nextScenarioLabel}</span>
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Button>

            <Button
              variant="accent"
              size="sm"
              magnetic
              onClick={() => {
                soundEngine.playTick(880, 0.045);
                setSelectedScenario(activeScenario.id, { triggerAutoRun: true });
                scrollState.demoStatus = 'running';
                onRunInLiveDemo?.(activeScenario);
              }}
            >
              <span>{data.runInDemoLabel}</span>
              <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
