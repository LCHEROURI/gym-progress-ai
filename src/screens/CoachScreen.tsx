import { useEffect, useState } from "react";
import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import { fetchProgressFacts, type ProgressFacts } from "../data/progress";
import { TEMPLATES } from "../domain/templates";
import { askCoach, type CoachMessage } from "../coach/chat";
import { buildCoachContext } from "../coach/context";
import { classifyQuestion, type KnownExercise } from "../coach/intent";
import { lastEffortFeedback, suggestQuickChips } from "../coach/chips";

const knownExercises: KnownExercise[] = [
  ...new Map(
    TEMPLATES.flatMap((t) => t.exercises).map((e) => [e.key, { key: e.key, name: e.name }]),
  ).values(),
];

export default function CoachScreen({
  db,
  uid,
  app,
}: {
  db: Firestore;
  uid: string;
  app: FirebaseApp;
}) {
  const [facts, setFacts] = useState<ProgressFacts | null>(null);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProgressFacts({ db }, uid)
      .then((f) => {
        if (!cancelled) setFacts(f);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your workout history. Go back and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [db, uid]);

  const send = (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setDraft("");
    setBusy(true);
    setError(null);
    const history = messages;
    setMessages([...history, { role: "user", text: q }]);
    const classified = classifyQuestion({ question: q, knownExercises });
    const context = buildCoachContext({
      classified,
      sessions: facts?.sessions ?? [],
      exercises: facts?.exercises ?? [],
      today: new Date(),
    });
    void askCoach({ app, question: q, context, history })
      .then((answer) => setMessages((m) => [...m, { role: "model", text: answer }]))
      .catch(() => setError("Could not reach the coach. Try again."))
      .finally(() => setBusy(false));
  };

  const chips = suggestQuickChips(facts ? lastEffortFeedback(facts) : null);

  return (
    <section aria-label="AI coach">
      <h2 className="workoutName">AI COACH</h2>
      {error && <p role="alert">{error}</p>}
      <p className="tip">
        Answers come from your recorded workouts only — the coach never invents history.
      </p>

      <div className="chatLog" role="log" aria-label="Conversation">
        {messages.map((m, i) => (
          <p key={i} className={m.role === "user" ? "chatUser" : "chatCoach"}>
            {m.text}
          </p>
        ))}
        {busy && <p className="chatCoach">Thinking…</p>}
      </div>

      <div className="quickRow">
        {chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className="quickChip"
            onClick={() => send(chip.message)}
            disabled={busy}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <form
        className="chatForm"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          type="text"
          aria-label="Ask the coach"
          placeholder="Ask about your training…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          SEND
        </button>
      </form>
    </section>
  );
}
