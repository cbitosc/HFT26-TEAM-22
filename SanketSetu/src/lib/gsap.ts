import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { Flip } from 'gsap/Flip';
import { Draggable } from 'gsap/Draggable';

gsap.registerPlugin(ScrollTrigger, SplitText, Flip, Draggable);

// Strict easing discipline: expo.out, power3.inOut, back.out(1.4), elastic.out(1, 0.5)
export const EASINGS = {
  expoOut: 'expo.out',
  inOut: 'power3.inOut',
  backOut: 'back.out(1.4)',
  elasticReturn: 'elastic.out(1, 0.5)',
} as const;

/**
 * Binds cursor-proximity variable font axes ('wght' + 'wdth') via gsap.quickTo
 * and per-letter hover jump with elastic.out(1, 0.5) return on SplitText chars.
 */
export function bindVariableProximityChars(
  chars: Element[],
  reducedMotion: boolean
): () => void {
  const htmlChars = chars.filter((c): c is HTMLElement => c instanceof HTMLElement);
  if (reducedMotion || htmlChars.length === 0 || typeof window === 'undefined') {
    return () => {};
  }

  interface CharController {
    el: HTMLElement;
    proxy: { wght: number; wdth: number };
    quickWght: gsap.QuickToFunc;
    quickWdth: gsap.QuickToFunc;
    lastJumpAt: number;
    wasInside: boolean;
    onEnter: () => void;
  }

  const BASE_WGHT = 510;
  const MAX_WGHT = 800;
  const BASE_WDTH = 86;
  const MAX_WDTH = 100;
  const PROXIMITY_RADIUS = 210;

  const triggerJump = (ctrl: CharController) => {
    const now = performance.now();
    if (now - ctrl.lastJumpAt < 380) return;
    ctrl.lastJumpAt = now;

    gsap.killTweensOf(ctrl.el, 'y');
    gsap.to(ctrl.el, {
      y: -14,
      duration: 0.12,
      ease: EASINGS.expoOut,
      onComplete: () => {
        gsap.to(ctrl.el, {
          y: 0,
          duration: 0.82,
          ease: EASINGS.elasticReturn,
        });
      },
    });
  };

  const controllers: CharController[] = htmlChars.map((el) => {
    const proxy = { wght: BASE_WGHT, wdth: BASE_WDTH };
    el.style.fontVariationSettings = `'wght' ${BASE_WGHT}, 'wdth' ${BASE_WDTH}`;

    const syncVariation = () => {
      el.style.fontVariationSettings = `'wght' ${Math.round(
        proxy.wght
      )}, 'wdth' ${proxy.wdth.toFixed(1)}`;
    };

    const quickWght = gsap.quickTo(proxy, 'wght', {
      duration: 0.26,
      ease: EASINGS.expoOut,
      onUpdate: syncVariation,
    });

    const quickWdth = gsap.quickTo(proxy, 'wdth', {
      duration: 0.26,
      ease: EASINGS.expoOut,
    });

    const ctrl: CharController = {
      el,
      proxy,
      quickWght,
      quickWdth,
      lastJumpAt: 0,
      wasInside: false,
      onEnter: () => {},
    };

    ctrl.onEnter = () => triggerJump(ctrl);
    el.addEventListener('mouseenter', ctrl.onEnter);

    return ctrl;
  });

  const onMouseMove = (e: MouseEvent) => {
    const mx = e.clientX;
    const my = e.clientY;

    for (let i = 0; i < controllers.length; i++) {
      const ctrl = controllers[i];
      const rect = ctrl.el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      // Skip off-screen characters for performance
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const dist = Math.hypot(mx - cx, my - cy);

      if (dist < PROXIMITY_RADIUS) {
        const t = Math.pow(1 - dist / PROXIMITY_RADIUS, 1.45);
        ctrl.quickWght(BASE_WGHT + t * (MAX_WGHT - BASE_WGHT));
        ctrl.quickWdth(BASE_WDTH + t * (MAX_WDTH - BASE_WDTH));
      } else {
        ctrl.quickWght(BASE_WGHT);
        ctrl.quickWdth(BASE_WDTH);
      }

      const insideChar =
        mx >= rect.left &&
        mx <= rect.right &&
        my >= rect.top &&
        my >= rect.bottom;
      if (insideChar && !ctrl.wasInside) {
        triggerJump(ctrl);
      }
      ctrl.wasInside = insideChar;
    }
  };

  window.addEventListener('mousemove', onMouseMove, { passive: true });

  return () => {
    window.removeEventListener('mousemove', onMouseMove);
    for (const ctrl of controllers) {
      ctrl.el.removeEventListener('mouseenter', ctrl.onEnter);
      gsap.killTweensOf(ctrl.el);
      gsap.killTweensOf(ctrl.proxy);
    }
  };
}

export { gsap, ScrollTrigger, SplitText, Flip, Draggable };
