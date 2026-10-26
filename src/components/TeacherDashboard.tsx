import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  BookOpenCheck,
  ShieldAlert,
  Settings,
  Plus,
  Trash2,
  Edit3,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Download,
  RefreshCw,
  LogOut,
  Search,
  Eye,
  EyeOff,
  Save,
  X,
} from 'lucide-react';
import type {
  User,
  Exam,
  Question,
  QuestionType,
  Attempt,
  AuditLogEntry,
} from '../types';
import { api } from '../api';

interface TeacherDashboardProps {
  user: User;
  onLogout: () => void;
}

type TeacherTab = 'OVERVIEW' | 'EXAMS' | 'QUESTIONS' | 'RESULTS' | 'AUDIT_LOG';

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<TeacherTab>('OVERVIEW');
  const [loading, setLoading] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Filters
  const [selectedExamFilter, setSelectedExamFilter] = useState<string>('ALL');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Exam Modal / Editor State
  const [editingExam, setEditingExam] = useState<Partial<Exam> | null>(null);

  // Question Modal / Editor State
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question> | null>(null);

  // Attempt Grading / Inspection Modal
  const [inspectingAttempt, setInspectingAttempt] = useState<Attempt | null>(null);
  const [essayScoreInputs, setEssayScoreInputs] = useState<Record<string, number>>({});
  const [teacherNotesInput, setTeacherNotesInput] = useState<string>('');

  const showToast = (msg: string) => {
    setFeedbackBanner(msg);
    setTimeout(() => setFeedbackBanner(null), 4000);
  };

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTeacherDashboard();
      setExams(data.exams);
      setQuestions(data.questions);
      setAttempts(data.attempts);
      setAuditLogs(data.auditLogs);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memuat data dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Unlock Suspended Student Attempt
  const handleUnlockAttempt = async (attemptId: string) => {
    try {
      await api.unlockAttempt(attemptId);
      showToast('Penangguhan ujian siswa berhasil dibuka. Siswa dapat melanjutkan ujian.');
      await fetchDashboardData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuka kunci ujian.');
    }
  };

  // Toggle allowSeeResult quickly
  const handleToggleSeeResult = async (exam: Exam) => {
    try {
      await api.saveExam({
        ...exam,
        allowSeeResult: !exam.allowSeeResult,
      });
      showToast(
        !exam.allowSeeResult
          ? `Hasil ujian ${exam.code} kini DIIZINKAN untuk dilihat siswa.`
          : `Hasil ujian ${exam.code} kini DISEMBUNYIKAN dari siswa.`
      );
      await fetchDashboardData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui pengaturan hasil.');
    }
  };

  // Save Exam Handler
  const handleSaveExamForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExam) return;
    try {
      await api.saveExam(editingExam);
      setEditingExam(null);
      showToast('Data ujian dan konfigurasi Exam Mode berhasil disimpan.');
      await fetchDashboardData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan ujian.');
    }
  };

  const handleDeleteExam = async (id: string, code: string) => {
    try {
      await api.deleteExam(id);
      showToast(`Ujian ${code} beserta soal terkait telah dihapus.`);
      await fetchDashboardData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus ujian.');
    }
  };

  // Save Question Handler
  const handleSaveQuestionForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    try {
      await api.saveQuestion(editingQuestion);
      setEditingQuestion(null);
      showToast('Butir soal berhasil disimpan ke Bank Soal.');
      await fetchDashboardData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan soal.');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      await api.deleteQuestion(id);
      showToast('Butir soal berhasil dihapus.');
      await fetchDashboardData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus soal.');
    }
  };

  // Save Essay Grading
  const handleSaveGrading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectingAttempt) return;
    try {
      const res = await api.gradeAttempt(
        inspectingAttempt.id,
        essayScoreInputs,
        teacherNotesInput
      );
      setInspectingAttempt(res.attempt);
      showToast('Penilaian uraian dan catatan guru berhasil diperbarui.');
      await fetchDashboardData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan nilai.');
    }
  };

  // Export Results CSV
  const handleExportResultsCsv = () => {
    const headers = [
      'Nama Siswa',
      'Kelas',
      'Kode Ujian',
      'Status',
      'Skor Objektif',
      'Skor Uraian',
      'Nilai Akhir',
      'Status KKM',
      'Jumlah Pelanggaran',
      'Waktu Mulai',
      'Waktu Selesai',
    ];
    const rows = attempts.map((a) => [
      `"${a.studentName}"`,
      `"${a.studentKelas}"`,
      a.examCode,
      a.status,
      a.objectiveScore,
      a.essayScoreTotal,
      a.finalScore,
      a.passedKkm ? 'LULUS' : 'BELUM TUNTAS',
      a.violationsCount,
      a.startedAt,
      a.submittedAt || '-',
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `hasil-asesmen-sadit-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Computed Statistics
  const submittedAttempts = attempts.filter((a) => a.status === 'SUBMITTED');
  const suspendedAttempts = attempts.filter((a) => a.status === 'SUSPENDED');
  const avgScore =
    submittedAttempts.length > 0
      ? Math.round(
          submittedAttempts.reduce((acc, cur) => acc + cur.finalScore, 0) /
            submittedAttempts.length
        )
      : 0;
  const passRate =
    submittedAttempts.length > 0
      ? Math.round(
          (submittedAttempts.filter((a) => a.passedKkm).length / submittedAttempts.length) * 100
        )
      : 0;

  // Filtered Questions
  const filteredQuestions = questions.filter((q) => {
    const matchExam = selectedExamFilter === 'ALL' || q.examId === selectedExamFilter;
    const matchType = selectedTypeFilter === 'ALL' || q.type === selectedTypeFilter;
    const matchSearch =
      !searchQuery.trim() ||
      q.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.subject.toLowerCase().includes(searchQuery.toLowerCase());
    return matchExam && matchType && matchSearch;
  });

  // Filtered Attempts
  const filteredAttempts = attempts.filter((a) => {
    const matchExam = selectedExamFilter === 'ALL' || a.examId === selectedExamFilter;
    const matchSearch =
      !searchQuery.trim() ||
      a.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.examCode.toLowerCase().includes(searchQuery.toLowerCase());
    return matchExam && matchSearch;
  });

  // Filtered Audit Logs
  const filteredLogs = auditLogs.filter((l) => {
    const matchExam = selectedExamFilter === 'ALL' || l.examId === selectedExamFilter;
    const matchSearch =
      !searchQuery.trim() ||
      l.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.type.toLowerCase().includes(searchQuery.toLowerCase());
    return matchExam && matchSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight text-blue-700 whitespace-nowrap shrink-0">
              SADIT Ruang Guru
            </span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="text-xs font-medium text-slate-600 hidden sm:inline truncate">
              {user.fullName} (NIP: <span className="font-mono">{user.nip || '-'}</span>)
            </span>
          </div>

          {/* Primary Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('OVERVIEW')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'OVERVIEW'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Monitoring</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('EXAMS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'EXAMS'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Ujian & Exam Mode</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('QUESTIONS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'QUESTIONS'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpenCheck className="w-3.5 h-3.5" />
              <span>Bank Soal ({questions.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('RESULTS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'RESULTS'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Hasil & Nilai</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('AUDIT_LOG')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'AUDIT_LOG'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Audit Log ({auditLogs.length})</span>
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={fetchDashboardData}
              className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Segarkan Data Server"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex md:hidden items-center gap-1 overflow-x-auto pt-3 mt-3 border-t border-slate-100">
          {(
            [
              ['OVERVIEW', 'Monitoring'],
              ['EXAMS', 'Ujian & Exam Mode'],
              ['QUESTIONS', 'Bank Soal'],
              ['RESULTS', 'Hasil & Nilai'],
              ['AUDIT_LOG', 'Audit Log'],
            ] as const
          ).map(([tabKey, label]) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 ${
                activeTab === tabKey ? 'bg-blue-600 text-white' : 'text-slate-600 bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {feedbackBanner && (
        <div className="bg-blue-600 text-white px-6 py-2.5 text-xs font-medium text-center flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedbackBanner}</span>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {/* ===================================================================
            TAB 1: MONITORING & RINGKASAN DASHBOARD GURU
        =================================================================== */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-8">
            {/* 4-Column KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1">
                <div className="text-xs font-medium text-slate-500">Sesi Ujian & Bank Soal</div>
                <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                  {exams.length} Ujian · {questions.length} Soal
                </div>
                <div className="text-xs text-slate-500">Siap digunakan dengan kode unik</div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1">
                <div className="text-xs font-medium text-slate-500">Rata-rata Nilai & KKM</div>
                <div className="text-2xl font-bold font-mono text-blue-700 tabular-nums">
                  {avgScore}/100 ({passRate}% Lulus)
                </div>
                <div className="text-xs text-slate-500">
                  Dari {submittedAttempts.length} peserta selesai
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1">
                <div className="text-xs font-medium text-slate-500">Ujian Ditangguhkan (Kiosk)</div>
                <div
                  className={`text-2xl font-bold font-mono tabular-nums ${
                    suspendedAttempts.length > 0 ? 'text-amber-600' : 'text-emerald-600'
                  }`}
                >
                  {suspendedAttempts.length} Peserta
                </div>
                <div className="text-xs text-slate-500">
                  {suspendedAttempts.length > 0
                    ? 'Memerlukan verifikasi / pembukaan kunci guru'
                    : 'Seluruh peserta berjalan kondusif'}
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1">
                <div className="text-xs font-medium text-slate-500">Total Audit Log Keamanan</div>
                <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                  {auditLogs.length} Kejadian
                </div>
                <div className="text-xs text-slate-500">Tercatat otomatis dengan waktu server</div>
              </div>
            </div>

            {/* Suspended Alert Callout if any */}
            {suspendedAttempts.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-amber-950">
                      Perhatian Pengawas: Terdapat {suspendedAttempts.length} Siswa dengan Status
                      "Ujian Ditangguhkan"
                    </div>
                    <p className="text-xs text-amber-800">
                      Siswa melewati batas maksimal pelanggaran perpindahan tab/fullscreen. Jawaban
                      siswa tetap tersimpan. Klik tombol <strong>Verifikasi & Buka Kunci</strong> di
                      tabel bawah atau masukkan PIN Pengawas pada perangkat siswa.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Live Student Attempts Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Monitoring Langsung Peserta Ujian
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pantau status pengerjaan, waktu tersimpan terakhir, jumlah pelanggaran, dan
                    buka penangguhan ujian siswa
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedExamFilter}
                    onChange={(e) => setSelectedExamFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="ALL">Semua Kode Ujian</option>
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.code} — {ex.subject}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      <th className="py-3 px-5">Nama Siswa & Kelas</th>
                      <th className="py-3 px-4">Kode Ujian</th>
                      <th className="py-3 px-4">Status Sesi</th>
                      <th className="py-3 px-4">Autosave Terakhir</th>
                      <th className="py-3 px-4 text-right">Pelanggaran</th>
                      <th className="py-3 px-4 text-right">Nilai</th>
                      <th className="py-3 px-5 text-right">Tindakan Guru</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {filteredAttempts.map((att) => {
                      const examObj = exams.find((e) => e.id === att.examId);
                      const maxV = examObj?.security.maxViolations ?? 3;
                      return (
                        <tr key={att.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-5">
                            <div className="font-semibold text-slate-900">{att.studentName}</div>
                            <div className="text-slate-500">{att.studentKelas}</div>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-blue-700 tabular-nums">
                            {att.examCode}
                          </td>
                          <td className="py-3.5 px-4">
                            {att.status === 'SUSPENDED' ? (
                              <span className="font-bold text-red-600">
                                Ujian Ditangguhkan (Terkunci)
                              </span>
                            ) : att.status === 'SUBMITTED' ? (
                              <span className="font-semibold text-emerald-700">
                                Selesai ({att.passedKkm ? 'Lulus KKM' : 'Belum Tuntas'})
                              </span>
                            ) : (
                              <span className="font-semibold text-blue-700">
                                Sedang Mengerjakan
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-600 tabular-nums">
                            {new Date(att.lastSavedAt).toLocaleTimeString('id-ID')}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums">
                            <span
                              className={
                                att.violationsCount >= maxV
                                  ? 'text-red-600'
                                  : att.violationsCount > 0
                                  ? 'text-amber-600'
                                  : 'text-slate-600'
                              }
                            >
                              {att.violationsCount} / {maxV}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-sm text-slate-900 tabular-nums">
                            {att.finalScore}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {att.status === 'SUSPENDED' && (
                                <button
                                  type="button"
                                  onClick={() => handleUnlockAttempt(att.id)}
                                  className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>Verifikasi & Buka Kunci</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectingAttempt(att);
                                  setEssayScoreInputs(att.essayScores || {});
                                  setTeacherNotesInput(att.teacherNotes || '');
                                }}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Detail & Koreksi
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 2: MANAJEMEN UJIAN & PENGATURAN EXAM MODE
        =================================================================== */}
        {activeTab === 'EXAMS' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Manajemen Jadwal Ujian & Konfigurasi Exam Mode
                </h1>
                <p className="text-xs text-slate-500">
                  Atur kode ujian, durasi, jadwal akses, KKM, izin lihat nilai, serta batas
                  pelanggaran Exam Mode
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditingExam({
                    title: '',
                    subject: 'Matematika',
                    kelas: 'XII MIPA 1',
                    code: `UJI-${Math.floor(100 + Math.random() * 900)}`,
                    durationMinutes: 45,
                    startTime: new Date().toISOString().slice(0, 16),
                    endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                      .toISOString()
                      .slice(0, 16),
                    kkm: 75,
                    allowSeeResult: true,
                    supervisorPin: '123456',
                    security: {
                      requireFullscreen: true,
                      detectTabSwitch: true,
                      detectWindowBlur: true,
                      preventCopyPaste: true,
                      maxViolations: 3,
                      violationAction: 'SUSPEND',
                      autosaveIntervalSec: 15,
                      shuffleQuestions: false,
                    },
                  })
                }
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 self-start whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Sesi Ujian Baru</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {exams.map((ex) => {
                const qList = questions.filter((q) => q.examId === ex.id);
                return (
                  <div
                    key={ex.id}
                    className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md">
                            {ex.code}
                          </span>
                          <h2 className="text-base font-bold text-slate-900">{ex.title}</h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>Mata Pelajaran: {ex.subject}</span>
                          <span aria-hidden="true">·</span>
                          <span>Kelas: {ex.kelas}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{qList.length} Soal</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">Durasi {ex.durationMinutes} Menit</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">KKM {ex.kkm}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono font-semibold text-slate-700 tabular-nums">
                            PIN Pengawas: {ex.supervisorPin}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleSeeResult(ex)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer ${
                            ex.allowSeeResult
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {ex.allowSeeResult ? (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              <span>Nilai Dibuka ke Siswa</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>Nilai Disembunyikan</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingExam(ex)}
                          className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit & Exam Mode</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteExam(ex.id, ex.code)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Hapus Ujian"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Exam Security Summary Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-slate-500">Mode Layar Penuh</div>
                        <div className="font-semibold text-slate-800 mt-0.5">
                          {ex.security.requireFullscreen ? 'Wajib Fullscreen' : 'Opsional'}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-slate-500">Batas Pelanggaran</div>
                        <div className="font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                          Maksimal {ex.security.maxViolations}x ({ex.security.violationAction})
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-slate-500">Jadwal Mulai</div>
                        <div className="font-mono text-slate-800 tabular-nums mt-0.5">
                          {new Date(ex.startTime).toLocaleString('id-ID')}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-slate-500">Jadwal Berakhir</div>
                        <div className="font-mono text-slate-800 tabular-nums mt-0.5">
                          {new Date(ex.endTime).toLocaleString('id-ID')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 3: BANK SOAL MULTI-TIPE (PG, ISIAN, BS, URAIAN)
        =================================================================== */}
        {activeTab === 'QUESTIONS' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Bank Soal Terpadu (PG, Isian Singkat, Benar-Salah, Uraian)
                </h1>
                <p className="text-xs text-slate-500">
                  Kelola butir pertanyaan, kunci jawaban, bobot nilai, serta pembahasan soal
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditingQuestion({
                    examId: exams[0]?.id || 'exm-1',
                    subject: exams[0]?.subject || 'Matematika Lanjut',
                    type: 'PG',
                    text: '',
                    options: [
                      { key: 'A', text: '' },
                      { key: 'B', text: '' },
                      { key: 'C', text: '' },
                      { key: 'D', text: '' },
                      { key: 'E', text: '' },
                    ],
                    correctAns: 'A',
                    points: 10,
                    explanation: '',
                  })
                }
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 self-start whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Butir Soal</span>
              </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedExamFilter}
                  onChange={(e) => setSelectedExamFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="ALL">Semua Sesi Ujian</option>
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.code} — {ex.title}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['ALL', 'PG', 'BS', 'ISIAN', 'URAIAN'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTypeFilter(t)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                        selectedTypeFilter === t
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t === 'ALL' ? 'Semua Tipe' : t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari teks soal..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            {/* Question List */}
            <div className="space-y-3">
              {filteredQuestions.map((q, idx) => {
                const examObj = exams.find((e) => e.id === q.examId);
                return (
                  <div
                    key={q.id}
                    className="bg-white rounded-xl border border-slate-200 p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-bold text-slate-900 tabular-nums">
                          #{idx + 1}
                        </span>
                        <span>·</span>
                        <span className="font-mono font-semibold text-blue-700">
                          {examObj?.code || q.examId}
                        </span>
                        <span>·</span>
                        <span className="font-semibold text-slate-700">Tipe {q.type}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">Bobot {q.points} Poin</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingQuestion(q)}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                        >
                          Edit Soal
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="text-sm font-medium text-slate-900">{q.text}</div>

                    {q.type === 'PG' && q.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                        {q.options.map((opt) => (
                          <div
                            key={opt.key}
                            className={`px-3 py-2 rounded-lg border ${
                              q.correctAns === opt.key
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            <span className="font-mono font-bold mr-2">{opt.key}.</span>
                            <span>{opt.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <div>
                        <span className="font-semibold text-slate-700">Kunci / Acuan Skor: </span>
                        <span className="font-mono font-bold text-emerald-700">
                          {q.correctAns}
                        </span>
                      </div>
                      {q.explanation && (
                        <div className="text-slate-500 truncate max-w-xl">
                          Pembahasan: {q.explanation}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 4: HASIL UJIAN, STATISTIK & KOREKSI URAIAN
        =================================================================== */}
        {activeTab === 'RESULTS' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Rekapitulasi Nilai, Ketuntasan KKM & Koreksi Uraian
                </h1>
                <p className="text-xs text-slate-500">
                  Klik tombol Koreksi & Rincian untuk menilai jawaban esai siswa dan memperbarui
                  skor akhir
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportResultsCsv}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 self-start whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Rekap Nilai (CSV)</span>
              </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      <th className="py-3 px-5">Peserta Didik</th>
                      <th className="py-3 px-4">Ujian</th>
                      <th className="py-3 px-4 text-right">Skor Objektif</th>
                      <th className="py-3 px-4 text-right">Skor Uraian</th>
                      <th className="py-3 px-4 text-right">Nilai Akhir</th>
                      <th className="py-3 px-4">Ketuntasan KKM</th>
                      <th className="py-3 px-5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {attempts.map((att) => (
                      <tr key={att.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 px-5">
                          <div className="font-semibold text-slate-900">{att.studentName}</div>
                          <div className="text-slate-500">{att.studentKelas}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-semibold text-blue-700">
                          {att.examCode}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          {att.objectiveScore}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          {att.essayScoreTotal}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-sm text-slate-900 tabular-nums">
                          {att.finalScore}
                        </td>
                        <td className="py-3.5 px-4">
                          {att.status !== 'SUBMITTED' ? (
                            <span className="text-amber-700 font-medium">
                              Belum Selesai ({att.status})
                            </span>
                          ) : att.passedKkm ? (
                            <span className="text-emerald-700 font-bold">Lulus KKM</span>
                          ) : (
                            <span className="text-red-600 font-semibold">Belum Tuntas (Remedial)</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectingAttempt(att);
                              setEssayScoreInputs(att.essayScores || {});
                              setTeacherNotesInput(att.teacherNotes || '');
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                          >
                            Koreksi & Rincian
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 5: AUDIT LOG PELANGGARAN KEAMANAN
        =================================================================== */}
        {activeTab === 'AUDIT_LOG' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Audit Log Keamanan Exam Mode (Rekam Jejak Real-Time)
                </h1>
                <p className="text-xs text-slate-500">
                  Catatan waktu server untuk setiap aktivitas keluar fullscreen, pindah tab, hilang
                  fokus, penangguhan otomatis, dan verifikasi guru
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <select
                  value={selectedExamFilter}
                  onChange={(e) => setSelectedExamFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="ALL">Semua Kode Ujian</option>
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.code} — {ex.title}
                    </option>
                  ))}
                </select>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama siswa atau jenis log..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      <th className="py-3 px-5">Waktu Server</th>
                      <th className="py-3 px-4">Nama Siswa</th>
                      <th className="py-3 px-4">Kode Ujian</th>
                      <th className="py-3 px-4">Jenis Peristiwa</th>
                      <th className="py-3 px-4">Deskripsi Aktivitas</th>
                      <th className="py-3 px-5 text-right">Hitungan Ke-</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 px-5 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{log.studentName}</div>
                          <div className="text-slate-500">{log.studentKelas}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-semibold text-blue-700">
                          {log.examCode}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold">
                          <span
                            className={
                              log.type === 'TEACHER_UNLOCK'
                                ? 'text-emerald-700'
                                : log.type === 'SUSPENDED_AUTO'
                                ? 'text-red-600'
                                : 'text-amber-700'
                            }
                          >
                            {log.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">{log.description}</td>
                        <td className="py-3.5 px-5 text-right font-mono font-bold tabular-nums">
                          {log.violationCountAtEvent}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* =====================================================================
          MODAL: BUAT / EDIT UJIAN & PENGATURAN EXAM MODE
      ===================================================================== */}
      {editingExam && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 max-w-2xl w-full p-6 sm:p-8 space-y-6 my-8 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">
                {editingExam.id ? 'Edit Ujian & Pengaturan Exam Mode' : 'Buat Sesi Ujian Baru'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingExam(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExamForm} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="font-semibold text-slate-700">Judul Asesmen / Ulangan</label>
                  <input
                    type="text"
                    required
                    value={editingExam.title || ''}
                    onChange={(e) => setEditingExam({ ...editingExam, title: e.target.value })}
                    placeholder="Contoh: Penilaian Akhir Semester Matematika"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Mata Pelajaran</label>
                  <input
                    type="text"
                    required
                    value={editingExam.subject || ''}
                    onChange={(e) => setEditingExam({ ...editingExam, subject: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Kelas Sasaran</label>
                  <input
                    type="text"
                    required
                    value={editingExam.kelas || ''}
                    onChange={(e) => setEditingExam({ ...editingExam, kelas: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Kode Ujian Unik</label>
                  <input
                    type="text"
                    required
                    value={editingExam.code || ''}
                    onChange={(e) =>
                      setEditingExam({ ...editingExam, code: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3.5 py-2.5 font-mono font-bold uppercase bg-slate-50 border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">PIN Verifikasi Pengawas</label>
                  <input
                    type="text"
                    required
                    value={editingExam.supervisorPin || '123456'}
                    onChange={(e) =>
                      setEditingExam({ ...editingExam, supervisorPin: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Durasi Pengerjaan (Menit)</label>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    required
                    value={editingExam.durationMinutes ?? 45}
                    onChange={(e) =>
                      setEditingExam({ ...editingExam, durationMinutes: Number(e.target.value) })
                    }
                    className="w-full px-3.5 py-2.5 font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Standar Nilai KKM (0-100)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={editingExam.kkm ?? 75}
                    onChange={(e) =>
                      setEditingExam({ ...editingExam, kkm: Number(e.target.value) })
                    }
                    className="w-full px-3.5 py-2.5 font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Exam Mode Security Settings */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="font-bold text-slate-900">
                  Pengaturan Keamanan Exam Mode / Kiosk Mode
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingExam.security?.requireFullscreen ?? true}
                      onChange={(e) =>
                        setEditingExam({
                          ...editingExam,
                          security: {
                            ...(editingExam.security as Exam['security']),
                            requireFullscreen: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>Wajib Mode Layar Penuh (Fullscreen)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingExam.security?.detectTabSwitch ?? true}
                      onChange={(e) =>
                        setEditingExam({
                          ...editingExam,
                          security: {
                            ...(editingExam.security as Exam['security']),
                            detectTabSwitch: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>Deteksi Pindah Tab (Page Visibility API)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingExam.security?.detectWindowBlur ?? true}
                      onChange={(e) =>
                        setEditingExam({
                          ...editingExam,
                          security: {
                            ...(editingExam.security as Exam['security']),
                            detectWindowBlur: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>Deteksi Kehilangan Fokus Jendela</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingExam.security?.preventCopyPaste ?? true}
                      onChange={(e) =>
                        setEditingExam({
                          ...editingExam,
                          security: {
                            ...(editingExam.security as Exam['security']),
                            preventCopyPaste: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>Blokir Copy-Paste & Klik Kanan</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">
                      Batas Maksimal Pelanggaran
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={editingExam.security?.maxViolations ?? 3}
                      onChange={(e) =>
                        setEditingExam({
                          ...editingExam,
                          security: {
                            ...(editingExam.security as Exam['security']),
                            maxViolations: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full px-3 py-2 font-mono bg-white border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">
                      Tindakan Otomatis Saat Melewati Batas
                    </label>
                    <select
                      value={editingExam.security?.violationAction ?? 'SUSPEND'}
                      onChange={(e) =>
                        setEditingExam({
                          ...editingExam,
                          security: {
                            ...(editingExam.security as Exam['security']),
                            violationAction: e.target.value as 'SUSPEND' | 'AUTO_SUBMIT',
                          },
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="SUSPEND">
                        Tangguhkan Ujian & Minta Verifikasi Guru (SUSPEND)
                      </option>
                      <option value="AUTO_SUBMIT">
                        Kunci & Kirim Jawaban Otomatis (AUTO_SUBMIT)
                      </option>
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 pt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingExam.allowSeeResult ?? true}
                    onChange={(e) =>
                      setEditingExam({ ...editingExam, allowSeeResult: e.target.checked })
                    }
                  />
                  <span className="font-semibold text-blue-900">
                    Izinkan siswa melihat hasil nilai & pembahasan setelah selesai ujian
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingExam(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Pengaturan Ujian</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: BUAT / EDIT BUTIR SOAL BANK SOAL
      ===================================================================== */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 max-w-2xl w-full p-6 sm:p-8 space-y-5 my-8 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">
                {editingQuestion.id ? 'Edit Butir Soal' : 'Tambah Soal Baru ke Bank Soal'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestionForm} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Pilih Sesi Ujian</label>
                  <select
                    value={editingQuestion.examId || ''}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, examId: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                  >
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.code} — {ex.subject}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Tipe Soal</label>
                  <select
                    value={editingQuestion.type || 'PG'}
                    onChange={(e) => {
                      const nextType = e.target.value as QuestionType;
                      setEditingQuestion({
                        ...editingQuestion,
                        type: nextType,
                        correctAns: nextType === 'BS' ? 'BENAR' : nextType === 'PG' ? 'A' : '',
                        options:
                          nextType === 'PG'
                            ? editingQuestion.options || [
                                { key: 'A', text: '' },
                                { key: 'B', text: '' },
                                { key: 'C', text: '' },
                                { key: 'D', text: '' },
                                { key: 'E', text: '' },
                              ]
                            : undefined,
                      });
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="PG">Pilihan Ganda (PG)</option>
                    <option value="BS">Benar / Salah (BS)</option>
                    <option value="ISIAN">Isian Singkat</option>
                    <option value="URAIAN">Uraian / Esai</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Bobot Poin</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={editingQuestion.points ?? 10}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, points: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Teks Pertanyaan / Soal</label>
                <textarea
                  rows={3}
                  required
                  value={editingQuestion.text || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
                  placeholder="Tuliskan rumusan pertanyaan dengan jelas..."
                  className="w-full p-3 bg-white border border-slate-300 rounded-lg"
                />
              </div>

              {editingQuestion.type === 'PG' && editingQuestion.options && (
                <div className="space-y-2">
                  <label className="font-semibold text-slate-700">
                    Opsi Pilihan Ganda & Pilih Kunci Jawaban Benar:
                  </label>
                  {editingQuestion.options.map((opt, idx) => (
                    <div key={opt.key} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingQuestion({ ...editingQuestion, correctAns: opt.key })
                        }
                        className={`w-8 h-8 rounded-lg font-mono font-bold shrink-0 cursor-pointer ${
                          editingQuestion.correctAns === opt.key
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                        }`}
                      >
                        {opt.key}
                      </button>
                      <input
                        type="text"
                        required
                        value={opt.text}
                        onChange={(e) => {
                          const nextOpts = [...(editingQuestion.options || [])];
                          nextOpts[idx] = { ...opt, text: e.target.value };
                          setEditingQuestion({ ...editingQuestion, options: nextOpts });
                        }}
                        placeholder={`Teks pilihan ${opt.key}`}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              )}

              {editingQuestion.type === 'BS' && (
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Kunci Pernyataan</label>
                  <select
                    value={editingQuestion.correctAns || 'BENAR'}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, correctAns: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold"
                  >
                    <option value="BENAR">BENAR</option>
                    <option value="SALAH">SALAH</option>
                  </select>
                </div>
              )}

              {(editingQuestion.type === 'ISIAN' || editingQuestion.type === 'URAIAN') && (
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">
                    {editingQuestion.type === 'ISIAN'
                      ? 'Kunci Jawaban Tepat (Case-Insensitive)'
                      : 'Kata Kunci Pedoman Penskoran / Rubrik Uraian'}
                  </label>
                  <input
                    type="text"
                    required
                    value={editingQuestion.correctAns || ''}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, correctAns: e.target.value })
                    }
                    placeholder="Masukkan jawaban kunci atau kata kunci rubrik..."
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Pembahasan Soal (Opsional)</label>
                <input
                  type="text"
                  value={editingQuestion.explanation || ''}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, explanation: e.target.value })
                  }
                  placeholder="Penjelasan langkah penyelesaian..."
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingQuestion(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Soal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: DETAIL JAWABAN SISWA & KOREKSI URAIAN
      ===================================================================== */}
      {inspectingAttempt && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 max-w-3xl w-full p-6 sm:p-8 space-y-6 my-8 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <div className="text-xs font-semibold text-blue-700">
                  Pemeriksaan Lembar Jawaban & Penilaian Guru
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  {inspectingAttempt.studentName} ({inspectingAttempt.studentKelas}) ·{' '}
                  <span className="font-mono">{inspectingAttempt.examCode}</span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInspectingAttempt(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGrading} className="space-y-4 text-xs">
              <div className="space-y-3">
                {questions
                  .filter((q) => q.examId === inspectingAttempt.examId)
                  .map((q, idx) => {
                    const ans = inspectingAttempt.answers[q.id] || '(Tidak dijawab)';
                    return (
                      <div
                        key={q.id}
                        className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">
                            Soal #{idx + 1} · Tipe {q.type}
                          </span>
                          <span className="font-mono text-slate-500 tabular-nums">
                            Bobot Maks: {q.points} Poin
                          </span>
                        </div>
                        <div className="text-slate-900">{q.text}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                            <span className="text-slate-500 block">Jawaban Siswa:</span>
                            <span className="font-mono font-semibold text-blue-700">{ans}</span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                            <span className="text-slate-500 block">Kunci / Acuan:</span>
                            <span className="font-mono font-semibold text-emerald-700">
                              {q.correctAns}
                            </span>
                          </div>
                        </div>

                        {q.type === 'URAIAN' && (
                          <div className="pt-2 flex items-center justify-between gap-4 border-t border-slate-200">
                            <label className="font-bold text-blue-900">
                              Input Skor Uraian Guru (0 - {q.points}):
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={q.points}
                              value={essayScoreInputs[q.id] ?? 0}
                              onChange={(e) =>
                                setEssayScoreInputs({
                                  ...essayScoreInputs,
                                  [q.id]: Number(e.target.value),
                                })
                              }
                              className="w-28 px-3 py-1.5 font-mono font-bold bg-white border border-blue-400 rounded-lg text-right"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              <div className="space-y-1 pt-2">
                <label className="font-bold text-slate-800">Catatan Evaluasi / Umpan Balik Guru</label>
                <textarea
                  rows={2}
                  value={teacherNotesInput}
                  onChange={(e) => setTeacherNotesInput(e.target.value)}
                  placeholder="Berikan catatan evaluasi untuk siswa..."
                  className="w-full p-3 bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setInspectingAttempt(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Nilai & Catatan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
