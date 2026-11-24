/**
 * The tooltip of the collapsed sidebar: the name of an icon, to its right. Drawn in the body with a fixed position, because the
 * list of entries scrolls and a tooltip inside it would be cut at the rail's edge. `label` empty (the sidebar is expanded):
 * nothing but the children. Visual only, like shared/ui/Tooltip: the control keeps its own accessible name.
 */
'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function RailTip({ label, children }) {
  const wrapper = useRef(null);
  const [at, setAt] = useState(null);

  if (!label) return children;

  const show = () => {
    const box = wrapper.current?.getBoundingClientRect();
    if (box) setAt({ left: box.right + 10, top: box.top + box.height / 2 });
  };
  const hide = () => setAt(null);

  return (
    <span
      ref={wrapper}
      className="flex w-full"
      onPointerEnter={show}
      onPointerLeave={hide}
      // a keyboard focus shows it; a click's focus does not, or it would stay under a pointer that has moved on
      onFocus={event => event.target.matches(':focus-visible') && show()}
      onBlur={hide}
    >
      {children}
      {at &&
        createPortal(
          <span
            aria-hidden
            className="pointer-events-none fixed z-[90] w-max max-w-[220px] -translate-y-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-center text-fs-11 font-medium leading-snug text-panel shadow-lift"
            style={at}
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  );
}
