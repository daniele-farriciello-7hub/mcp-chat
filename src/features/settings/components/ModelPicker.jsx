import { Check } from 'lucide-react';
import { MODELS } from '@/features/settings/models';

export default function ModelPicker({ value, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      {MODELS.map(model => {
        const selected = model.id === value;
        return (
          <button
            key={model.id}
            type="button"
            onClick={() => onChange(model.id)}
            aria-pressed={selected}
            className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
              selected
                ? 'border-brand-300 bg-brand-50/60'
                : 'border-line hover:border-brand-200 hover:bg-surface'
            }`}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-pill border transition ${
                selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-white'
              }`}
            >
              {selected && <Check size={11} strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">{model.name}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-soft">
                {model.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
