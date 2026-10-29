import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import { TEMPLATES } from "../domain/templates";
import {
  createCustomExerciseKey,
  defaultProfile,
  extraExerciseSchema,
  fetchProfile,
  saveProfile,
  type ExtraExercise,
  type Profile,
} from "../data/settings";
import { fetchProgressFacts, type ProgressFacts } from "../data/progress";
import { askCoach, type CoachMessage } from "./chat";
import { buildCoachContext } from "./context";
import {
  classifyQuestion,
  extractExerciseSlots,
  isConfirmationAccept,
  isConfirmationDecline,
  toTitleCase,
  type KnownExercise,
} from "./intent";
import { lastEffortFeedback, suggestQuickChips } from "./chips";

export function buildKnownExercises(extraExercises?: ExtraExercise[]): KnownExercise[] {
  const base: KnownExercise[] = TEMPLATES.flatMap((template) => template.exercises).map((exercise) => ({
    key: exercise.key,
    name: exercise.name,
  }));
  const extras: KnownExercise[] = (extraExercises ?? []).map((e) => ({
    key: e.key,
    name: e.name,
  }));
  return [...new Map([...base, ...extras].map((e) => [e.key, e])).values()];
}

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

interface PendingAddition {
  name: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
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
  extraExercises?: ExtraExercise[];
  profile?: Profile | Pick<Profile, "extraExercises"> | null;
  onSaveProfile?: (profile: Profile) => Promise<void> | void;
}): CoachTurn {
  const [facts, setFacts] = useState<ProgressFacts | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const factsRequest = useRef<Promise<ProgressFacts> | null>(null);

  const pendingAdditionRef = useRef<PendingAddition | null>(null);
  const awaitingNameRef = useRef<{
    targetSets: number;
    targetRepsMin: number;
    targetRepsMax: number;
  } | null>(null);
  const [localExtraExercises, setLocalExtraExercises] = useState<ExtraExercise[]>([]);

  const extraExercises = useMemo(() => {
    const fromProps = input.extraExercises ?? input.profile?.extraExercises ?? [];
    const combined = [...fromProps, ...localExtraExercises];
    return [...new Map(combined.map((e) => [e.key, e])).values()];
  }, [input.extraExercises, input.profile?.extraExercises, localExtraExercises]);

  const knownExercises = useMemo(
    () => buildKnownExercises(extraExercises),
    [extraExercises],
  );

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

  const promptConfirmation = useCallback(
    (target: PendingAddition) => {
      if (extraExercises.length >= 20) {
        setMessages((cur) => [
          ...cur,
          {
            role: "model",
            text: "You already have 20 extra exercises, which is the maximum. Remove one in Settings before adding more.",
          },
        ]);
        return;
      }

      const baseKey = createCustomExerciseKey(target.name, []);
      if (
        extraExercises.some(
          (e) =>
            e.key === baseKey ||
            e.name.toLowerCase() === target.name.toLowerCase(),
        )
      ) {
        setMessages((cur) => [
          ...cur,
          {
            role: "model",
            text: `${target.name} is already in your extra exercises.`,
          },
        ]);
        return;
      }

      pendingAdditionRef.current = target;
      const repsStr =
        target.targetRepsMin === target.targetRepsMax
          ? `${target.targetRepsMin}`
          : `${target.targetRepsMin}–${target.targetRepsMax}`;
      const setsReps = `${target.targetSets} sets × ${repsStr} reps`;
      setMessages((cur) => [
        ...cur,
        {
          role: "model",
          text: `I can add ${target.name} (${setsReps}) to every workout. Would you like me to add it?`,
        },
      ]);
    },
    [extraExercises],
  );

  const savePendingAddition = useCallback(
    async (pending: PendingAddition) => {
      if (extraExercises.length >= 20) {
        setMessages((cur) => [
          ...cur,
          {
            role: "model",
            text: "You already have 20 extra exercises, which is the maximum. Remove one in Settings before adding more.",
          },
        ]);
        return;
      }

      const baseKey = createCustomExerciseKey(pending.name, []);
      if (
        extraExercises.some(
          (e) =>
            e.key === baseKey ||
            e.name.toLowerCase() === pending.name.toLowerCase(),
        )
      ) {
        setMessages((cur) => [
          ...cur,
          {
            role: "model",
            text: `${pending.name} is already in your extra exercises.`,
          },
        ]);
        return;
      }

      const key = createCustomExerciseKey(
        pending.name,
        extraExercises.map((e) => e.key),
      );

      let newExercise: ExtraExercise;
      try {
        newExercise = extraExerciseSchema.parse({
          key,
          name: pending.name,
          targetSets: pending.targetSets,
          targetRepsMin: pending.targetRepsMin,
          targetRepsMax: pending.targetRepsMax,
          tip: "",
        });
      } catch {
        setMessages((cur) => [
          ...cur,
          {
            role: "model",
            text: `Could not validate ${pending.name}. Check the exercise details and try again.`,
          },
        ]);
        return;
      }

      try {
        let currentProfile: Profile;
        if (input.profile && "weightUnit" in input.profile) {
          currentProfile = input.profile as Profile;
        } else if (input.profile) {
          currentProfile = {
            ...defaultProfile(),
            ...input.profile,
          };
        } else {
          try {
            currentProfile = await fetchProfile({ db: input.db }, input.uid);
          } catch {
            currentProfile = defaultProfile();
          }
        }

        const updatedProfile: Profile = {
          ...currentProfile,
          extraExercises: [...(currentProfile.extraExercises ?? []), newExercise],
          updatedAt: new Date(),
        };

        if (input.onSaveProfile) {
          await input.onSaveProfile(updatedProfile);
        } else {
          await saveProfile({ db: input.db }, input.uid, updatedProfile);
        }

        setLocalExtraExercises((cur) => [...cur, newExercise]);

        const repsStr =
          newExercise.targetRepsMin === newExercise.targetRepsMax
            ? `${newExercise.targetRepsMin}`
            : `${newExercise.targetRepsMin}–${newExercise.targetRepsMax}`;
        setMessages((cur) => [
          ...cur,
          {
            role: "model",
            text: `Added ${newExercise.name} (${newExercise.targetSets} sets × ${repsStr} reps) to your extra exercises. It will appear at the end of every workout.`,
          },
        ]);
      } catch {
        setMessages((cur) => [
          ...cur,
          {
            role: "model",
            text: `Could not save ${pending.name}. Check your connection and try again.`,
          },
        ]);
      }
    },
    [extraExercises, input],
  );

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
        // 1. Pending confirmation check
        if (pendingAdditionRef.current) {
          const pending = pendingAdditionRef.current;
          if (isConfirmationAccept(trimmed)) {
            pendingAdditionRef.current = null;
            await savePendingAddition(pending);
            return;
          }
          if (isConfirmationDecline(trimmed)) {
            pendingAdditionRef.current = null;
            setMessages((cur) => [
              ...cur,
              { role: "model", text: "Okay, I won't add that exercise." },
            ]);
            return;
          }
          // Subject change: drop pending addition quietly
          pendingAdditionRef.current = null;
        }

        // 2. Awaiting name check
        if (awaitingNameRef.current) {
          const slotsAwaiting = awaitingNameRef.current;
          const extracted = extractExerciseSlots(trimmed);
          const resolvedName =
            extracted.name ?? (extracted.unresolvedMuscle ? null : toTitleCase(trimmed));
          if (resolvedName) {
            awaitingNameRef.current = null;
            const targetSets =
              extracted.targetSets !== 2 ? extracted.targetSets : slotsAwaiting.targetSets;
            const targetRepsMin =
              extracted.targetRepsMin !== 10
                ? extracted.targetRepsMin
                : slotsAwaiting.targetRepsMin;
            const targetRepsMax =
              extracted.targetRepsMax !== 10
                ? extracted.targetRepsMax
                : slotsAwaiting.targetRepsMax;
            promptConfirmation({
              name: resolvedName,
              targetSets,
              targetRepsMin,
              targetRepsMax,
            });
            return;
          } else {
            awaitingNameRef.current = null;
          }
        }

        // 3. Classify question
        const classified = classifyQuestion({
          question: trimmed,
          knownExercises,
        });

        // 4. Handle addExercise intent
        if (classified.intent === "addExercise") {
          const slots = classified.slots ?? extractExerciseSlots(trimmed);
          if (!slots.name) {
            if (slots.unresolvedMuscle) {
              setMessages((cur) => [
                ...cur,
                {
                  role: "model",
                  text: `Which ${slots.unresolvedMuscle} exercise would you like to add? Let me know the exercise name, and optionally the sets and reps.`,
                },
              ]);
            } else {
              setMessages((cur) => [
                ...cur,
                {
                  role: "model",
                  text: "Which exercise would you like to add? Let me know the exercise name, and optionally the sets and reps.",
                },
              ]);
            }
            awaitingNameRef.current = {
              targetSets: slots.targetSets,
              targetRepsMin: slots.targetRepsMin,
              targetRepsMax: slots.targetRepsMax,
            };
            return;
          }

          promptConfirmation({
            name: slots.name,
            targetSets: slots.targetSets,
            targetRepsMin: slots.targetRepsMin,
            targetRepsMax: slots.targetRepsMax,
          });
          return;
        }

        // 5. Existing Q&A pipeline (grounded facts + Gemini)
        let loadedFacts: ProgressFacts;
        try {
          loadedFacts = facts ?? (await loadFacts());
        } catch {
          setError("Could not load the facts for your question. Check your connection and retry.");
          return;
        }

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
    [
      busy,
      facts,
      input.app,
      input.today,
      knownExercises,
      loadFacts,
      messages,
      promptConfirmation,
      savePendingAddition,
    ],
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
