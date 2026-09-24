import { useEffect, useState } from "react";

const OPTIONS = [60, 75, 90] as const;

export default function RestTimer({
  onSkip,
  defaultSeconds = 75,
}: {
  onSkip?: () => void;
  defaultSeconds?: number;
}) {
  const [seconds, setSeconds] = useState<number>(defaultSeconds);
  const [remaining, setRemaining] = useState(defaultSeconds);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (remaining === 0) setRunning(false);
  }, [remaining]);

  const pick = (n: number) => {
    setSeconds(n);
    setRemaining(n);
    setRunning(false);
  };

  return (
    <section aria-label="Rest timer" className="restTimer">
      <p className="restCount" aria-live="polite">
        REST {remaining}s
      </p>
      <div className="restButtons">
        <button type="button" onClick={() => setRunning(true)} disabled={running || remaining === 0}>
          START
        </button>
        <button type="button" onClick={() => setRunning(false)} disabled={!running}>
          PAUSE
        </button>
        <button
          type="button"
          onClick={() => {
            setRemaining(seconds);
            setRunning(false);
          }}
        >
          RESET
        </button>
        <button type="button" onClick={onSkip}>
          SKIP
        </button>
      </div>
      <div className="restOptions">
        {OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={seconds === n}
            onClick={() => pick(n)}
          >
            {n}s
          </button>
        ))}
      </div>
    </section>
  );
}
