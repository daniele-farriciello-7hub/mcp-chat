'use client';

import { createContext, useContext } from 'react';

/**
 * What the sidebar shell (AppShell.jsx) shares with the sidebar and with the page headers: whether the page has a sidebar at
 * all (null = no: the chat opened without one), the rail and the drawer.
 *   scope           which saved choices it reads and writes (sidebarStore.js): 'standalone' or 'embed'
 *   desktop         the sidebar is docked beside the page (768px up standalone, 1024px up in /embed); below it is an off-canvas
 *                   drawer, opened by the hamburger of the page headers
 *   rail            collapsed to icons (only ever true when docked)
 *   mobileOpen      the drawer is open (only ever true when not docked)
 *   hostButton      the host draws the hamburger that opens the drawer (/embed with `hostChrome` and the `sidebarButton` capability):
 *                   the page headers leave theirs out (MenuButton, EmbedMenuBar)
 */
const SidebarContext = createContext(null);

export const SidebarProvider = SidebarContext.Provider;

export const useSidebar = () => useContext(SidebarContext);
