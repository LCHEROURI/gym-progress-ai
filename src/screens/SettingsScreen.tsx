import {
  RESISTANCE_MACHINES,
  type Profile,
} from "../data/settings";

interface Props {
  profile: Profile;
  onSave: (profile: Profile) => void;
}

export default function SettingsScreen({ profile, onSave }: Props) {
  const update = (patch: Partial<Profile>) =>
    onSave({ ...profile, ...patch, updatedAt: new Date() });

  const setReminder = (day: "mon" | "wed" | "fri", value: string) =>
    update({ reminderTimes: { ...profile.reminderTimes, [day]: value } });

  const setIncrement = (key: string, value: number) =>
    update({
      machineIncrements: {
        ...profile.machineIncrements,
        [key]: Math.min(100, Math.max(0.5, value || 5)),
      },
    });

  return (
    <section aria-label="Settings">
      <h2 className="workoutName">SETTINGS</h2>

      <h3 className="sectionTitle">WEIGHT UNIT</h3>
      <div className="feelRow" role="group" aria-label="Weight unit">
        {(["lb", "kg"] as const).map((u) => (
          <button
            key={u}
            type="button"
            aria-pressed={profile.weightUnit === u}
            onClick={() => update({ weightUnit: u })}
          >
            {u.toUpperCase()}
          </button>
        ))}
      </div>

      <h3 className="sectionTitle">LARGE TEXT</h3>
      <Toggle
        label="Large text"
        value={profile.largeTextEnabled}
        onChange={(largeTextEnabled) => update({ largeTextEnabled })}
      />

      <h3 className="sectionTitle">AI COACH</h3>
      <Toggle
        label="AI coach suggestions"
        value={profile.aiRecommendationsEnabled}
        onChange={(aiRecommendationsEnabled) => update({ aiRecommendationsEnabled })}
      />

      <h3 className="sectionTitle">REST TIMER</h3>
      <div className="feelRow" role="group" aria-label="Rest timer default">
        {([60, 75, 90] as const).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={profile.defaultRestSeconds === n}
            onClick={() => update({ defaultRestSeconds: n })}
          >
            {n}s
          </button>
        ))}
      </div>

      <h3 className="sectionTitle">WORKOUT REMINDERS</h3>
      {(
        [
          ["mon", "Monday"],
          ["wed", "Wednesday"],
          ["fri", "Friday"],
        ] as const
      ).map(([day, label]) => (
        <label key={day} className="setRow">
          {label}
          <input
            type="time"
            aria-label={`${label} reminder time`}
            value={profile.reminderTimes[day] ?? ""}
            onChange={(e) => setReminder(day, e.target.value)}
          />
        </label>
      ))}

      <h3 className="sectionTitle">MACHINE WEIGHT INCREMENTS</h3>
      <p className="tip">The step size for the − / + weight buttons.</p>
      {RESISTANCE_MACHINES.map((m) => (
        <label key={m.key} className="setRow">
          {m.name}
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0.5"
            max="100"
            aria-label={`${m.name} increment`}
            value={profile.machineIncrements[m.key] ?? 5}
            onChange={(e) => setIncrement(m.key, Number(e.target.value))}
          />
        </label>
      ))}
    </section>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="feelRow" role="group" aria-label={label}>
      <button type="button" aria-pressed={value} onClick={() => onChange(true)}>
        ON
      </button>
      <button type="button" aria-pressed={!value} onClick={() => onChange(false)}>
        OFF
      </button>
    </div>
  );
}
