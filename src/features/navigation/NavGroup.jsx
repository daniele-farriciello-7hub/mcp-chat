/**
 * An entry of the sidebar that has subsections (Modello IA, Documenti…), in the look of 7hub's menu
 * (7hub-revolution: components/nav-section/vertical/nav-list.tsx for the open list, mini/nav-list.tsx for the rail).
 *
 *   · expanded   the entry with a chevron, and under it the subsections, indented along a line with an elbow to each (7hub's
 *                bullet). The list opens and closes with an animated height. Clicking a closed entry opens its list and, if the
 *                page is not already inside it, its first subsection; clicking an open one closes it. The current subsection has
 *                `aria-current="page"`; the entry itself shows "the page is in here" (`data-has-current`). Which groups are open is
 *                kept (sidebarStore.js); the page being inside a group opens it (Sidebar.jsx).
 *   · rail       only the icon: hovering it or focusing it with the keyboard shows the subsections in a flyout beside it, a click
 *                keeps it open, Escape or a click outside closes it. Arrow keys move through it, Tab leaves it. It is drawn in the
 *                body, like RailTip, because the list of entries scrolls and would cut it.
 *   · drawer     the drawer is the expanded sidebar: the list opens inline; choosing a subsection closes the drawer, opening a
 *                group does not.
 */
'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { useSidebar } from './SidebarContext';
import { setGroupOpen, useGroupOpen } from './sidebarStore';

/**
 * `items` are the subsections (`{ id, name }`); `current` is the id of the current one when the page is inside this group, else
 * null; `onSelect(id, { keepDrawer })` goes to one of them.
 */
export default function NavGroup(props) {
  const sidebar = useSidebar();
  return sidebar?.rail ? <RailGroup {...props} /> : <OpenGroup {...props} />;
}

