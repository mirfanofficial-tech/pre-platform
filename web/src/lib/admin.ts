import { API_URL, api, ApiError } from "./api";
import type { components } from "./api-types";

type S = components["schemas"];
export type AdminStats = S["AdminStats"];
export type QuestionPage = S["QuestionPage"];
export type QuestionRow = S["QuestionRow"];
export type AdminQuestion = S["QuestionAdminOut"];
export type QuestionBody = S["QuestionIn"];
export type ImportResult = S["ImportResult"];
export type StudentPage = S["StudentPage"];
export type StudentRow = S["StudentRow"];
export type AdminPaymentPage = S["AdminPaymentPage"];
export type ReportRow = S["ReportRow"];
export type AuditRow = S["AuditRow"];

const base = "/api/v1/admin";

const query = (params: Record<string, string | number | undefined | null>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : "";
};

export const getAdminStats = () => api<AdminStats>(`${base}/stats`);

export const listAdminQuestions = (p: {
  exam?: string;
  status?: string;
  q?: string;
  page?: number;
  page_size?: number;
}) => api<QuestionPage>(`${base}/questions${query(p)}`);
export const getAdminQuestion = (id: string) => api<AdminQuestion>(`${base}/questions/${id}`);
export const createQuestion = (body: QuestionBody) =>
  api<AdminQuestion>(`${base}/questions`, { method: "POST", body });
export const updateQuestion = (id: string, body: QuestionBody) =>
  api<AdminQuestion>(`${base}/questions/${id}`, { method: "PUT", body });
export const transitionQuestion = (id: string, to: string) =>
  api<AdminQuestion>(`${base}/questions/${id}/transition`, { method: "POST", body: { to } });

/** The body is raw CSV text, so this bypasses the JSON helper. */
export async function importQuestions(exam: string, csv: string, dryRun: boolean): Promise<ImportResult> {
  const res = await fetch(`${API_URL}${base}/questions/import${query({ exam, dry_run: String(dryRun) })}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "text/csv", "X-CSRF": "1" },
    body: csv,
  });
  if (!res.ok) {
    const problem = await res.json().catch(() => null);
    throw new ApiError(problem ?? { type: "about:blank", title: res.statusText, status: res.status, code: "error" });
  }
  return res.json();
}

export const listStudents = (p: { q?: string; role?: string; page?: number }) =>
  api<StudentPage>(`${base}/students${query(p)}`);
export const patchStudent = (id: string, body: { status?: string; role?: string }) =>
  api<void>(`${base}/students/${id}`, { method: "PATCH", body });
export const grantPremium = (id: string, planCode: string, days?: number) =>
  api<void>(`${base}/students/${id}/premium`, { method: "POST", body: { plan_code: planCode, days } });
export const revokePremium = (id: string) => api<void>(`${base}/students/${id}/premium`, { method: "DELETE" });

export const listAdminPayments = (p: { status?: string; page?: number }) =>
  api<AdminPaymentPage>(`${base}/payments${query(p)}`);
export const refundPayment = (id: string) => api<void>(`${base}/payments/${id}/refund`, { method: "POST" });

export const listReports = (status: string) => api<ReportRow[]>(`${base}/reports${query({ status })}`);
export const resolveReport = (id: string, status: "resolved" | "dismissed") =>
  api<void>(`${base}/reports/${id}/resolve`, { method: "POST", body: { status } });

export const listAudit = () => api<AuditRow[]>(`${base}/audit`);

export const IMPORT_TEMPLATE =
  "subject,topic,difficulty,question,option_a,option_b,option_c,option_d,correct,explanation\n" +
  'English,Tenses,easy,"Which sentence is correct?",He go home,He goes home,He going home,He gone home,B,Third person singular takes -s.\n';

// ---- exams, subjects, topics ------------------------------------------------------------------
export type ExamAdmin = S["ExamAdmin"];
export type ExamBody = S["ExamIn"];
export type ExamStructure = S["ExamStructure"];
export type SubjectAdmin = S["SubjectAdmin"];

export const listAdminExams = () => api<ExamAdmin[]>(`${base}/exams`);
export const createExam = (body: ExamBody) => api<ExamAdmin>(`${base}/exams`, { method: "POST", body });
export const updateExam = (slug: string, body: ExamBody) =>
  api<ExamAdmin>(`${base}/exams/${slug}`, { method: "PUT", body });
export const getStructure = (slug: string) => api<ExamStructure>(`${base}/exams/${slug}/structure`);

type SubjectBody = { name: string; kind: "mcq" | "written"; sort: number };
export const createSubject = (slug: string, body: SubjectBody) =>
  api<SubjectAdmin>(`${base}/exams/${slug}/subjects`, { method: "POST", body });
export const updateSubject = (id: string, body: SubjectBody) =>
  api<void>(`${base}/subjects/${id}`, { method: "PUT", body });
export const deleteSubject = (id: string) => api<void>(`${base}/subjects/${id}`, { method: "DELETE" });
export const createTopic = (subjectId: string, name: string) =>
  api<unknown>(`${base}/subjects/${subjectId}/topics`, { method: "POST", body: { name } });
export const renameTopic = (id: string, name: string) =>
  api<void>(`${base}/topics/${id}`, { method: "PUT", body: { name } });
export const deleteTopic = (id: string) => api<void>(`${base}/topics/${id}`, { method: "DELETE" });

// ---- mock tests ----------------------------------------------------------------------------------
export type MockAdmin = S["MockAdmin"];
export type MockDetail = S["MockDetail"];
export type MockBody = S["MockIn"];

export const listAdminMocks = () => api<MockAdmin[]>(`${base}/mock-tests`);
export const getAdminMock = (id: string) => api<MockDetail>(`${base}/mock-tests/${id}`);
export const createMock = (body: MockBody) => api<MockDetail>(`${base}/mock-tests`, { method: "POST", body });
export const updateMock = (id: string, body: MockBody) =>
  api<MockDetail>(`${base}/mock-tests/${id}`, { method: "PUT", body });
export const setMockQuestions = (id: string, questionIds: string[]) =>
  api<MockDetail>(`${base}/mock-tests/${id}/questions`, { method: "PUT", body: { question_ids: questionIds } });
export const setMockStatus = (id: string, status: "draft" | "published" | "archived") =>
  api<MockDetail>(`${base}/mock-tests/${id}/status`, { method: "PUT", body: { status } });
export const deleteMock = (id: string) => api<void>(`${base}/mock-tests/${id}`, { method: "DELETE" });
