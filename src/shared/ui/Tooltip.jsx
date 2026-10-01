const SIDE = { bottom: 'top-full mt-1.5', top: 'bottom-full mb-1.5' };
const ALIGN = { center: 'left-1/2 -translate-x-1/2', left: 'left-0', right: 'right-0' };

/**
 * Styled tooltip shown on hover and keyboard focus. Wraps the control; the control keeps its own
 * aria-label, the tooltip is visual only. Use `align="right"` near the panel's right edge.
 */
const HAS_OWN_DISPLAY = /\b(block|flex|grid|inline-block|inline-grid)\b/;

export default function Tooltip({ label, side = 'bottom', align = 'center', className = '', children }) {
  if (!label) return children;
  // an absolutely positioned wrapper is already a positioning context; a caller that needs the
  // wrapper to size like a block (e.g. to truncate) passes its own display class
  const display = HAS_OWN_DISPLAY.test(className) ? '' : 'inline-flex';
  return (
    <span
      className={`group/tooltip ${display} ${className.includes('absolute') ? '' : 'relative'} ${className}`}
    >
      {children}
      <span
        aria-hidden
        className={`pointer-events-none absolute z-30 w-max max-w-[220px] rounded-lg bg-ink px-2.5 py-1.5 text-center text-[11px] font-medium leading-snug text-white opacity-0 shadow-lift transition-opacity delay-150 group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100 ${SIDE[side]} ${ALIGN[align]}`}
      >
        {label}
      </span>
    </span>
  );
}