function OpenGroup({ id, label, icon, items, current, onSelect }) {
  const sidebar = useSidebar();
  const listId = useId();
  const inside = current !== null;
  const stored = useGroupOpen(id, sidebar?.scope);
  // never opened or closed by hand: open while the page is inside it
  const open = stored ?? inside;

  // open: it closes; closed: it opens, and takes the page to its first subsection unless the page is already inside it
  const toggle = () => {
    setGroupOpen(id, !open, sidebar?.scope);
    if (!open && !inside) onSelect(items[0].id, { keepDrawer: true });
  };

  return (
    <li>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={listId}
        data-has-current={inside || undefined}
        className="sb-item"
      >
        <span aria-hidden className="sb-item-icon">
          {icon}
        </span>
        <span className="sb-label">{label}</span>
        <ChevronRight aria-hidden size={16} className="sb-chevron sb-rail-hide" />
      </button>
      {/* closed, the list is out of the tab order and of the screen readers' reach (inert) */}
      <div id={listId} className="sb-sub-wrap" data-open={open || undefined} inert={!open}>
        <div className="sb-sub-clip">
          <ul className="sb-sub" aria-label={label}>
            {items.map(sub => (
              <li key={sub.id}>
                <button
                  type="button"
                  onClick={() => onSelect(sub.id)}
                  aria-current={current === sub.id ? 'page' : undefined}
                  className="sb-sub-item"
                >
                  {sub.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

/** How long the pointer may be away from the icon and the flyout (the gap between them) before the flyout goes. */
const CLOSE_DELAY_MS = 160;

function RailGroup({ label, icon, items, current, onSelect }) {
  const flyId = useId();
  // null | 'hover' (the pointer or the focus is on it: it goes with them) | 'pinned' (clicked or opened with a key: it stays)
  const [mode, setMode] = useState(null);
  const [at, setAt] = useState(null);
  const triggerRef = useRef(null);
  const flyRef = useRef(null);
  const timer = useRef(0);
  const focusFirst = useRef(false);
  // putting the focus back on the icon must not open the flyout again
  const quiet = useRef(false);
  const open = mode !== null;
  const inside = current !== null;

  // beside the sidebar's edge (the flyout's own padding is the strip of hover between the icon and it), level with the icon
  const measure = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setAt({
      left: (trigger.closest('.app-sidebar') ?? trigger).getBoundingClientRect().right,
      top: trigger.getBoundingClientRect().top
    });
  };
  const show = next => {
    clearTimeout(timer.current);
    if (!open) measure();
    setMode(now => (now === 'pinned' ? now : next));
  };
  const hide = () => {
    clearTimeout(timer.current);
    setMode(null);
  };
  const hideSoon = () => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMode(now => (now === 'hover' ? null : now)), CLOSE_DELAY_MS);
  };
  const focusTrigger = () => {
    quiet.current = true;
    triggerRef.current?.focus();
    quiet.current = false;
  };
  const flyButtons = () => [...(flyRef.current?.querySelectorAll('button') ?? [])];

  useEffect(() => () => clearTimeout(timer.current), []);

  // opened with a key: the focus goes into the flyout, once it is there
  useEffect(() => {
    if (open && focusFirst.current) {
      focusFirst.current = false;
      flyButtons()[0]?.focus();
    }
  }, [open]);

  // in the viewport: the flyout lines up with its icon and moves up when it would run past the bottom
  useLayoutEffect(() => {
    if (!open || !at || !flyRef.current) return;
    const top = Math.max(8, Math.min(at.top, window.innerHeight - flyRef.current.offsetHeight - 8));
    if (top !== at.top) setAt({ ...at, top });
  }, [open, at]);

  // a press outside, a resize or a scroll of the list of entries (the flyout would be left behind) close it
  useEffect(() => {
    if (!open) return undefined;
    const outside = event => {
      if (!flyRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) hide();
    };
    const away = event => {
      if (!flyRef.current?.contains(event.target)) hide();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', away);
    window.addEventListener('scroll', away, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', away);
      window.removeEventListener('scroll', away, true);
    };
  }, [open]);

  const choose = id => {
    hide();
    focusTrigger();
    onSelect(id);
  };

  const onTriggerKeyDown = event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      hide();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusFirst.current = true;
      show('pinned');
      if (open) {
        focusFirst.current = false;
        flyButtons()[0]?.focus();
      }
    }
  };

  const onFlyKeyDown = event => {
    const buttons = flyButtons();
    const index = buttons.indexOf(document.activeElement);
    const last = buttons.length - 1;
    const move = to => {
      event.preventDefault();
      buttons[to]?.focus();
    };
    if (event.key === 'Escape' || event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      hide();
      focusTrigger();
    } else if (event.key === 'ArrowDown') move(index >= last ? 0 : index + 1);
    else if (event.key === 'ArrowUp') move(index <= 0 ? last : index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(last);
    else if (event.key === 'Tab' && (event.shiftKey ? index <= 0 : index >= last)) {
      // past either end: back to the icon, from where Tab goes on to the next entry
      event.preventDefault();
      hide();
      focusTrigger();
    }
  };

  return (
    <li>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? flyId : undefined}
        data-has-current={inside || undefined}
        className="sb-item"
        // a mouse only: a touch has no hover, its tap is the click below
        onPointerEnter={event => event.pointerType === 'mouse' && show('hover')}
        onPointerLeave={event => event.pointerType === 'mouse' && hideSoon()}
        // a keyboard focus shows it (a click's focus does not: it would stay under a pointer that has moved on)
        onFocus={event => !quiet.current && event.target.matches(':focus-visible') && show('hover')}
        onBlur={event => !flyRef.current?.contains(event.relatedTarget) && hideSoon()}
        onClick={event => {
          if (mode === 'pinned') {
            hide();
            return;
          }
          // detail 0: it came from the keyboard (Enter, Space), and the keyboard goes on in the flyout
          focusFirst.current = event.detail === 0;
          if (!open) measure();
          setMode('pinned');
          if (open && focusFirst.current) {
            focusFirst.current = false;
            flyButtons()[0]?.focus();
          }
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span aria-hidden className="sb-item-icon">
          {icon}
        </span>
        <span className="sb-label">{label}</span>
      </button>
      {open &&
        at &&
        createPortal(
          <div
            ref={flyRef}
            id={flyId}
            role="group"
            aria-label={label}
            className="sb-fly"
            style={at}
            onPointerEnter={event => event.pointerType === 'mouse' && show('hover')}
            onPointerLeave={event => event.pointerType === 'mouse' && hideSoon()}
            onKeyDown={onFlyKeyDown}
          >
            <div className="sb-fly-card">
              <div aria-hidden className="sb-fly-title">
                {label}
              </div>
              <ul className="sb-fly-list">
                {items.map(sub => (
                  <li key={sub.id}>
                    <button
                      type="button"
                      onClick={() => choose(sub.id)}
                      aria-current={current === sub.id ? 'page' : undefined}
                      className="sb-fly-item"
                    >
                      {sub.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body
        )}
    </li>
  );
}
