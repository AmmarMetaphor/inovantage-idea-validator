import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { DRAFT_STORAGE } from '@/config/product';
import type { Answers, AnswerValue } from './types';

/*
  Questionnaire state lives in memory by default. Answers can include personal
  financial details, so nothing is written to localStorage. Session-only
  persistence (this tab, cleared when the tab closes) can be enabled with
  VITE_DRAFT_STORAGE=session.
*/

const SESSION_KEY = 'inovantage.draft.v1';

interface State {
  answers: Answers;
  /** Highest step index the customer has reached (for the stepper). */
  furthestStep: number;
  /** Set once the customer has visited the review page. */
  reviewed: boolean;
}

type Action =
  | { type: 'set'; id: string; value: AnswerValue | undefined }
  | { type: 'setMany'; values: Answers }
  | { type: 'reach'; step: number }
  | { type: 'reviewed' }
  | { type: 'reset' };

const initialState: State = { answers: {}, furthestStep: 0, reviewed: false };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'set':
      return { ...state, answers: { ...state.answers, [action.id]: action.value } };
    case 'setMany':
      return { ...state, answers: { ...state.answers, ...action.values } };
    case 'reach':
      return { ...state, furthestStep: Math.max(state.furthestStep, action.step) };
    case 'reviewed':
      return { ...state, reviewed: true };
    case 'reset':
      return initialState;
  }
}

function loadInitial(): State {
  if (DRAFT_STORAGE !== 'session' || typeof window === 'undefined') return initialState;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      answers: parsed.answers ?? {},
      furthestStep: parsed.furthestStep ?? 0,
      reviewed: parsed.reviewed ?? false,
    };
  } catch {
    return initialState;
  }
}

interface QuestionnaireContextValue extends State {
  setAnswer: (id: string, value: AnswerValue | undefined) => void;
  setAnswers: (values: Answers) => void;
  reachStep: (step: number) => void;
  markReviewed: () => void;
  reset: () => void;
}

const QuestionnaireContext = createContext<QuestionnaireContextValue | null>(null);

export function QuestionnaireProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);

  useEffect(() => {
    if (DRAFT_STORAGE !== 'session') return;
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    } catch {
      /* storage may be unavailable (private mode); ignore */
    }
  }, [state]);

  const setAnswer = useCallback(
    (id: string, value: AnswerValue | undefined) => dispatch({ type: 'set', id, value }),
    [],
  );
  const setAnswers = useCallback((values: Answers) => dispatch({ type: 'setMany', values }), []);
  const reachStep = useCallback((step: number) => dispatch({ type: 'reach', step }), []);
  const markReviewed = useCallback(() => dispatch({ type: 'reviewed' }), []);
  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ ...state, setAnswer, setAnswers, reachStep, markReviewed, reset }),
    [state, setAnswer, setAnswers, reachStep, markReviewed, reset],
  );

  return <QuestionnaireContext.Provider value={value}>{children}</QuestionnaireContext.Provider>;
}

export function useQuestionnaire(): QuestionnaireContextValue {
  const ctx = useContext(QuestionnaireContext);
  if (!ctx) throw new Error('useQuestionnaire must be used inside QuestionnaireProvider');
  return ctx;
}
