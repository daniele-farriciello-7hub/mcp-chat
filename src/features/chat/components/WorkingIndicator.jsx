/**
 * What shows while the assistant works: a small swarm of particles that follows the pointer and
 * bursts on click, next to one honest line. It never says what the assistant is doing — a step
 * label would promise work that sometimes ends at once — only the two states that are always true:
 * "Sto pensando…" until the reply starts, "Scrivo la risposta…" while it streams.
 */
'use client';

import { useEffect, useRef } from 'react';

const WIDTH = 120;
const HEIGHT = 40;
const COUNT = 22;

const newParticle = () => ({
  angle: Math.random() * Math.PI * 2,
  radius: 6 + Math.random() * 15,
  speed: 0.015 + Math.random() * 0.03,
  size: 1 + Math.random() * 1.6,
  x: WIDTH / 2,
  y: HEIGHT / 2,
  vx: 0,
  vy: 0
});

function ParticleSwarm({ fast }) {
  const canvasRef = useRef(null);
  const fastRef = useRef(fast);
  const pointer = useRef(null);
  const burstRequested = useRef(false);

  useEffect(() => {
    fastRef.current = fast;
  }, [fast]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = WIDTH * ratio;
    canvas.height = HEIGHT * ratio;
    ctx.scale(ratio, ratio);
    const color = getComputedStyle(canvas).color;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const particles = Array.from({ length: COUNT }, newParticle);

    let frame;
    const draw = () => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      const cx = pointer.current?.x ?? WIDTH / 2;
      const cy = pointer.current?.y ?? HEIGHT / 2;
      const burst = burstRequested.current;
      burstRequested.current = false;
      for (const p of particles) {
        if (burst) {
          // a click flings every particle outward; the spring below pulls them back in
          const angle = Math.random() * Math.PI * 2;
          p.vx = Math.cos(angle) * 5;
          p.vy = Math.sin(angle) * 5;
        }
        if (!reduceMotion) p.angle += p.speed * (fastRef.current ? 2.2 : 1);
        const targetX = cx + Math.cos(p.angle) * p.radius * 2;
        const targetY = cy + Math.sin(p.angle * 1.3) * p.radius * 0.95;
        // a spring toward the orbit point: pointer moves and bursts decay smoothly instead of snapping
        p.vx = (p.vx + (targetX - p.x) * 0.06) * 0.82;
        p.vy = (p.vy + (targetY - p.y) * 0.06) * 0.82;
        p.x += p.vx;
        p.y += p.vy;
        ctx.globalAlpha = 0.35 + p.size * 0.12;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);

  const track = event => {
    const box = event.currentTarget.getBoundingClientRect();
    pointer.current = { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  return (
    <canvas
      ref={canvasRef}
      style={{ width: WIDTH, height: HEIGHT }}
      className="shrink-0 cursor-crosshair text-brand-500"
      onPointerMove={track}
      onPointerLeave={() => (pointer.current = null)}
      onClick={() => (burstRequested.current = true)}
      aria-hidden="true"
    />
  );
}

export default function WorkingIndicator({ status }) {
  const writing = status === 'writing';
  return (
    <div className="flex items-center gap-1" style={{ animation: 'var(--animate-fade-in)' }} role="status">
      <ParticleSwarm fast={writing} />
      <span
        key={writing ? 'writing' : 'thinking'}
        className="shimmer-text text-[13px] font-medium"
        style={{ animation: 'var(--animate-fade-in)' }}
      >
        {writing ? 'Scrivo la risposta…' : 'Sto pensando…'}
      </span>
    </div>
  );
}
