import Tooltip from './Tooltip';

export default function Button({
  children,
  onClick,
  disabled,
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
      className={`flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
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
