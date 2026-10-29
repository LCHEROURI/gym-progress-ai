import { useState } from "react";
import {
  createCustomExerciseKey,
  RESISTANCE_MACHINES,
  type Profile,
} from "../data/settings";
import InstallSection from "../install/InstallSection";

interface Props {
  profile: Profile;
  onSave: (profile: Profile) => Promise<void> | void;
  saveError?: string | null;
}

export default function SettingsScreen({ profile, onSave, saveError }: Props) {
  const [localError, setLocalError] = useState<string | null>(null);
  const error = saveError ?? localError;

  const update = async (patch: Partial<Profile>) => {
    setLocalError(null);
    try {
      await onSave({ ...profile, ...patch, updatedAt: new Date() });
    } catch {
      setLocalError("Couldn't save — check your connection and try again.");
    }
  };

  const setReminder = (day: "mon" | "wed" | "fri", value: string) =>
    update({ reminderTimes: { ...profile.reminderTimes, [day]: value } });

  const setIncrement = (key: string, value: number) =>
    update({
      machineIncrements: {
        ...profile.machineIncrements,
        [key]: Math.min(100, Math.max(0.5, value || 5)),
      },
    });

  const removeExtra = (key: string) => {
    update({
      extraExercises: (profile.extraExercises ?? []).filter((e) => e.key !== key),
    });
  };

  const addExtra = (exercise: {
    name: string;
    targetSets: number;
    targetRepsMin: number;
    targetRepsMax: number;
    tip?: string;
  }) => {
    const list = profile.extraExercises ?? [];
    if (list.length >= 20) return;
    const key = createCustomExerciseKey(
      exercise.name,
      list.map((e) => e.key),
    );
    update({
      extraExercises: [
        ...list,
        {
          key,
          name: exercise.name.trim(),
          targetSets: exercise.targetSets,
          targetRepsMin: exercise.targetRepsMin,
          targetRepsMax: exercise.targetRepsMax,
          tip: exercise.tip ?? "",
        },
      ],
    });
  };

  return (
    <section aria-label="Settings">
      <h2 className="workoutName">SETTINGS</h2>
      {error && <p role="alert">{error}</p>}

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

      <h3 className="sectionTitle">MY EXTRA EXERCISES</h3>
      <p className="tip">Exercises appended to every workout automatically.</p>

      {(profile.extraExercises ?? []).length === 0 ? (
        <div className="emptyExercises">
          <p className="tip">No extra exercises yet. Tap a suggestion to add:</p>
          <div className="feelRow" role="group" aria-label="Exercise suggestions">
            <button
              type="button"
              onClick={() =>
                addExtra({
                  name: "Biceps Curl",
                  targetSets: 2,
                  targetRepsMin: 10,
                  targetRepsMax: 10,
                })
              }
            >
              + Biceps Curl (2 × 10)
            </button>
            <button
              type="button"
              onClick={() =>
                addExtra({
                  name: "Triceps Pushdown",
                  targetSets: 2,
                  targetRepsMin: 10,
                  targetRepsMax: 10,
                })
              }
            >
              + Triceps Pushdown (2 × 10)
            </button>
          </div>
        </div>
      ) : (
        <ul className="extraExerciseList">
          {(profile.extraExercises ?? []).map((ex) => (
            <li key={ex.key} className="setRow">
              <div>
                <strong>{ex.name}</strong>
                <span className="exerciseTarget">
                  {" "}
                  ({ex.targetSets} × {ex.targetRepsMin}
                  {ex.targetRepsMax !== ex.targetRepsMin ? `–${ex.targetRepsMax}` : ""})
                </span>
              </div>
              <button
                type="button"
                className="removeButton"
                onClick={() => removeExtra(ex.key)}
                aria-label={`Remove ${ex.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <InstallSection />
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
