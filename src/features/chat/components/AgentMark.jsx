/**
 * The assistant's mark: an abstract face that morphs. Three shared rectangles plus an accent node
 * move between configurations — the face (eye, node, mouth) and shapes that say what it is doing
 * (list, gallery, voice, note, tools). Pure CSS animation (SVG2 geometry properties); where
 * unsupported the shape snaps and stays correct.
 */
'use client';

import { useEffect, useRef, useState } from 'react';

const HIDDEN = { x: 50, y: 50, w: 0, h: 0, rx: 0 };

const SHAPES = {
  list: {
    r1: { x: 18, y: 26, w: 44, h: 14, rx: 7 },
    r2: { x: 18, y: 48, w: 64, h: 14, rx: 7 },
    r3: { x: 18, y: 70, w: 48, h: 14, rx: 7 },
    accent: { x: 66, y: 21, w: 24, h: 24, rx: 12 }
  },
  gallery: {
    r1: { x: 22, y: 22, w: 24, h: 38, rx: 8 },
    r2: { x: 54, y: 54, w: 24, h: 24, rx: 8 },
    r3: { x: 22, y: 68, w: 24, h: 10, rx: 5 },
    accent: { x: 54, y: 22, w: 24, h: 24, rx: 12 }
  },
  voice: {
    r1: { x: 17, y: 40, w: 14, h: 20, rx: 7 },
    r2: { x: 77, y: 35, w: 14, h: 30, rx: 7 },
    r3: { x: 37, y: 27, w: 14, h: 46, rx: 7 },
    accent: { x: 57, y: 15, w: 14, h: 70, rx: 7 }
  },
  note: {
    r1: HIDDEN,
    r2: HIDDEN,
    r3: { x: 16, y: 53, w: 24, h: 24, rx: 12 },
    accent: { x: 64, y: 47, w: 24, h: 24, rx: 12 }
  },
  tools: {
    r1: HIDDEN,
    r2: HIDDEN,
    r3: { x: 53, y: 53, w: 24, h: 24, rx: 12 },
    accent: { x: 23, y: 23, w: 24, h: 24, rx: 12 }
  },
  'face-default': {
    r1: HIDDEN,
    r2: HIDDEN,
    r3: { x: 22, y: 30, w: 24, h: 24, rx: 8 },
    accent: { x: 54, y: 30, w: 0, h: 0, rx: 12 },
    sparkle: true
  },
  'face-serious': {
    r1: HIDDEN,
    r2: HIDDEN,
    r3: { x: 22, y: 30, w: 24, h: 24, rx: 8 },
    accent: { x: 54, y: 30, w: 24, h: 24, rx: 12 }
  },
  'face-wink': {
    r1: HIDDEN,
    r2: HIDDEN,
    r3: { x: 22, y: 40, w: 24, h: 0, rx: 8 },
    accent: { x: 54, y: 30, w: 24, h: 24, rx: 12 }
  },
  'face-sparkle': {
    r1: HIDDEN,
    r2: HIDDEN,
    r3: { x: 22, y: 30, w: 24, h: 24, rx: 8 },
    accent: { x: 54, y: 30, w: 24, h: 24, rx: 12 }
  }
};

const FACES = ['face-default', 'face-serious', 'face-wink', 'face-sparkle'];
const ACTIVITY_SHAPES = ['list', 'gallery', 'voice', 'note', 'tools'];
// while working it cycles through everything without pauses: visibly busy
const WORKING_CYCLE = [
  'face-default',
  'list',
  'gallery',
  'voice',
  'face-serious',
  'note',
  'tools',
  'face-sparkle'
];

const pickRandom = list => list[Math.floor(Math.random() * list.length)];

function MorphRect({ shape, color, delay, visible }) {
  const show = visible ?? shape.w > 0;
  return (
    <rect
      className="morph-shape"
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      rx={shape.rx}
      fill={color}
      opacity={show ? 1 : 0}
      style={{ transitionDelay: `${delay}ms` }}
    />
  );
}

function MorphStroke({ d, color, width, visible, delay = 0, filled = false, scaleIn = false }) {
  return (
    <path
      className="morph-stroke"
      d={d}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={filled ? color : 'none'}
      opacity={visible ? 1 : 0}
      style={{
        transitionDelay: `${delay}ms`,
        transform: scaleIn && !visible ? 'scale(0.2)' : 'scale(1)'
      }}
    />
  );
}

