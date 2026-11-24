/**
 * Icons of the settings drawer, drawn inline (colour: currentColor). Sun, moon and the "Sfondo animato" icon are the paths of
 * 7hub's drawer (7hub-revolution: scripts/components/settings/drawer/icons.tsx); the gear is the one of its header button
 * (layouts/components/settings-button.tsx, solar "settings-bold-duotone"). The monitor of "Sistema" is drawn here in the same
 * duotone style, since 7hub has only Chiaro and Scuro. The two previews of "Stile menu" are 7hub's too (the window with the sidebar
 * flush with the edges, or detached and rounded).
 */

export const drawerIcons = {
  sun: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.75" fill="currentColor" />
      <path
        d="M12 2.5V4.5M12 19.5V21.5M2.5 12H4.5M19.5 12H21.5M5.28 5.28L6.7 6.7M17.3 17.3L18.72 18.72M5.28 18.72L6.7 17.3M17.3 6.7L18.72 5.28"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  ),
  moon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        opacity="0.4"
        d="M16.9462 11.0863C16.9759 11.0875 17.0055 11.0886 17.035 11.0898C20.1966 11.2176 22.5 13.3358 22.5 16.5C22.5 19.6642 20.1966 21.7824 17.035 21.9102C15.7057 21.9639 14.0498 22 12 22C9.9502 22 8.2943 21.9639 6.965 21.9102C3.80337 21.7824 1.5 19.6642 1.5 16.5C1.5 14.0317 2.90165 12.1999 5.019 11.4529C5.2406 8.2951 7.3872 6.02435 10.6413 6.00125C10.7585 6.00045 10.878 6 11 6C11.122 6 11.2415 6.00045 11.3587 6.00125C14.4855 6.02345 16.5897 8.1208 16.9462 11.0863Z"
        fill="currentColor"
      />
      <path
        d="M19.2407 2.28853C19.5263 2.12002 19.5419 1.62921 19.2169 1.57222C18.1306 1.38179 16.9755 1.56344 15.9464 2.17059C14.4123 3.07575 13.5394 4.70186 13.501 6.38837C15.4283 7.12677 16.6785 8.86242 16.9459 11.0863L17.0347 11.0898C17.7391 11.1183 18.401 11.2456 19.0042 11.4612C19.6324 11.3806 20.2555 11.1732 20.8383 10.8294C21.8673 10.2222 22.5988 9.2907 22.9806 8.23415C23.0948 7.918 22.6711 7.6864 22.3855 7.8549C20.8813 8.74235 18.958 8.2157 18.0896 6.6786C17.2212 5.1415 17.7366 3.17599 19.2407 2.28853Z"
        fill="currentColor"
      />
    </svg>
  ),
  system: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="2" y="3.5" width="20" height="13.5" rx="4" fill="currentColor" opacity="0.4" />
      <path d="M12 17.25V20.5M8 20.75H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M2 13H22" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
    </svg>
  ),
  siderbarDuotone: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        opacity="0.4"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20.828 4.172C22 5.343 22 7.229 22 11V13C22 16.771 22 18.657 20.828 19.828C19.657 21 17.771 21 14 21H9V3H14C17.771 3 19.657 3 20.828 4.172Z"
        fill="currentColor"
      />
      <path
        d="M18.5 9.244C18.6989 9.244 18.8897 9.32302 19.0303 9.46367C19.171 9.60432 19.25 9.79509 19.25 9.994C19.25 10.1929 19.171 10.3837 19.0303 10.5243C18.8897 10.665 18.6989 10.744 18.5 10.744H12.5C12.3011 10.744 12.1103 10.665 11.9697 10.5243C11.829 10.3837 11.75 10.1929 11.75 9.994C11.75 9.79509 11.829 9.60432 11.9697 9.46367C12.1103 9.32302 12.3011 9.244 12.5 9.244H18.5ZM17.5 13.244C17.6989 13.244 17.8897 13.323 18.0303 13.4637C18.171 13.6043 18.25 13.7951 18.25 13.994C18.25 14.1929 18.171 14.3837 18.0303 14.5243C17.8897 14.665 17.6989 14.744 17.5 14.744H13.5C13.3011 14.744 13.1103 14.665 12.9697 14.5243C12.829 14.3837 12.75 14.1929 12.75 13.994C12.75 13.7951 12.829 13.6043 12.9697 13.4637C13.1103 13.323 13.3011 13.244 13.5 13.244H17.5ZM2 12.994V10.994C2 7.223 2 5.337 3.172 4.166C4.146 3.191 6.364 3.027 9 3V20.988C6.364 20.961 4.146 20.797 3.172 19.822C2 18.651 2 16.765 2 12.994Z"
        fill="currentColor"
      />
    </svg>
  ),
  // Previews of "Stile menu": the window with the sidebar flush with its edges (classico) or detached and rounded (flottante)
  navStyleClassic: (
    <svg aria-hidden="true" focusable="false" width="56" height="38" viewBox="0 0 56 38" fill="none">
      <rect
        x="0.75"
        y="0.75"
        width="54.5"
        height="36.5"
        rx="4.25"
        stroke="currentColor"
        strokeOpacity="0.32"
        strokeWidth="1.5"
      />
      <path
        d="M1.5 5.25A3.75 3.75 0 0 1 5.25 1.5H17v35H5.25A3.75 3.75 0 0 1 1.5 32.75z"
        fill="currentColor"
        opacity="0.4"
      />
      <rect x="22" y="8" width="28" height="4" rx="2" fill="currentColor" opacity="0.4" />
      <rect x="22" y="16" width="20" height="4" rx="2" fill="currentColor" opacity="0.4" />
      <rect x="22" y="24" width="24" height="4" rx="2" fill="currentColor" opacity="0.4" />
    </svg>
  ),
  navStyleFloating: (
    <svg aria-hidden="true" focusable="false" width="56" height="38" viewBox="0 0 56 38" fill="none">
      <rect
        x="0.75"
        y="0.75"
        width="54.5"
        height="36.5"
        rx="4.25"
        stroke="currentColor"
        strokeOpacity="0.32"
        strokeWidth="1.5"
      />
      <rect x="4.5" y="4.5" width="13" height="29" rx="4" fill="currentColor" opacity="0.4" />
      <rect x="22" y="8" width="28" height="4" rx="2" fill="currentColor" opacity="0.4" />
      <rect x="22" y="16" width="20" height="4" rx="2" fill="currentColor" opacity="0.4" />
      <rect x="22" y="24" width="24" height="4" rx="2" fill="currentColor" opacity="0.4" />
    </svg>
  ),
  /** the header button: the outer ring (the first path) turns slowly, see .gear-ring in globals.css */
  gear: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        className="gear-ring"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        opacity="0.4"
        d="M14.279 2.152C13.909 2 13.439 2 12.5 2s-1.408 0-1.779.152a2.008 2.008 0 0 0-1.09 1.083c-.094.223-.13.484-.145.863a1.615 1.615 0 0 1-.796 1.353a1.64 1.64 0 0 1-1.579.008c-.338-.178-.583-.276-.825-.308a2.026 2.026 0 0 0-1.49.396c-.318.242-.553.646-1.022 1.453c-.47.807-.704 1.21-.757 1.605c-.07.526.074 1.058.4 1.479c.148.192.357.353.68.555c.477.297.783.803.783 1.361c0 .558-.306 1.064-.782 1.36c-.324.203-.533.364-.682.556a1.99 1.99 0 0 0-.399 1.479c.053.394.287.798.757 1.605c.47.807.704 1.21 1.022 1.453c.424.323.96.465 1.49.396c.242-.032.487-.13.825-.308a1.64 1.64 0 0 1 1.58.008c.486.28.774.795.795 1.353c.015.38.051.64.145.863c.204.49.596.88 1.09 1.083c.37.152.84.152 1.779.152s1.409 0 1.779-.152a2.008 2.008 0 0 0 1.09-1.083c.094-.223.13-.483.145-.863c.02-.558.309-1.074.796-1.353a1.64 1.64 0 0 1 1.579-.008c.338.178.583.276.825.308c.53.07 1.066-.073 1.49-.396c.318-.242.553-.646 1.022-1.453c.47-.807.704-1.21.757-1.605a1.99 1.99 0 0 0-.4-1.479c-.148-.192-.357-.353-.68-.555c-.477-.297-.783-.803-.783-1.361c0-.558.306-1.064.782-1.36c.324-.203.533-.364.682-.556a1.99 1.99 0 0 0 .399-1.479c-.053-.394-.287-.798-.757-1.605c-.47-.807-.704-1.21-1.022-1.453a2.026 2.026 0 0 0-1.49-.396c-.242.032-.487.13-.825.308a1.64 1.64 0 0 1-1.58-.008a1.615 1.615 0 0 1-.795-1.353c-.015-.38-.051-.64-.145-.863a2.007 2.007 0 0 0-1.09-1.083"
      />
      <path
        fill="currentColor"
        d="M15.523 12c0 1.657-1.354 3-3.023 3c-1.67 0-3.023-1.343-3.023-3S10.83 9 12.5 9c1.67 0 3.023 1.343 3.023 3"
      />
    </svg>
  )
};
