import 'server-only';
import { getDb } from './index';
import { questionById, questionFor, questionStats, type Question, type QuestionStats } from '../lib/dailyQuestion';

/*
  The daily question's answers (051): one per day, final once given.
*/

export interface DayAnswer { day: string; question_id: string; choice: number; correct: boolean; answered_at: string }

const read = (r: Record<string, unknown>): DayAnswer => ({ ...(r as unknown as DayAnswer), correct: r.correct === 1 });

export function listAnswers(): DayAnswer[] {
  return (getDb().prepare('SELECT * FROM daily_answers ORDER BY day DESC').all() as Record<string, unknown>[]).map(read);
}

/** Today's question, without its answer until it has been answered. */
export function todaysQuestion(day: string): {
  question: Omit<Question, 'answer' | 'why'> & Partial<Pick<Question, 'answer' | 'why'>>;
  answered: DayAnswer | null; stats: QuestionStats; recent: Array<DayAnswer & { q: string; options: string[]; answer: number; why: string }>;
} {
  const q = questionFor(day);
  const answers = listAnswers();
  const answered = answers.find((a) => a.day === day) ?? null;
  // A day answered before keeps the question it was asked, even if the deck changed since.
  const asked = answered ? questionById(answered.question_id) ?? q : q;
  const { answer, why, ...open } = asked;
  return {
    question: answered ? { ...open, answer, why } : open,
    answered,
    stats: questionStats(answers, day),
    recent: answers.filter((a) => a.day !== day).slice(0, 7).flatMap((a) => {
      const x = questionById(a.question_id);
      return x ? [{ ...a, q: x.q, options: [...x.options], answer: x.answer, why: x.why }] : [];
    }),
  };
}

/** The one answer for the day. A second answer is refused: the first is the honest one. */
export function answerToday(day: string, choice: number): DayAnswer & { answer: number; why: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('The day is YYYY-MM-DD.');
  if (!Number.isInteger(choice) || choice < 0 || choice > 3) throw new Error('Pick one of the four answers.');
  if (getDb().prepare('SELECT 1 FROM daily_answers WHERE day = ?').get(day)) throw new Error('Today’s question is already answered — a new one tomorrow.');
  const q = questionFor(day);
  const correct = choice === q.answer;
  getDb().prepare('INSERT INTO daily_answers (day, question_id, choice, correct) VALUES (?, ?, ?, ?)').run(day, q.id, choice, correct ? 1 : 0);
  return { ...(listAnswers().find((a) => a.day === day)!), answer: q.answer, why: q.why };
}
