import { INPUT_CLASS } from '@/shared/ui/formStyles';
import { DRIVE_FREQUENCIES, hourLabel, usesHour } from '../driveFrequencies';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * How often a source is synchronised: one of the presets, plus the hour of the day (Rome time) for the
 * daily and weekly ones. `onChange({ frequency, dailyHour })` gets both, always.
 */
export default function FrequencyPicker({
  frequency,
  dailyHour,
  onChange,
  disabled,
  ariaLabel = 'Frequenza'
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <select
          value={frequency}
          disabled={disabled}
          onChange={event => onChange({ frequency: event.target.value, dailyHour })}
          className={`${INPUT_CLASS} disabled:opacity-60`}
          aria-label={ariaLabel}
        >
          {DRIVE_FREQUENCIES.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>
      {usesHour(frequency) && (
        <>
          <span className="shrink-0 text-fs-12 text-slate-soft">
            {frequency === 'weekly' ? 'lunedì alle' : 'alle'}
          </span>
          <div className="w-[88px] shrink-0">
            <select
              value={dailyHour}
              disabled={disabled}
              onChange={event => onChange({ frequency, dailyHour: Number(event.target.value) })}
              className={`${INPUT_CLASS} disabled:opacity-60`}
              aria-label="A che ora (ora italiana)"
            >
              {HOURS.map(hour => (
                <option key={hour} value={hour}>
                  {hourLabel(hour)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}
