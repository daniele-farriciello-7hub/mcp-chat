import { HELP_TEXT_CLASS } from './formStyles';

export default function Field({ label, help, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-ink">{label}</span>
      {children}
      {help && <p className={HELP_TEXT_CLASS}>{help}</p>}
    </label>
  );
}
