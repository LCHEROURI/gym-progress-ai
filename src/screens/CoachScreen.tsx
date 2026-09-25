import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import { useCoachTurn } from "../coach/useCoachTurn";

export default function CoachScreen({
  db,
  uid,
  app,
}: {
  db: Firestore;
  uid: string;
  app: FirebaseApp;
}) {
  const turn = useCoachTurn({ db, uid, app });

  return (
    <section aria-label="AI coach">
      <h2 className="workoutName">AI COACH</h2>
      {turn.historyError && (
        <div role="alert">
          <p>{turn.historyError}</p>
          <button type="button" onClick={() => void turn.retryHistory()}>
            Retry history
          </button>
        </div>
      )}
      {turn.error && <p role="alert">{turn.error}</p>}
      <p className="tip">
        Answers come from your recorded workouts only — the coach never invents history.
      </p>
      {turn.historyLoading && <p role="status">Loading workout history…</p>}
      {!turn.historyLoading && turn.facts && <p role="status">Workout history ready.</p>}

      <div className="chatLog" role="log" aria-label="Conversation">
        {turn.messages.map((message, index) => (
          <p key={index} className={message.role === "user" ? "chatUser" : "chatCoach"}>
            {message.text}
          </p>
        ))}
        {turn.busy && <p className="chatCoach">Thinking…</p>}
      </div>

      <div className="quickRow">
        {turn.chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className="quickChip"
            onClick={() => void turn.send(chip.message)}
            disabled={turn.busy || turn.historyLoading}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <form
        className="chatForm"
        onSubmit={(e) => {
          e.preventDefault();
          void turn.send(turn.draft);
        }}
      >
        <input
          type="text"
          aria-label="Ask the coach"
          placeholder="Ask about your training…"
          value={turn.draft}
          onChange={(event) => turn.setDraft(event.target.value)}
        />
        <button type="submit" disabled={turn.busy || !turn.draft.trim()}>
          SEND
        </button>
      </form>
    </section>
  );
}
