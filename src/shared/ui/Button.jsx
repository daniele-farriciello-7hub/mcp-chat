import Tooltip from './Tooltip';

/**
 * `disabled` switches the button off. `softDisabled` only makes it look off: a click still arrives, so
 * the caller can answer it with the reason (a disabled button swallows the click and says nothing).
 */
export default function Button({
  children,
  onClick,
  disabled,
  softDisabled,
  primary,
  tooltip,
  tooltipAlign = 'center',
  type = 'button',
  className = ''
}) {
  const button = (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={softDisabled || undefined}
      className={`flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        softDisabled ? 'cursor-not-allowed opacity-40' : ''
      } ${
        primary
          ? 'bg-brand-500 text-white hover:bg-brand-600'
          : 'border border-line text-ink hover:bg-surface'
      } ${className}`}
    >
      {children}
    </button>
  );
  return tooltip ? (
    <Tooltip label={tooltip} align={tooltipAlign}>
      {button}
    </Tooltip>
  ) : (
    button
  );
}
