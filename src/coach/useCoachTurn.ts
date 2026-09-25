import { useCallback, useEffect, useRef, useState } from "react";
import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import { TEMPLATES } from "../domain/templates";
import { fetchProgressFacts, type ProgressFacts } from "../data/progress";
import { askCoach, type CoachMessage } from "./chat";
import { buildCoachContext } from "./context";
import { classifyQuestion, type KnownExercise } from "./intent";
import { lastEffortFeedback, suggestQuickChips } from "./chips";

const KNOWN_EXERCISES: KnownExercise[] = [
  ...new Map(
    TEMPLATES.flatMap((template) => template.exercises).map((exercise) => [
      exercise.key,
      { key: exercise.key, name: exercise.name },
    ]),
  ).values(),
];

export interface CoachTurn {
  facts: ProgressFacts | null;
  historyLoading: boolean;
  historyError: string | null;
  messages: CoachMessage[];
  draft: string;
  setDraft: (draft: string) => void;
  busy: boolean;
  error: string | null;
  chips: ReturnType<typeof suggestQuickChips>;
  send: (question: string) => Promise<void>;
  retryHistory: () => Promise<void>;
}

/**
 * Owns a complete Coach Turn: load the user's real workout facts, classify the
 * question, compute deterministic context, then ask Gemini to interpret only
 * those facts. The screen sees turn state, not the pipeline's moving parts.
 */
export function useCoachTurn(input: {
  db: Firestore;
  uid: string;
  app: FirebaseApp;
  today?: Date;
}): CoachTurn {
  const [facts, setFacts] = useState<ProgressFacts | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const factsRequest = useRef<Promise<ProgressFacts> | null>(null);

  const loadFacts = useCallback((): Promise<ProgressFacts> => {
    if (facts) return Promise.resolve(facts);
    if (factsRequest.current) return factsRequest.current;

    setHistoryLoading(true);
    setHistoryError(null);
    const request = fetchProgressFacts({ db: input.db }, input.uid)
      .then((loaded) => {
        setFacts(loaded);
        setHistoryLoading(false);
        return loaded;
      })
      .catch((cause: unknown) => {
        setHistoryError("Could not load your workout history. Check your connection and retry.");
        setHistoryLoading(false);
        throw cause;
      });
    const trackedRequest = request.finally(() => {
      if (factsRequest.current === trackedRequest) factsRequest.current = null;
    });
    factsRequest.current = trackedRequest;
    return trackedRequest;
  }, [facts, input.db, input.uid]);

  useEffect(() => {
    void loadFacts().catch(() => undefined);
  }, [loadFacts]);

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busy) return;

      const history = messages;
      setDraft("");
      setBusy(true);
      setError(null);
      setMessages((current) => [...current, { role: "user", text: trimmed }]);

      try {
        // A question submitted before the initial read finishes shares that
        // in-flight request; it can never be answered from a false empty state.
        let loadedFacts: ProgressFacts;
        try {
          loadedFacts = facts ?? (await loadFacts());
        } catch {
          setError("Could not load the facts for your question. Check your connection and retry.");
          return;
        }

        const classified = classifyQuestion({
          question: trimmed,
          knownExercises: KNOWN_EXERCISES,
        });
        const context = buildCoachContext({
          classified,
          sessions: loadedFacts.sessions,
          exercises: loadedFacts.exercises,
          today: input.today ?? new Date(),
        });
        try {
          const answer = await askCoach({
            app: input.app,
            question: trimmed,
            context,
            history,
          });
          setMessages((current) => [...current, { role: "model", text: answer }]);
        } catch {
          setError("Could not reach the coach. Try again.");
        }
      } finally {
        setBusy(false);
      }
    },
    [input.app, busy, facts, input.today, loadFacts, messages],
  );

  const chips = suggestQuickChips(facts ? lastEffortFeedback(facts) : null);

  const retryHistory = useCallback(async () => {
    try {
      await loadFacts();
    } catch {
      // The actionable error is exposed as historyError for the screen.
    }
  }, [loadFacts]);

  return {
    facts,
    historyLoading,
    historyError,
    messages,
    draft,
    setDraft,
    busy,
    error,
    chips,
    send,
    retryHistory,
  };
}
