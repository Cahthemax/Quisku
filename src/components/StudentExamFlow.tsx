import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Maximize2,
  Send,
  ChevronLeft,
  ChevronRight,
  Flag,
  Wifi,
  WifiOff,
  LogOut,
  FileCheck,
  KeyRound,
  HelpCircle,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';
import type { User, Exam, Question, Attempt, ViolationType } from '../types';
import { api, getAuthoritativeNowMs } from '../api';
import { useExamSecurity } from '../hooks/useExamSecurity';

interface StudentExamFlowProps {
  user: User;
  initialExamCode?: string;
  onLogout: () => void;
}

type FlowStep = 'CODE_ENTRY' | 'INSTRUCTIONS' | 'EXAM_ACTIVE' | 'FINISHED';

export const StudentExamFlow: React.FC<StudentExamFlowProps> = ({
  user,
  initialExamCode = '',
  onLogout,
}) => {
  const [step, setStep] = useState<FlowStep>('CODE_ENTRY');
  const [examCodeInput, setExamCodeInput] = useState(initialExamCode || 'MTK-XII-01');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Exam & Attempt State
  const [exam, setExam] = useState<Exam | null>(null);
  const [questionCount, setQuestionCount] = useState<number>(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [agreedRules, setAgreedRules] = useState(false);

  // Active Question & Answers State
  const [activeIdx, setActiveIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [doubtful, setDoubtful] = useState<Record<string, boolean>>({});

  // Autosave & Connection Recovery State
  const [saveStatus, setSaveStatus] = useState<'SAVED' | 'SAVING' | 'OFFLINE_CACHED'>('SAVED');
  const [lastSavedText, setLastSavedText] = useState<string>('');
  const [simulatedOffline, setSimulatedOffline] = useState<boolean>(false);

  // Server-Synchronized Timer State
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  // Security Warning & Confirmation Modals
  const [warningModal, setWarningModal] = useState<{
    open: boolean;
    type: ViolationType;
    description: string;
    count: number;
    max: number;
    timestamp: string;
  } | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  // Suspended Verification State
  const [supervisorPinInput, setSupervisorPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifyingPin, setVerifyingPin] = useState(false);

  // Finished Result State
  const [finishedData, setFinishedData] = useState<{
    allowSeeResult: boolean;
    kkm: number;
    attempt: Attempt;
    questionsWithKey: Question[];
  } | null>(null);

  const answersRef = useRef(answers);
  const doubtfulRef = useRef(doubtful);
  answersRef.current = answers;
  doubtfulRef.current = doubtful;

  // LocalStorage backup key
  const getBackupKey = (attemptId: string) => `sadit_local_answers_${attemptId}`;

  // Handle Violation Callback
  const handleViolationDetected = useCallback(
    async (type: ViolationType, description: string) => {
      if (!attempt || !exam || step !== 'EXAM_ACTIVE' || attempt.status !== 'IN_PROGRESS') {
        return;
      }

      // Always save to localStorage immediately
      try {
        localStorage.setItem(
          getBackupKey(attempt.id),
          JSON.stringify({
            answers: answersRef.current,
            doubtful: doubtfulRef.current,
            updatedAt: new Date().toISOString(),
          })
        );
      } catch {
        // Ignore storage quota errors
      }

      try {
        const res = await api.logViolation(
          attempt.id,
          type,
          description,
          answersRef.current,
          doubtfulRef.current
        );
        setAttempt(res.attempt);

        if (res.attempt.status === 'SUBMITTED') {
          setWarningModal(null);
          const submitRes = await api.submitExam(
            attempt.id,
            answersRef.current,
            doubtfulRef.current,
            'MAX_VIOLATIONS'
          );
          setFinishedData(submitRes);
          setStep('FINISHED');
          return;
        }

        if (res.attempt.status === 'SUSPENDED') {
          setWarningModal(null);
          return;
        }

        setWarningModal({
          open: true,
          type,
          description,
          count: res.attempt.violationsCount,
          max: exam.security.maxViolations,
          timestamp: new Date(res.serverTime).toLocaleTimeString('id-ID'),
        });
      } catch {
        // Offline fallback violation warning
        const nextCount = (attempt.violationsCount || 0) + 1;
        setAttempt((prev) => (prev ? { ...prev, violationsCount: nextCount } : prev));
        setWarningModal({
          open: true,
          type,
          description,
          count: nextCount,
          max: exam.security.maxViolations,
          timestamp: new Date().toLocaleTimeString('id-ID'),
        });
      }
    },
    [attempt, exam, step]
  );

  const {
    isFullscreen,
    enterFullscreen,
    exitFullscreenCleanly,
    triggerManualViolation,
  } = useExamSecurity({
    enabled: step === 'EXAM_ACTIVE' && attempt?.status === 'IN_PROGRESS',
    security: exam?.security || {
      requireFullscreen: true,
      detectTabSwitch: true,
      detectWindowBlur: true,
      preventCopyPaste: true,
      maxViolations: 3,
      violationAction: 'SUSPEND',
      autosaveIntervalSec: 15,
      shuffleQuestions: false,
    },
    onViolation: handleViolationDetected,
  });

  // Verify Exam Code Handler
  const handleVerifyCode = async (e?: React.FormEvent, codeOverride?: string) => {
    if (e) e.preventDefault();
    const targetCode = (codeOverride ?? examCodeInput).trim().toUpperCase();
    if (!targetCode) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.verifyExamCode(targetCode);
      setExam(res.exam);
      setQuestionCount(res.questionCount);
      if (res.existingAttempt) {
        setAttempt(res.existingAttempt);
      } else {
        setAttempt(null);
      }
      setStep('INSTRUCTIONS');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memverifikasi kode ujian.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-verify if initialExamCode was provided on login
  useEffect(() => {
    if (initialExamCode && initialExamCode.trim().length > 0) {
      handleVerifyCode(undefined, initialExamCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Perform Autosave to Server (with Offline Fallback)
  const syncAnswersToServer = useCallback(
    async (customAnswers?: Record<string, string>, customDoubtful?: Record<string, boolean>) => {
      if (!attempt || attempt.status !== 'IN_PROGRESS') return;

      const payloadAnswers = customAnswers ?? answersRef.current;
      const payloadDoubtful = customDoubtful ?? doubtfulRef.current;

      // 1. Always save to localStorage first
      try {
        localStorage.setItem(
          getBackupKey(attempt.id),
          JSON.stringify({
            answers: payloadAnswers,
            doubtful: payloadDoubtful,
            updatedAt: new Date().toISOString(),
          })
        );
      } catch {
        // Ignore
      }

      if (simulatedOffline || !navigator.onLine) {
        setSaveStatus('OFFLINE_CACHED');
        return;
      }

      setSaveStatus('SAVING');
      try {
        const res = await api.autosaveAttempt(attempt.id, payloadAnswers, payloadDoubtful);
        if (res.autoSubmitted && res.attempt) {
          await exitFullscreenCleanly();
          const finalRes = await api.submitExam(
            attempt.id,
            payloadAnswers,
            payloadDoubtful,
            'TIME_EXPIRED'
          );
          setFinishedData(finalRes);
          setStep('FINISHED');
          return;
        }
        setSaveStatus('SAVED');
        setLastSavedText(new Date(res.lastSavedAt).toLocaleTimeString('id-ID'));
      } catch {
        setSaveStatus('OFFLINE_CACHED');
      }
    },
    [attempt, simulatedOffline, exitFullscreenCleanly]
  );

  // Start Exam & Enter Fullscreen
  const handleStartExam = async () => {
    if (!exam) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      // Request Fullscreen immediately inside user click handler
      if (exam.security.requireFullscreen) {
        await enterFullscreen();
      }

      const res = await api.startExam(exam.id);
      setExam(res.exam);
      setQuestions(res.questions);
      setAttempt(res.attempt);

      // Check if localStorage has newer unsynced answers from an interrupted connection
      let mergedAnswers = { ...res.attempt.answers };
      let mergedDoubtful = { ...res.attempt.doubtful };
      try {
        const cachedRaw = localStorage.getItem(getBackupKey(res.attempt.id));
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (parsed.answers && typeof parsed.answers === 'object') {
            mergedAnswers = { ...mergedAnswers, ...parsed.answers };
          }
          if (parsed.doubtful && typeof parsed.doubtful === 'object') {
            mergedDoubtful = { ...mergedDoubtful, ...parsed.doubtful };
          }
        }
      } catch {
        // Ignore
      }

      setAnswers(mergedAnswers);
      setDoubtful(mergedDoubtful);
      setLastSavedText(new Date(res.attempt.lastSavedAt).toLocaleTimeString('id-ID'));

      if (res.attempt.status === 'SUBMITTED') {
        await exitFullscreenCleanly();
        const subRes = await api.submitExam(
          res.attempt.id,
          mergedAnswers,
          mergedDoubtful,
          res.attempt.submitReason || 'MANUAL'
        );
        setFinishedData(subRes);
        setStep('FINISHED');
      } else {
        setStep('EXAM_ACTIVE');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memulai sesi ujian.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Final Exam Handler
  const handleFinalSubmit = useCallback(
    async (reason: 'MANUAL' | 'TIME_EXPIRED' | 'MAX_VIOLATIONS' = 'MANUAL') => {
      if (!attempt) return;
      setLoading(true);
      setConfirmSubmitOpen(false);
      setWarningModal(null);

      try {
        await exitFullscreenCleanly();
        const res = await api.submitExam(
          attempt.id,
          answersRef.current,
          doubtfulRef.current,
          reason
        );
        localStorage.removeItem(getBackupKey(attempt.id));
        setFinishedData(res);
        setStep('FINISHED');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim jawaban ujian.');
      } finally {
        setLoading(false);
      }
    },
    [attempt, exitFullscreenCleanly]
  );

  // Server-Based Countdown Timer Effect
  useEffect(() => {
    if (step !== 'EXAM_ACTIVE' || !attempt || attempt.status === 'SUBMITTED') return;

    const updateTimer = () => {
      const expiresMs = new Date(attempt.expiresAt).getTime();
      const nowServerMs = getAuthoritativeNowMs();
      const diffSec = Math.max(0, Math.floor((expiresMs - nowServerMs) / 1000));
      setRemainingSeconds(diffSec);

      if (diffSec <= 0) {
        handleFinalSubmit('TIME_EXPIRED');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [step, attempt, handleFinalSubmit]);

  // Periodic Autosave Effect
  useEffect(() => {
    if (step !== 'EXAM_ACTIVE' || !attempt || attempt.status !== 'IN_PROGRESS') return;
    const intervalMs = (exam?.security.autosaveIntervalSec || 15) * 1000;
    const timer = setInterval(() => {
      syncAnswersToServer();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [step, attempt, exam, syncAnswersToServer]);

  // Re-sync immediately when coming back from simulated offline
  useEffect(() => {
    if (!simulatedOffline && step === 'EXAM_ACTIVE' && attempt?.status === 'IN_PROGRESS') {
      syncAnswersToServer();
    }
  }, [simulatedOffline, step, attempt?.status, syncAnswersToServer]);

  // Handle Answer Change
  const handleSelectAnswer = (questionId: string, value: string) => {
    const updated = { ...answers, [questionId]: value };
    setAnswers(updated);
    if (attempt) {
      try {
        localStorage.setItem(
          getBackupKey(attempt.id),
          JSON.stringify({
            answers: updated,
            doubtful,
            updatedAt: new Date().toISOString(),
          })
        );
      } catch {
        // Ignore
      }
    }
  };

  const handleToggleDoubtful = (questionId: string) => {
    const updated = { ...doubtful, [questionId]: !doubtful[questionId] };
    setDoubtful(updated);
    syncAnswersToServer(answers, updated);
  };

  // Verify Supervisor PIN to Unlock Suspended Exam
  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attempt || !supervisorPinInput.trim()) return;
    setVerifyingPin(true);
    setPinError(null);
    try {
      const res = await api.verifySupervisorPin(attempt.id, supervisorPinInput.trim());
      setAttempt(res.attempt);
      setSupervisorPinInput('');
      if (exam?.security.requireFullscreen) {
        await enterFullscreen();
      }
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'PIN Pengawas tidak valid.');
    } finally {
      setVerifyingPin(false);
    }
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const answeredCount = questions.filter(
    (q) => answers[q.id] && answers[q.id].trim().length > 0
  ).length;
  const doubtfulCount = questions.filter((q) => doubtful[q.id]).length;
  const unansweredCount = questions.length - answeredCount;
  const currentQuestion = questions[activeIdx];

  return (
    <div
      className={`min-h-screen bg-slate-50 text-slate-900 flex flex-col ${
        step === 'EXAM_ACTIVE' && exam?.security.preventCopyPaste ? 'exam-unselectable' : ''
      }`}
    >
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold tracking-tight text-blue-700 whitespace-nowrap shrink-0">
              SADIT Exam Portal
            </span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="text-xs font-medium text-slate-600 truncate max-w-xs">
              {user.fullName} ({user.kelas || 'Siswa'})
            </span>
          </div>

          {/* Workflow Progress Breadcrumb */}
          <div className="hidden lg:flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className={step === 'CODE_ENTRY' ? 'text-blue-700 font-bold' : ''}>
              1. Kode Ujian
            </span>
            <span>→</span>
            <span className={step === 'INSTRUCTIONS' ? 'text-blue-700 font-bold' : ''}>
              2. Instruksi
            </span>
            <span>→</span>
            <span className={step === 'EXAM_ACTIVE' ? 'text-blue-700 font-bold' : ''}>
              3. Exam Mode & Soal
            </span>
            <span>→</span>
            <span className={step === 'FINISHED' ? 'text-blue-700 font-bold' : ''}>
              4. Selesai
            </span>
          </div>

          {/* Right Status / Action */}
          <div className="flex items-center gap-3 shrink-0">
            {step === 'EXAM_ACTIVE' && attempt?.status === 'IN_PROGRESS' ? (
              <div className="flex items-center gap-3">
                {/* Violation Counter */}
                <div
                  className={`text-xs font-mono font-semibold px-3 py-1.5 rounded-lg border tabular-nums ${
                    attempt.violationsCount > 0
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  Pelanggaran: {attempt.violationsCount}/{exam?.security.maxViolations ?? 3}
                </div>

                {/* Server Timer */}
                <div
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-mono text-sm font-bold tabular-nums border ${
                    remainingSeconds <= 300
                      ? 'bg-red-600 text-white border-red-700'
                      : 'bg-blue-600 text-white border-blue-700'
                  }`}
                >
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>{formatTimer(remainingSeconds)}</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={onLogout}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar Akun</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* =====================================================================
          STEP 1: KODE UJIAN ENTRY
      ===================================================================== */}
      {step === 'CODE_ENTRY' && (
        <main className="flex-1 max-w-xl w-full mx-auto px-6 py-12 flex flex-col justify-center">
          <div className="bg-white rounded-xl border border-slate-200 p-8 space-y-6">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-blue-700">
                Langkah 1 dari 4 · Verifikasi Sesi Ujian
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Masukkan Kode Ujian</h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                Selamat datang, <strong className="text-slate-800">{user.fullName}</strong> (NISN:{' '}
                <span className="font-mono tabular-nums">{user.nisn || '-'}</span>). Masukkan kode
                ujian resmi yang diberikan oleh Guru Pengawas untuk membuka lembar instruksi.
              </p>
            </div>

            {errorMsg && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">Akses Ujian Ditolak</div>
                  <div>{errorMsg}</div>
                </div>
              </div>
            )}

            <form onSubmit={(e) => handleVerifyCode(e)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Kode Ujian (Token Ruangan)
                </label>
                <input
                  type="text"
                  required
                  value={examCodeInput}
                  onChange={(e) => setExamCodeInput(e.target.value.toUpperCase())}
                  placeholder="Contoh: MTK-XII-01"
                  className="w-full px-4 py-3 text-base font-mono font-bold uppercase tracking-widest text-center bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              >
                {loading ? 'Memeriksa Jadwal Server...' : 'Lanjutkan ke Instruksi Ujian'}
              </button>
            </form>

            {/* Quick Code Buttons for Testing */}
            <div className="pt-4 border-t border-slate-200 space-y-2.5">
              <div className="text-xs font-semibold text-slate-600">
                Pilih Cepat Kode Ujian Tersedia:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExamCodeInput('MTK-XII-01');
                    handleVerifyCode(undefined, 'MTK-XII-01');
                  }}
                  className="p-2.5 text-left rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-colors cursor-pointer"
                >
                  <div className="font-mono text-xs font-bold text-blue-700">MTK-XII-01</div>
                  <div className="text-[11px] text-slate-600 truncate">Kalkulus (Jadwal Aktif)</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExamCodeInput('BIO-XI-02');
                    handleVerifyCode(undefined, 'BIO-XI-02');
                  }}
                  className="p-2.5 text-left rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-colors cursor-pointer"
                >
                  <div className="font-mono text-xs font-bold text-blue-700">BIO-XI-02</div>
                  <div className="text-[11px] text-slate-600 truncate">Biologi (Nilai Tertutup)</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExamCodeInput('LIT-XII-03');
                    handleVerifyCode(undefined, 'LIT-XII-03');
                  }}
                  className="p-2.5 text-left rounded-lg border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition-colors cursor-pointer"
                >
                  <div className="font-mono text-xs font-bold text-amber-700">LIT-XII-03</div>
                  <div className="text-[11px] text-slate-600 truncate">Simulasi (Belum Mulai)</div>
                </button>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* =====================================================================
          STEP 2: HALAMAN INSTRUKSI UJIAN
      ===================================================================== */}
      {step === 'INSTRUCTIONS' && exam && (
        <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-10">
          <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-blue-700">
                  Langkah 2 dari 4 · Instruksi & Pakta Integritas Peserta
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{exam.title}</h1>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Mata Pelajaran: {exam.subject}</span>
                  <span aria-hidden="true">·</span>
                  <span>Kelas: {exam.kelas}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono font-semibold text-slate-800">Kode: {exam.code}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep('CODE_ENTRY')}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors self-start whitespace-nowrap shrink-0 cursor-pointer"
              >
                Ganti Kode Ujian
              </button>
            </div>

            {/* Exam Parameter Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">Durasi Ujian</div>
                <div className="text-lg font-bold font-mono text-slate-900 tabular-nums mt-0.5">
                  {exam.durationMinutes} Menit
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">Jumlah Soal</div>
                <div className="text-lg font-bold font-mono text-slate-900 tabular-nums mt-0.5">
                  {questionCount} Butir Soal
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">Standar KKM</div>
                <div className="text-lg font-bold font-mono text-slate-900 tabular-nums mt-0.5">
                  {exam.kkm} / 100
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">Batas Pelanggaran</div>
                <div className="text-lg font-bold font-mono text-amber-700 tabular-nums mt-0.5">
                  Maks. {exam.security.maxViolations}x
                </div>
              </div>
            </div>

            {/* Instructions List */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <span>Tata Tertib & Petunjuk Pengerjaan (Exam Mode)</span>
              </h2>
              <ol className="space-y-2 text-xs sm:text-sm text-slate-700 list-decimal list-inside bg-slate-50 p-5 rounded-xl border border-slate-200">
                {exam.instructions.map((inst, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {inst}
                  </li>
                ))}
              </ol>
            </div>

            {/* Privacy & Anti-Loss Guarantee */}
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-1.5 text-xs text-slate-700">
              <div className="font-bold text-blue-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Jaminan Keamanan Jawaban & Privasi Siswa</span>
              </div>
              <p className="leading-relaxed">
                Sistem ini <strong>tidak menggunakan kamera/mikrofon</strong> dan tidak mengambil
                data pribadi di luar sesi ujian. Apabila terjadi pelanggaran fokus layar atau
                terputusnya jaringan internet, <strong>jawaban Anda tidak akan dihapus</strong> dan
                tetap tersimpan melalui fitur Autosave berkala.
              </p>
            </div>

            {attempt && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-4">
                <div>
                  <span className="font-bold">Sesi Ujian Sebelumnya Ditemukan: </span>
                  Status saat ini adalah{' '}
                  <strong className="font-mono uppercase">{attempt.status}</strong> dengan{' '}
                  <strong className="font-mono tabular-nums">{attempt.violationsCount}</strong>{' '}
                  catatan pelanggaran. Jawaban Anda telah dipulihkan.
                </div>
              </div>
            )}

            {/* Agreement Checkbox */}
            <label className="flex items-start gap-3 p-4 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedRules}
                onChange={(e) => setAgreedRules(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <span className="text-xs sm:text-sm text-slate-700 font-medium">
                Saya menyatakan telah membaca seluruh instruksi ujian, memahami aturan Exam Mode,
                dan bersedia mengerjakan ujian secara jujur dalam mode layar penuh (Fullscreen).
              </span>
            </label>

            {errorMsg && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={!agreedRules || loading}
                onClick={handleStartExam}
                className="w-full sm:w-auto px-6 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Maximize2 className="w-4 h-4 shrink-0" />
                <span>
                  {loading
                    ? 'Menyiapkan Lembar Soal...'
                    : attempt?.status === 'SUBMITTED'
                    ? 'Lihat Bukti Selesai Ujian'
                    : 'MULAI UJIAN (AKTIFKAN EXAM MODE)'}
                </span>
              </button>
            </div>
          </div>
        </main>
      )}

      {/* =====================================================================
          STEP 3A: UJIAN DITANGGUHKAN (SUSPENDED BY VIOLATIONS)
      ===================================================================== */}
      {step === 'EXAM_ACTIVE' && attempt && attempt.status === 'SUSPENDED' && exam && (
        <main className="flex-1 max-w-xl w-full mx-auto px-6 py-12 flex flex-col justify-center">
          <div className="bg-white rounded-xl border-2 border-red-300 p-8 space-y-6">
            <div className="flex items-center gap-3 text-red-600">
              <Lock className="w-8 h-8 shrink-0" />
              <div>
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-red-700">
                  Kode Keamanan: EXAM_SUSPENDED
                </div>
                <h1 className="text-2xl font-bold text-slate-900">Ujian Ditangguhkan</h1>
              </div>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              Sistem mendeteksi aktivitas meninggalkan halaman ujian yang telah melewati batas
              maksimal (
              <strong className="font-mono tabular-nums">
                {attempt.violationsCount} dari {exam.security.maxViolations} pelanggaran
              </strong>
              ). Sesuai prosedur integritas akademik, akses lembar soal dikunci sementara.
            </p>

            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Jawaban Anda Tetap Aman & Tersimpan</span>
              </div>
              <p>
                Seluruh jawaban yang telah Anda isi ({answeredCount} dari {questions.length} soal)
                tersimpan utuh di server dan tidak dihapus.
              </p>
            </div>

            <form onSubmit={handleVerifyPin} className="space-y-4 pt-2 border-t border-slate-200">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Verifikasi Guru Pengawas (Masukkan PIN Pengawas untuk Melanjutkan)
                </label>
                <p className="text-xs text-slate-500">
                  Silakan panggil Guru Pengawas ruangan untuk memasukkan PIN pembuka kunci, atau
                  minta Guru membuka tangguhan dari Dashboard Guru. (PIN Demo Ujian ini:{' '}
                  <code className="font-mono font-bold text-blue-700">
                    {exam.code === 'MTK-XII-01' ? '123456' : '654321'}
                  </code>
                  )
                </p>
                <input
                  type="password"
                  required
                  value={supervisorPinInput}
                  onChange={(e) => setSupervisorPinInput(e.target.value)}
                  placeholder="Masukkan PIN Verifikasi Guru"
                  className="w-full px-4 py-2.5 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {pinError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {pinError}
                </div>
              )}

              <button
                type="submit"
                disabled={verifyingPin}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>
                  {verifyingPin ? 'Memverifikasi PIN Guru...' : 'Verifikasi & Lanjutkan Ujian'}
                </span>
              </button>
            </form>
          </div>
        </main>
      )}

      {/* =====================================================================
          STEP 3B: HALAMAN SOAL AKTIF (EXAM MODE)
      ===================================================================== */}
      {step === 'EXAM_ACTIVE' &&
        attempt &&
        attempt.status === 'IN_PROGRESS' &&
        exam &&
        currentQuestion && (
          <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 space-y-5">
            {/* Exam Mode Status & Interactive Security Tester Bar */}
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>
                    Exam Mode Aktif ({isFullscreen ? 'Layar Penuh Terkunci' : 'Proteksi Fokus Aktif'})
                  </span>
                </div>
                <span className="text-slate-300">·</span>

                {/* Autosave Indicator */}
                <div className="flex items-center gap-1.5">
                  {saveStatus === 'OFFLINE_CACHED' ? (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-amber-700 font-medium">
                        Koneksi Terputus · Jawaban Disimpan di Memori Lokal
                      </span>
                    </>
                  ) : saveStatus === 'SAVING' ? (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-blue-700 font-medium">Menyimpan jawaban...</span>
                    </>
                  ) : (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-slate-600">
                        Autosave Server:{' '}
                        <span className="font-mono font-medium text-slate-800 tabular-nums">
                          {lastSavedText || 'Baru saja'}
                        </span>
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Interactive Simulation Controls for Evaluator Testing */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-slate-500">Uji Keamanan:</span>
                <button
                  type="button"
                  onClick={() =>
                    triggerManualViolation(
                      'TAB_SWITCH',
                      'Simulasi Uji: Siswa berpindah tab / membuka jendela lain (Page Visibility API).'
                    )
                  }
                  className="px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Simulasi Pindah Tab
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerManualViolation(
                      'EXIT_FULLSCREEN',
                      'Simulasi Uji: Siswa keluar dari mode layar penuh (Fullscreen API).'
                    )
                  }
                  className="px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Simulasi Keluar Fullscreen
                </button>
                <button
                  type="button"
                  onClick={() => setSimulatedOffline((prev) => !prev)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    simulatedOffline
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {simulatedOffline ? 'Pulihkan Koneksi Online' : 'Simulasi Putus Koneksi'}
                </button>
              </div>
            </div>

            {/* Main Question & Navigation Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 8 Columns: Active Question Workspace */}
              <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-6 sm:p-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-blue-700 font-mono tabular-nums">
                      SOAL NO. {activeIdx + 1} / {questions.length}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs font-medium text-slate-600">
                      Tipe:{' '}
                      {currentQuestion.type === 'PG'
                        ? 'Pilihan Ganda'
                        : currentQuestion.type === 'BS'
                        ? 'Benar / Salah'
                        : currentQuestion.type === 'ISIAN'
                        ? 'Isian Singkat'
                        : 'Uraian / Esai'}
                    </span>
                  </div>

                  <div className="text-xs font-mono font-semibold text-slate-600 tabular-nums">
                    Bobot: {currentQuestion.points} Poin
                  </div>
                </div>

                {/* Question Prompt */}
                <div className="text-base sm:text-lg font-medium text-slate-900 leading-relaxed whitespace-pre-line">
                  {currentQuestion.text}
                </div>

                {/* Answer Input Area Based on Question Type */}
                <div className="pt-2 space-y-3">
                  {currentQuestion.type === 'PG' &&
                    currentQuestion.options?.map((opt) => {
                      const isSelected = answers[currentQuestion.id] === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            handleSelectAnswer(currentQuestion.id, opt.key);
                            syncAnswersToServer(
                              { ...answers, [currentQuestion.id]: opt.key },
                              doubtful
                            );
                          }}
                          className={`w-full text-left p-4 rounded-xl border transition-colors flex items-start gap-3.5 cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50/80 border-blue-600 text-slate-900'
                              : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span
                            className={`w-7 h-7 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {opt.key}
                          </span>
                          <span className="text-sm sm:text-base leading-relaxed">{opt.text}</span>
                        </button>
                      );
                    })}

                  {currentQuestion.type === 'BS' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {(['BENAR', 'SALAH'] as const).map((choice) => {
                        const isSelected = answers[currentQuestion.id] === choice;
                        return (
                          <button
                            key={choice}
                            type="button"
                            onClick={() => {
                              handleSelectAnswer(currentQuestion.id, choice);
                              syncAnswersToServer(
                                { ...answers, [currentQuestion.id]: choice },
                                doubtful
                              );
                            }}
                            className={`p-5 rounded-xl border text-center font-bold text-sm transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            PERNYATAAN {choice}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {currentQuestion.type === 'ISIAN' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Ketik Jawaban Singkat Anda:
                      </label>
                      <input
                        type="text"
                        value={answers[currentQuestion.id] || ''}
                        onChange={(e) => handleSelectAnswer(currentQuestion.id, e.target.value)}
                        onBlur={() => syncAnswersToServer()}
                        placeholder="Ketik jawaban singkat dengan tepat..."
                        className="w-full px-4 py-3 text-base bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}

                  {currentQuestion.type === 'URAIAN' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Jawaban Uraian / Langkah Penyelesaian:
                      </label>
                      <textarea
                        rows={6}
                        value={answers[currentQuestion.id] || ''}
                        onChange={(e) => handleSelectAnswer(currentQuestion.id, e.target.value)}
                        onBlur={() => syncAnswersToServer()}
                        placeholder="Tuliskan langkah penyelesaian dan penjelasan Anda secara lengkap di sini..."
                        className="w-full p-4 text-sm sm:text-base bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
                      />
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Jawaban disimpan otomatis saat Anda mengetik atau berpindah soal.</span>
                        <span className="font-mono tabular-nums">
                          {(answers[currentQuestion.id] || '').length} Karakter
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Action Controls */}
                <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={activeIdx === 0}
                    onClick={() => {
                      syncAnswersToServer();
                      setActiveIdx((i) => Math.max(0, i - 1));
                    }}
                    className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Soal Sebelumnya</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleDoubtful(currentQuestion.id)}
                    className={`px-4 py-2.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-2 cursor-pointer ${
                      doubtful[currentQuestion.id]
                        ? 'bg-amber-500 text-white border-amber-600'
                        : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>
                      {doubtful[currentQuestion.id] ? 'Ditandai Ragu-ragu' : 'Tandai Ragu-ragu'}
                    </span>
                  </button>

                  {activeIdx < questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        syncAnswersToServer();
                        setActiveIdx((i) => Math.min(questions.length - 1, i + 1));
                      }}
                      className="px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Soal Berikutnya</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        syncAnswersToServer();
                        setConfirmSubmitOpen(true);
                      }}
                      className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Selesai & Kirim Jawaban</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Right 4 Columns: Question Navigator & Submit Panel */}
              <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Navigasi Nomor Soal</h3>
                  <span className="text-xs font-mono text-slate-500 tabular-nums">
                    {answeredCount}/{questions.length} Terjawab
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {questions.map((q, idx) => {
                    const isAnswered = Boolean(answers[q.id] && answers[q.id].trim().length > 0);
                    const isDoubt = Boolean(doubtful[q.id]);
                    const isCurrent = idx === activeIdx;

                    let btnClass = 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200';
                    if (isDoubt) {
                      btnClass = 'bg-amber-500 text-white border-amber-600';
                    } else if (isAnswered) {
                      btnClass = 'bg-blue-600 text-white border-blue-700';
                    }

                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => {
                          syncAnswersToServer();
                          setActiveIdx(idx);
                        }}
                        className={`h-10 rounded-lg font-mono text-xs font-bold border transition-all tabular-nums cursor-pointer ${btnClass} ${
                          isCurrent ? 'ring-2 ring-offset-2 ring-blue-600' : ''
                        }`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="pt-3 border-t border-slate-200 grid grid-cols-3 gap-2 text-[11px] text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-blue-600 inline-block shrink-0" />
                    <span>Dijawab ({answeredCount})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block shrink-0" />
                    <span>Ragu ({doubtfulCount})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-slate-200 inline-block shrink-0" />
                    <span>Kosong ({unansweredCount})</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    syncAnswersToServer();
                    setConfirmSubmitOpen(true);
                  }}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Kirim Seluruh Jawaban Ujian</span>
                </button>
              </div>
            </div>
          </main>
        )}

      {/* =====================================================================
          MODAL PERINGATAN PELANGGARAN EXAM MODE
      ===================================================================== */}
      {warningModal && warningModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-red-200 max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-xl">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-lg bg-red-100 text-red-600 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-mono font-bold text-red-600 uppercase">
                  Peringatan Keamanan Exam Mode · {warningModal.timestamp}
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  Terdeteksi aktivitas meninggalkan halaman ujian. Silakan kembali ke ujian
                </h2>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-700">
              <div>
                <span className="font-semibold">Detail Aktivitas:</span> {warningModal.description}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="font-semibold">Jumlah Pelanggaran Tercatat:</span>
                <span className="font-mono font-bold text-sm text-red-600 tabular-nums">
                  {warningModal.count} dari Maksimal {warningModal.max}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Aktivitas ini telah dicatat secara otomatis pada Audit Log Guru beserta waktu server.
              Jawaban Anda tetap tersimpan dengan aman. Apabila jumlah pelanggaran mencapai{' '}
              <strong className="font-mono">{warningModal.max} kali</strong>, ujian akan otomatis
              ditangguhkan.
            </p>

            <button
              type="button"
              onClick={async () => {
                setWarningModal(null);
                if (exam?.security.requireFullscreen) {
                  await enterFullscreen();
                }
              }}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Kembali ke Ujian & Aktifkan Layar Penuh</span>
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL KONFIRMASI KIRIM JAWABAN
      ===================================================================== */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 sm:p-8 space-y-5 shadow-xl">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-blue-700">
                Konfirmasi Akhir Pengiriman
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Apakah Anda yakin ingin mengirim jawaban ujian?
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <div className="text-lg font-bold font-mono text-blue-700 tabular-nums">
                  {answeredCount}
                </div>
                <div className="text-[11px] text-slate-600">Sudah Dijawab</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="text-lg font-bold font-mono text-amber-700 tabular-nums">
                  {doubtfulCount}
                </div>
                <div className="text-[11px] text-slate-600">Ragu-ragu</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-100 border border-slate-200">
                <div className="text-lg font-bold font-mono text-slate-700 tabular-nums">
                  {unansweredCount}
                </div>
                <div className="text-[11px] text-slate-600">Belum Dijawab</div>
              </div>
            </div>

            {(unansweredCount > 0 || doubtfulCount > 0) && (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Perhatian: Masih terdapat{' '}
                  {unansweredCount > 0 ? `${unansweredCount} soal kosong` : ''}
                  {unansweredCount > 0 && doubtfulCount > 0 ? ' dan ' : ''}
                  {doubtfulCount > 0 ? `${doubtfulCount} soal bertanda ragu-ragu` : ''}.
                </span>
              </div>
            )}

            <p className="text-xs text-slate-500 leading-relaxed">
              Setelah tombol <strong>Ya, Kirim Sekarang</strong> ditekan, sesi ujian akan dikunci
              secara permanen dan Anda tidak dapat mengubah jawaban lagi.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(false)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Periksa Kembali
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleFinalSubmit('MANUAL')}
                className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{loading ? 'Mengirim...' : 'Ya, Kirim Sekarang'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 4: HALAMAN SELESAI UJIAN
      ===================================================================== */}
      {step === 'FINISHED' && finishedData && (
        <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-10 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600">
                  <FileCheck className="w-7 h-7" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-emerald-700">
                    Langkah 4 dari 4 · Bukti Penyelesaian Asesmen Digital
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    Ujian Telah Selesai & Jawaban Terkirim
                  </h1>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setStep('CODE_ENTRY');
                  setFinishedData(null);
                  setExam(null);
                  setAttempt(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors self-start cursor-pointer"
              >
                Kembali ke Beranda Siswa
              </button>
            </div>

            {/* Receipt Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-slate-500">Peserta Didik</div>
                <div className="font-bold text-slate-900 text-sm">{user.fullName}</div>
                <div className="text-slate-500 font-mono">{user.kelas}</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-slate-500">Waktu Pengiriman Server</div>
                <div className="font-bold font-mono text-slate-900 text-sm tabular-nums">
                  {finishedData.attempt.submittedAt
                    ? new Date(finishedData.attempt.submittedAt).toLocaleString('id-ID')
                    : '-'}
                </div>
                <div className="text-slate-500">
                  Metode:{' '}
                  {finishedData.attempt.submitReason === 'TIME_EXPIRED'
                    ? 'Otomatis (Waktu Habis)'
                    : finishedData.attempt.submitReason === 'MAX_VIOLATIONS'
                    ? 'Otomatis (Batas Pelanggaran)'
                    : 'Dikirim Mandiri oleh Siswa'}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-slate-500">Rekam Audit Keamanan</div>
                <div className="font-bold font-mono text-slate-900 text-sm tabular-nums">
                  {finishedData.attempt.violationsCount} Pelanggaran Tercatat
                </div>
                <div className="text-slate-500">Tersimpan di Audit Log Guru</div>
              </div>
            </div>

            {/* Score Section (Conditional on allowSeeResult) */}
            {finishedData.allowSeeResult ? (
              <div className="p-6 rounded-xl bg-blue-50/60 border border-blue-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-blue-800">
                      Hasil Evaluasi Akhir (Diizinkan Guru untuk Ditampilkan)
                    </div>
                    <div className="text-base font-bold text-slate-900">
                      Status Ketuntasan:{' '}
                      <span
                        className={
                          finishedData.attempt.passedKkm ? 'text-emerald-700' : 'text-amber-700'
                        }
                      >
                        {finishedData.attempt.passedKkm
                          ? `LULUS KKM (≥ ${finishedData.kkm})`
                          : `BELUM TUNTAS KKM (< ${finishedData.kkm})`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Skor Objektif: {finishedData.attempt.objectiveScore} poin · Skor Uraian:{' '}
                      {finishedData.attempt.essayScoreTotal} poin
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <div className="text-xs text-slate-500">Nilai Akhir</div>
                    <div className="text-4xl font-bold font-mono text-blue-700 tabular-nums">
                      {finishedData.attempt.finalScore}
                      <span className="text-lg text-slate-400 font-normal">/100</span>
                    </div>
                  </div>
                </div>

                {finishedData.attempt.teacherNotes && (
                  <div className="pt-3 border-t border-blue-200 text-xs text-slate-700">
                    <strong>Catatan Guru:</strong> {finishedData.attempt.teacherNotes}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-slate-100 border border-slate-200 flex items-start gap-3.5">
                <Lock className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs sm:text-sm text-slate-700">
                  <div className="font-bold text-slate-900">
                    Hasil Nilai Menunggu Pengumuman Guru
                  </div>
                  <p className="leading-relaxed">
                    Sesuai pengaturan ujian ini, siswa tidak dapat melihat skor atau kunci jawaban
                    sebelum diizinkan oleh Guru Mata Pelajaran. Jawaban Anda telah terekam dengan
                    aman di server.
                  </p>
                </div>
              </div>
            )}

            {/* Review Key & Explanations if allowed */}
            {finishedData.allowSeeResult && finishedData.questionsWithKey.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <h2 className="text-sm font-bold text-slate-900">
                  Rincian Jawaban & Pembahasan Soal
                </h2>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                  {finishedData.questionsWithKey.map((q, idx) => {
                    const studentAns = finishedData.attempt.answers[q.id] || '(Tidak dijawab)';
                    return (
                      <div key={q.id} className="p-4 bg-white space-y-2 text-xs">
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="font-bold text-slate-800">
                            Soal {idx + 1} ({q.type})
                          </span>
                          <span className="font-mono tabular-nums">Bobot: {q.points} Poin</span>
                        </div>
                        <div className="text-slate-900 font-medium">{q.text}</div>
                        <div className="flex flex-wrap gap-4 pt-1">
                          <div>
                            <span className="text-slate-500">Jawaban Anda: </span>
                            <span className="font-mono font-semibold text-blue-700">
                              {studentAns}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Kunci / Acuan: </span>
                            <span className="font-mono font-semibold text-emerald-700">
                              {q.correctAns}
                            </span>
                          </div>
                        </div>
                        {q.explanation && (
                          <div className="text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                            <strong>Pembahasan:</strong> {q.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
};
