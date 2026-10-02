"use client";

import * as React from "react";

/** True when the OS or the learner's "Reduce motion" setting asks for minimal animation. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return document.documentElement.classList.contains("reduce-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeToMotionPreference(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** Reactive version of `prefersReducedMotion` for components (reduced on the server). */
export function useReducedMotion(): boolean {
  return React.useSyncExternalStore(subscribeToMotionPreference, prefersReducedMotion, () => true);
}

/** Fluent accent and status colours. */
const DEFAULT_COLORS = ["#0078D4", "#60CDFF", "#8764B8", "#00B7C3", "#FFB900", "#E74856", "#16C60C"];

export type CelebrateOptions = {
  /** Number of particles (default 120, max 400). */
  particleCount?: number;
  /** Burst origin as fractions of the viewport (default: centre, 35% from the top). */
  origin?: { x: number; y: number };
  /** Half-angle of the burst cone in degrees (default 70). */
  spread?: number;
  colors?: string[];
};

type Particle = { x: number; y: number; vx: number; vy: number; size: number; color: string; rotation: number; spin: number; round: boolean };

/**
 * Fires a short confetti burst on a transient full-viewport canvas. Purely decorative: the canvas is hidden from
 * assistive technology, never intercepts input, and nothing happens when reduced motion is requested. Always pair it
 * with a text announcement of the achievement itself.
 */
export function celebrate(options: CelebrateOptions = {}): void {
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:100";
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext("2d");
  if (!context) return;
  document.body.appendChild(canvas);
  context.scale(ratio, ratio);

  const count = Math.max(1, Math.min(options.particleCount ?? 120, 400));
  const originX = (options.origin?.x ?? 0.5) * width;
  const originY = (options.origin?.y ?? 0.35) * height;
  const spread = ((options.spread ?? 70) * Math.PI) / 180;
  const colors = options.colors?.length ? options.colors : DEFAULT_COLORS;
  const particles: Particle[] = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2 * spread;
    const speed = 7 + Math.random() * 9;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)] ?? DEFAULT_COLORS[0],
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      round: Math.random() < 0.35,
    };
  });

  const duration = 2400;
  const start = performance.now();
  const frame = (now: number) => {
    const elapsed = now - start;
    const alpha = Math.max(0, 1 - elapsed / duration);
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      particle.vx *= 0.985;
      particle.vy = particle.vy * 0.985 + 0.32;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.rotation += particle.spin;
      context.save();
      context.globalAlpha = alpha;
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillStyle = particle.color;
      if (particle.round) {
        context.beginPath();
        context.arc(0, 0, particle.size / 3, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      }
      context.restore();
    }
    if (elapsed < duration) window.requestAnimationFrame(frame);
    else canvas.remove();
  };
  window.requestAnimationFrame(frame);
}

/** Fires `celebrate` once each time `when` turns true (for example when a lab becomes completed). */
export function Celebration({ when, particleCount, originX, originY }: { when: boolean; particleCount?: number; originX?: number; originY?: number }) {
  const fired = React.useRef(false);
  React.useEffect(() => {
    if (!when) {
      fired.current = false;
      return;
    }
    if (fired.current) return;
    fired.current = true;
    celebrate({ particleCount, origin: originX !== undefined && originY !== undefined ? { x: originX, y: originY } : undefined });
  }, [when, particleCount, originX, originY]);
  return null;
}
