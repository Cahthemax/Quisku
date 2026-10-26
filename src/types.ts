export type UserRole = 'TEACHER' | 'STUDENT';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  kelas?: string;
  nisn?: string;
  nip?: string;
}

export type QuestionType = 'PG' | 'ISIAN' | 'BS' | 'URAIAN';

export interface QuestionOption {
  key: 'A' | 'B' | 'C' | 'D' | 'E';
  text: string;
}

export interface Question {
  id: string;
  examId: string;
  subject: string;
  type: QuestionType;
  text: string;
  options?: QuestionOption[];
  correctAns?: string; // For PG ('A'-'E'), BS ('BENAR'|'SALAH'), ISIAN (expected text), URAIAN (reference answer/keywords)
  points: number;
  explanation?: string;
}

export type ViolationAction = 'SUSPEND' | 'AUTO_SUBMIT';

export interface ExamSecurityConfig {
  requireFullscreen: boolean;
  detectTabSwitch: boolean;
  detectWindowBlur: boolean;
  preventCopyPaste: boolean;
  maxViolations: number;
  violationAction: ViolationAction;
  autosaveIntervalSec: number;
  shuffleQuestions: boolean;
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  kelas: string;
  code: string;
  durationMinutes: number;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  kkm: number;
  allowSeeResult: boolean;
  supervisorPin: string;
  instructions: string[];
  security: ExamSecurityConfig;
  createdAt: string;
}

export type AttemptStatus = 'IN_PROGRESS' | 'SUSPENDED' | 'SUBMITTED';

export type ViolationType =
  | 'EXIT_FULLSCREEN'
  | 'TAB_SWITCH'
  | 'WINDOW_BLUR'
  | 'COPY_PASTE_ATTEMPT'
  | 'SUSPENDED_AUTO'
  | 'TEACHER_UNLOCK';

export interface AuditLogEntry {
  id: string;
  attemptId: string;
  examId: string;
  examCode: string;
  studentId: string;
  studentName: string;
  studentKelas: string;
  type: ViolationType;
  description: string;
  timestamp: string;
  violationCountAtEvent: number;
}

export interface Attempt {
  id: string;
  examId: string;
  examCode: string;
  studentId: string;
  studentName: string;
  studentKelas: string;
  startedAt: string;
  expiresAt: string;
  submittedAt?: string;
  lastSavedAt: string;
  status: AttemptStatus;
  answers: Record<string, string>;
  doubtful: Record<string, boolean>;
  essayScores: Record<string, number>;
  violationsCount: number;
  objectiveScore: number;
  essayScoreTotal: number;
  finalScore: number;
  maxPossibleScore: number;
  passedKkm: boolean;
  teacherNotes?: string;
  submitReason?: 'MANUAL' | 'TIME_EXPIRED' | 'MAX_VIOLATIONS';
}

export interface ServerSessionResponse {
  user: User;
  token: string;
  csrfToken: string;
  serverTime: string;
}
