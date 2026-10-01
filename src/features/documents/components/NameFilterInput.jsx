import { Search } from 'lucide-react';

export default function NameFilterInput({ value, onChange }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100">
      <Search size={14} className="text-slate-soft" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Cerca per nome del file"
        className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-slate-soft"
      />
    </label>
  );
}
