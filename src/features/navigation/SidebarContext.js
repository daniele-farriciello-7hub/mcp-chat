'use client';

import { createContext, useContext } from 'react';

/**
 * What the sidebar shell (AppShell.jsx) shares with the sidebar and with the page headers: whether the page has a sidebar at
 * all (null = no: /embed, or the chat opened without one), the rail and the phone drawer.
 *   desktop         the sidebar sits beside the page (768px and up); below it is an off-canvas drawer
 *   rail            collapsed to icons (only ever true on desktop)
 *   mobileOpen      the drawer is open (only ever true below 768px)
 */
const SidebarContext = createContext(null);

export const SidebarProvider = SidebarContext.Provider;

export const useSidebar = () => useContext(SidebarContext);
