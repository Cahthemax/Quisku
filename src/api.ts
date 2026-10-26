import type {
  User,
  Exam,
  Question,
  Attempt,
  AuditLogEntry,
  ViolationType,
  ServerSessionResponse,
} from './types';

let authToken: string | null = localStorage.getItem('sadit_token');
let csrfToken: string | null = localStorage.getItem('sadit_csrf');
let serverTimeOffsetMs = 0;

export function setAuthCredentials(token: string | null, csrf: string | null, serverTimeIso?: string) {
  authToken = token;
  csrfToken = csrf;
  if (token && csrf) {
    localStorage.setItem('sadit_token', token);
    localStorage.setItem('sadit_csrf', csrf);
  } else {
    localStorage.removeItem('sadit_token');
    localStorage.removeItem('sadit_csrf');
  }
  if (serverTimeIso) {
    updateServerTimeOffset(serverTimeIso);
  }
}

export function updateServerTimeOffset(serverTimeIso: string) {
  const srvMs = new Date(serverTimeIso).getTime();
  if (!Number.isNaN(srvMs)) {
    serverTimeOffsetMs = srvMs - Date.now();
  }
}

export function getAuthoritativeNowMs(): number {
  return Date.now() + serverTimeOffsetMs;
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (csrfToken) {
    headers['x-csrf-token'] = csrfToken;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (data && typeof data.serverTime === 'string') {
    updateServerTimeOffset(data.serverTime);
  }

  if (!response.ok) {
    throw new Error(data.error || `Terjadi kesalahan jaringan (${response.status})`);
  }

  return data as T;
}

export interface PublicOverviewResponse {
  serverTime: string;
  activeExams: Array<{
    id: string;
    title: string;
    subject: string;
    kelas: string;
    code: string;
    durationMinutes: number;
    startTime: string;
    endTime: string;
    kkm: number;
  }>;
  demoStudents: Array<{
    username: string;
    fullName: string;
    kelas?: string;
    nisn?: string;
    pin: string;
  }>;
  demoTeachers: Array<{
    username: string;
    fullName: string;
    nip?: string;
    password: string;
  }>;
}

export const api = {
  getOverview: () => apiFetch<PublicOverviewResponse>('/api/public/overview'),

  syncServerTime: () => apiFetch<{ serverTime: string }>('/api/time'),

  resetDemoData: () =>
    apiFetch<{ message: string; serverTime: string }>('/api/public/reset-demo', {
      method: 'POST',
    }),

  login: (username: string, secret: string, role: 'TEACHER' | 'STUDENT') =>
    apiFetch<ServerSessionResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, secret, role }),
    }),

  logout: () =>
    apiFetch<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  // Teacher APIs
  getTeacherDashboard: () =>
    apiFetch<{
      serverTime: string;
      exams: Exam[];
      questions: Question[];
      attempts: Attempt[];
      auditLogs: AuditLogEntry[];
      students: Array<User & { pin: string }>;
    }>('/api/teacher/dashboard'),

  saveExam: (exam: Partial<Exam>) =>
    apiFetch<{ exam: Exam }>('/api/teacher/exams', {
      method: 'POST',
      body: JSON.stringify(exam),
    }),

  deleteExam: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/teacher/exams/${id}`, {
      method: 'DELETE',
    }),

  saveQuestion: (question: Partial<Question>) =>
    apiFetch<{ question: Question }>('/api/teacher/questions', {
      method: 'POST',
      body: JSON.stringify(question),
    }),

  deleteQuestion: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/teacher/questions/${id}`, {
      method: 'DELETE',
    }),

  unlockAttempt: (attemptId: string) =>
    apiFetch<{ attempt: Attempt }>(`/api/teacher/attempts/${attemptId}/unlock`, {
      method: 'POST',
    }),

  gradeAttempt: (
    attemptId: string,
    essayScores: Record<string, number>,
    teacherNotes: string
  ) =>
    apiFetch<{ attempt: Attempt }>(`/api/teacher/attempts/${attemptId}/grade`, {
      method: 'POST',
      body: JSON.stringify({ essayScores, teacherNotes }),
    }),

  // Student APIs
  verifyExamCode: (code: string) =>
    apiFetch<{
      serverTime: string;
      exam: Exam;
      questionCount: number;
      existingAttempt: Attempt | null;
    }>('/api/student/verify-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  startExam: (examId: string) =>
    apiFetch<{
      serverTime: string;
      exam: Exam;
      attempt: Attempt;
      questions: Question[];
    }>('/api/student/start-exam', {
      method: 'POST',
      body: JSON.stringify({ examId }),
    }),

  autosaveAttempt: (
    attemptId: string,
    answers: Record<string, string>,
    doubtful: Record<string, boolean>
  ) =>
    apiFetch<{
      serverTime: string;
      lastSavedAt: string;
      status: Attempt['status'];
      violationsCount: number;
      autoSubmitted?: boolean;
      attempt?: Attempt;
    }>(`/api/student/attempts/${attemptId}/autosave`, {
      method: 'POST',
      body: JSON.stringify({ answers, doubtful }),
    }),

  logViolation: (
    attemptId: string,
    type: ViolationType,
    description: string,
    answers: Record<string, string>,
    doubtful: Record<string, boolean>
  ) =>
    apiFetch<{
      serverTime: string;
      attempt: Attempt;
      latestLog?: AuditLogEntry;
    }>(`/api/student/attempts/${attemptId}/violation`, {
      method: 'POST',
      body: JSON.stringify({ type, description, answers, doubtful }),
    }),

  verifySupervisorPin: (attemptId: string, supervisorPin: string) =>
    apiFetch<{
      serverTime: string;
      attempt: Attempt;
    }>(`/api/student/attempts/${attemptId}/verify-supervisor`, {
      method: 'POST',
      body: JSON.stringify({ supervisorPin }),
    }),

  submitExam: (
    attemptId: string,
    answers: Record<string, string>,
    doubtful: Record<string, boolean>,
    submitReason: 'MANUAL' | 'TIME_EXPIRED' | 'MAX_VIOLATIONS' = 'MANUAL'
  ) =>
    apiFetch<{
      serverTime: string;
      allowSeeResult: boolean;
      kkm: number;
      attempt: Attempt;
      questionsWithKey: Question[];
    }>(`/api/student/attempts/${attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers, doubtful, submitReason }),
    }),
};
