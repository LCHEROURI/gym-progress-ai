import { useEffect, useState } from "react";
import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import { fetchProgressFacts, type ProgressFacts } from "../data/progress";
import { TEMPLATES } from "../domain/templates";
import { askCoach, type CoachMessage } from "../coach/chat";
import { buildCoachContext } from "../coach/context";
import { classifyQuestion, type KnownExercise } from "../coach/intent";

const QUICK_QUESTIONS = [
  "What weight should I use today?",
  "How am I progressing on leg press?",
  "Which exercise has improved most?",
  "Which exercise has stalled?",
  "How many workouts did I complete this month?",
  "How much cardio did I do?",
  "What should I focus on next week?",
];

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
        {QUICK_QUESTIONS.map((q) => (
          <button key={q} type="button" className="quickChip" onClick={() => send(q)} disabled={busy}>
            {q}
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