/** The animated face. `working` runs the fast cycle; otherwise it rests and looks around now and then. */
export function AgentFace({ size = 27, working = false, monochrome = null, cycleMs = 620, className = '' }) {
  const [state, setState] = useState('face-default');
  const timers = useRef([]);

  useEffect(() => {
    if (!working) return undefined;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setState(WORKING_CYCLE[i % WORKING_CYCLE.length]);
    }, cycleMs);
    return () => window.clearInterval(id);
  }, [working, cycleMs]);

  useEffect(() => {
    if (working) return undefined;
    let alive = true;
    const wait = ms =>
      new Promise(resolve => {
        timers.current.push(window.setTimeout(resolve, ms));
      });

    const idleChoreography = async () => {
      await wait(5000);
      while (alive) {
        for (let i = 0; i < 3; i += 1) {
          if (!alive) return;
          setState(pickRandom(ACTIVITY_SHAPES));
          await wait(700);
        }
        if (!alive) return;
        setState(pickRandom(FACES));
        await wait(15000);
      }
    };
    void idleChoreography();

    const pendingTimers = timers.current;
    return () => {
      alive = false;
      pendingTimers.forEach(id => window.clearTimeout(id));
      pendingTimers.length = 0;
    };
  }, [working]);

  const shape = SHAPES[state];
  // two colours only: the product blue and the logo orange
  const ink = monochrome ?? 'var(--color-brand-600)';
  const tint = monochrome ?? 'var(--color-brand-400)';
  const accent = monochrome ?? 'var(--color-accent)';

  const isFace = state.startsWith('face');
  const smiling = isFace && state !== 'face-serious';
  const winking = state === 'face-wink';

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {/* music note */}
      <MorphStroke
        d="M 34 62 L 34 32 C 34 22 41 19 54 16 L 68 12 C 77 10 82 16 82 26 L 82 56"
        color={ink}
        width={12.6}
        visible={state === 'note'}
        delay={60}
      />
      {/* tool bars */}
      <MorphStroke d="M 20 35 L 80 35" color={ink} width={14} visible={state === 'tools'} delay={60} />
      <MorphStroke d="M 20 65 L 80 65" color={ink} width={14} visible={state === 'tools'} delay={110} />
      {/* mouth: smile or straight line */}
      <MorphStroke d="M 29 76 Q 50 80 71 76" color={ink} width={14} visible={smiling} delay={60} />
      <MorphStroke d="M 33 76 L 67 76" color={ink} width={14} visible={state === 'face-serious'} delay={60} />
      {/* wink, in place of the closed eye */}
      <MorphStroke d="M 22 42 Q 34 32 46 42" color={tint} width={10} visible={winking} delay={60} />
      {/* sparkle, in place of the node */}
      <MorphStroke
        d="M 66 24 C 66 35, 55 42, 48 42 C 55 42, 66 49, 66 60 C 66 49, 77 42, 84 42 C 77 42, 66 35, 66 24 Z"
        color={accent}
        width={3.5}
        visible={Boolean(shape.sparkle)}
        delay={120}
        filled
        scaleIn
      />
      {/* shared geometry */}
      <MorphRect shape={shape.r1} color={ink} delay={0} />
      <MorphRect shape={shape.r2} color={ink} delay={50} />
      <MorphRect shape={shape.r3} color={tint} delay={100} visible={shape.r3.w > 0 && !winking} />
      <MorphRect shape={shape.accent} color={accent} delay={150} />
    </svg>
  );
}

/**
 * The mark on its tile. `filled`: the blue→violet gradient tile with a white mark, same as the
 * floating button that opens the chat. Otherwise a white tile with the coloured mark; `ring`
 * ('subtle' | 'strong') warms its border.
 */
export default function AgentMark({
  size = 27,
  working = false,
  ring = 'subtle',
  filled = false,
  className = ''
}) {
  const tile = Math.round(size * 1.1);
  const glow = ring === 'strong' ? 0.34 : 0.22;

  if (filled) {
    return (
      <span
        className={`inline-flex aspect-square shrink-0 items-center justify-center ${className}`}
        style={{
          width: tile,
          height: tile,
          borderRadius: Math.round(tile * 0.3),
          background: 'var(--gradient-ai)',
          boxShadow: '0 2px 10px -2px rgb(111 60 224 / 0.45)'
        }}
      >
        <AgentFace size={size} working={working} monochrome="#fff" />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex aspect-square shrink-0 items-center justify-center bg-white ${className}`}
      style={{
        width: tile,
        height: tile,
        borderRadius: Math.round(tile * 0.3),
        boxShadow: `0 0 0 1px rgb(62 151 255 / 0.20), 0 0 ${Math.round(tile * 0.28)}px rgb(62 151 255 / ${glow})`
      }}
    >
      <AgentFace size={size} working={working} />
    </span>
  );
}
