/**
 * The chat's sidebar frame: the sidebar (`sidebar`, see Sidebar.jsx) beside the page (`children`).
 *
 *  · Docked (`desktop` in the code) the sidebar is part of the layout, expanded or collapsed to an icon rail (the choice is kept
 *    in localStorage, sidebarStore.js). "Classico" is flush with the window edges, "Flottante" a rounded panel with a margin and
 *    a shadow; its colours follow the coordinated menu theme (globals.css, `.app-sidebar`).
 *  · Otherwise it is an off-canvas drawer, opened by the hamburger of the page headers (MenuButton). While it is open the
 *    page behind is `inert` (the focus stays in the drawer), and it closes on a click on the backdrop, on Escape and when
 *    something in it is chosen (`closeMobile`, called by the sidebar). The focus goes back to the hamburger, or to the page
 *    when that is gone (the chosen entry has changed the header).
 *
 * Two uses, told by `embedded`:
 *  · the standalone page docks it from 768px up (the width of the window) and keeps its choices under the `standalone` keys;
 *  · /embed, the panel inside 7hub, docks it only from 1024px up (the width of the iframe: a wide panel, such as the host's
 *    expanded one; the usual 400px one only has the drawer) and keeps its choices apart (`embed` keys). The look is the host's
 *    (appearanceStore.js), so the sidebar's colours are the host's accent and menu theme. What the host is told about it (docked or
 *    drawer, open or not) is SidebarReporter's job, read from the same context.
 *
 * `hostButton`: the host draws the hamburger (7hub's header, which asks for the drawer with a `toggle_sidebar` command). The page
 * headers leave theirs out (`hostButton` in the context) and the host drives the drawer through the `ref` (`toggleDrawer`); the
 * drawer then has no close button of its own either (Sidebar.jsx). The focus goes to the drawer itself when it opens (no ring: it
 * is not a control, Tab enters the entries and Escape closes it); when the host's button closes it the focus stays where it is (on
 * that button, in the host's document, which the chat cannot focus), and when it closes from inside the focus goes to the page.
 *
 * The layout is driven by `data-docked` (globals.css), written here from the same media query that the headers read through
 * the context (`desktop`), so there is one source for "is it docked", not a CSS breakpoint and a JS one that may disagree.
 */
'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Tooltip from '@/shared/ui/Tooltip';
import { useMediaQuery } from '@/shared/useMediaQuery';
import { SidebarProvider } from './SidebarContext';
import { setSidebarCollapsed, useSidebarCollapsed } from './sidebarStore';

const DOCK_QUERIES = {
  standalone: '(min-width: 768px)',
  embed: '(min-width: 1024px)'
};

