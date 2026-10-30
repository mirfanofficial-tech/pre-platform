import { api } from "./api";
import type { components } from "./api-types";

type S = components["schemas"];
export type AttemptState = S["AttemptState"];
export type Question = S["QuestionOut"];
export type SavedAnswer = S["SavedAnswer"];
export type Check = S["CheckOut"];
export type AttemptResult = S["AttemptResult"];
export type ReviewItem = S["ReviewItem"];
export type AttemptSummary = S["AttemptSummary"];
export type MockTest = S["MockTestOut"];
export type Bookmark = S["BookmarkOut"];
export type AnswerIn = Omit<S["AnswerIn"], "clear"> & { clear?: boolean };
export type ExamDetail = S["ExamDetail"];
export type ExamSummary = S["ExamSummary"];
export type Progress = S["ProgressOut"];
export type Leaderboard = S["LeaderboardOut"];
export type LeaderboardEntry = S["LeaderboardEntry"];

const base = "/api/v1";

export const listMockTests = (exam?: string) =>
  api<MockTest[]>(`${base}/mock-tests${exam ? `?exam=${encodeURIComponent(exam)}` : ""}`);

export const startMock = (mockId: string) =>
  api<AttemptState>(`${base}/mock-tests/${mockId}/attempts`, { method: "POST" });

export const startPractice = (body: {
  exam: string;
  subject_id?: string;
  count?: number;
  mode?: "practice" | "test";
}) => api<AttemptState>(`${base}/practice/sets`, { method: "POST", body });

export const getAttempt = (id: string) => api<AttemptState>(`${base}/attempts/${id}`);

export const saveAnswers = (id: string, answers: AnswerIn[]) =>
  api<{ saved: number; server_now: string }>(`${base}/attempts/${id}/answers`, {
    method: "PUT",
    body: { answers },
  });

export const checkAnswer = (id: string, questionId: string, optionId: string) =>
  api<Check>(`${base}/attempts/${id}/questions/${questionId}/check`, {
    method: "POST",
    body: { option_id: optionId },
  });

export const submitAttempt = (id: string) =>
  api<AttemptResult>(`${base}/attempts/${id}/submit`, { method: "POST" });

export const getResult = (id: string) => api<AttemptResult>(`${base}/attempts/${id}/result`);
export const getReview = (id: string) => api<ReviewItem[]>(`${base}/attempts/${id}/review`);

export const myAttempts = (type?: "practice" | "mock", limit = 20) =>
  api<AttemptSummary[]>(`${base}/me/attempts?limit=${limit}${type ? `&type=${type}` : ""}`);

export const listExams = () => api<ExamSummary[]>(`${base}/exams`);

export const getExam = (slug: string) => api<ExamDetail>(`${base}/exams/${slug}`);

export const listBookmarks = () => api<Bookmark[]>(`${base}/me/bookmarks`);
export const addBookmark = (questionId: string) =>
  api<void>(`${base}/me/bookmarks/${questionId}`, { method: "PUT" });
export const removeBookmark = (questionId: string) =>
  api<void>(`${base}/me/bookmarks/${questionId}`, { method: "DELETE" });

/** Milliseconds to add to Date.now() to get the server's current time. */
export const clockOffset = (serverNow: string) => Date.parse(serverNow) - Date.now();

export function secondsLeft(deadlineAt: string | null, offsetMs: number) {
  if (!deadlineAt) return null;
  return Math.max(0, Math.ceil((Date.parse(deadlineAt) - (Date.now() + offsetMs)) / 1000));
}

export const getProgress = () => api<Progress>(`${base}/me/progress`);

export const getLeaderboard = (period: "week" | "all") =>
  api<Leaderboard>(`${base}/leaderboard?period=${period}`);