export default function AppShell({ sidebar, embedded = false, hostButton = false, ref, children }) {
  const scope = embedded ? 'embed' : 'standalone';
  // the server (static export) never renders this; true keeps the first client render the wide one
  const desktop = useMediaQuery(DOCK_QUERIES[scope], true);
  const collapsed = useSidebarCollapsed(scope);
  const [mobileOpen, setMobileOpen] = useState(false);
  // docked, the drawer is not a thing: if the panel grows while it is open it must not come back open when it shrinks again
  const [wasDesktop, setWasDesktop] = useState(desktop);
  if (desktop !== wasDesktop) {
    setWasDesktop(desktop);
    if (desktop) setMobileOpen(false);
  }
  const asideRef = useRef(null);
  const mainRef = useRef(null);
  const opener = useRef(null);
  const wasOpen = useRef(false);
  // the host's button closed the drawer: the focus is on that button, nothing to give back
  const closedByHost = useRef(false);

  const drawerOpen = mobileOpen && !desktop;
  const rail = desktop && collapsed;

  // the focus goes back to what opened it: the button that was clicked (a click does not focus a button in every browser, Safari
  // among them, so the active element would be the page's body)
  const openMobile = useCallback(event => {
    opener.current = event?.currentTarget ?? document.activeElement;
    setMobileOpen(true);
  }, []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const toggleCollapsed = useCallback(() => setSidebarCollapsed(!collapsed, scope), [collapsed, scope]);

  // the host's hamburger: opens the drawer, or closes it when it is open. Nothing while docked (there is no drawer). It reads the
  // state as it is when it runs: the command outlives the render it was made in
  const live = useRef({ desktop, drawerOpen });
  useLayoutEffect(() => {
    live.current = { desktop, drawerOpen };
  });
  useImperativeHandle(
    ref,
    () => ({
      toggleDrawer: () => {
        if (live.current.desktop) return;
        const open = !live.current.drawerOpen;
        // two commands before the next render still alternate
        live.current = { ...live.current, drawerOpen: open };
        closedByHost.current = !open;
        // not opened by a button of this page: there is none to give the focus back to
        if (open) opener.current = null;
        setMobileOpen(open);
      }
    }),
    []
  );

  // focus into the drawer when it opens, back out when it closes
  useEffect(() => {
    if (drawerOpen) {
      wasOpen.current = true;
      // the close button (`data-autofocus`); with the host's hamburger there is none, the focus goes to the drawer itself
      // (tabIndex -1, no ring): Tab then enters the entries and Escape closes it
      const aside = asideRef.current;
      (aside?.querySelector('[data-autofocus]') ?? aside)?.focus({ preventScroll: true });
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    if (closedByHost.current) {
      closedByHost.current = false;
      return;
    }
    // a dialog opened by the choice made in the drawer (unsaved edits) has the focus now
    if (document.activeElement?.closest('[aria-modal="true"]')) return;
    const target = opener.current?.isConnected ? opener.current : mainRef.current;
    target?.focus();
  }, [drawerOpen]);

  // Escape closes the drawer, but only when it is pressed inside it: the settings drawer (in a portal) and the account menu
  // have their own Escape
  const onKeyDown = event => {
    if (event.key !== 'Escape' || event.defaultPrevented || !drawerOpen) return;
    if (!asideRef.current?.contains(event.target)) return;
    event.preventDefault();
    closeMobile();
  };

  const value = useMemo(
    () => ({
      scope,
      desktop,
      rail,
      mobileOpen: drawerOpen,
      hostButton,
      openMobile,
      closeMobile,
      toggleCollapsed
    }),
    [scope, desktop, rail, drawerOpen, hostButton, openMobile, closeMobile, toggleCollapsed]
  );

  return (
    <SidebarProvider value={value}>
      <div className="app-shell" data-docked={desktop || undefined}>
        <aside
          ref={asideRef}
          id="app-sidebar"
          aria-label="Menu laterale"
          // not in the tab order: only the drawer's opening gives it the focus (see above)
          tabIndex={-1}
          className="app-sidebar"
          data-collapsed={rail || undefined}
          data-mobile-open={drawerOpen || undefined}
          // closed as a drawer it is off screen: nothing in it can be reached
          inert={!desktop && !drawerOpen}
          onKeyDown={onKeyDown}
        >
          {/* the animated glow of a coordinated theme (7hub's NavGlow), behind everything */}
          <span aria-hidden className="sb-glow" />

          {/* on the sidebar's edge, level with the header, as 7hub's pin button; only where the sidebar is docked */}
          {desktop && (
            <Tooltip
              label={rail ? 'Espandi il menu' : 'Riduci il menu'}
              side="right"
              className="absolute right-0 top-7 z-10 block translate-x-1/2"
            >
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={rail ? 'Espandi il menu' : 'Riduci il menu'}
                aria-expanded={!rail}
                aria-controls="app-sidebar"
                className="sb-edge"
              >
                {rail ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </Tooltip>
          )}

          {sidebar}
        </aside>

        {/* as a drawer: tapping outside it closes it */}
        <div aria-hidden className="app-backdrop" data-open={drawerOpen || undefined} onClick={closeMobile} />

        <div ref={mainRef} tabIndex={-1} className="app-main" inert={drawerOpen}>
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
}
