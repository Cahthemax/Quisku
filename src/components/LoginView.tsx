import React, { useState } from 'react';
import {
  ShieldCheck,
  Clock,
  Save,
  Lock,
  ArrowRight,
  UserCheck,
  GraduationCap,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import type { PublicOverviewResponse } from '../api';

interface LoginViewProps {
  overview: PublicOverviewResponse | null;
  onLoginSuccess: (
    username: string,
    secret: string,
    role: 'TEACHER' | 'STUDENT',
    prefillExamCode?: string
  ) => Promise<void>;
  onResetDemo: () => Promise<void>;
  errorMsg: string | null;
  isLoading: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({
  overview,
  onLoginSuccess,
  onResetDemo,
  errorMsg,
  isLoading,
}) => {
  const [activeRole, setActiveRole] = useState<'STUDENT' | 'TEACHER'>('STUDENT');
  const [username, setUsername] = useState('andi.pratama');
  const [secret, setSecret] = useState('112233');
  const [examCode, setExamCode] = useState('MTK-XII-01');
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const handleRoleSwitch = (role: 'STUDENT' | 'TEACHER') => {
    setActiveRole(role);
    if (role === 'TEACHER') {
      setUsername('budi.santoso');
      setSecret('guru123');
    } else {
      setUsername('andi.pratama');
      setSecret('112233');
      setExamCode('MTK-XII-01');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLoginSuccess(
      username,
      secret,
      activeRole,
      activeRole === 'STUDENT' ? examCode : undefined
    );
  };

  const handleQuickReset = async () => {
    setResetting(true);
    setResetSuccess(null);
    try {
      await onResetDemo();
      setResetSuccess('Data simulasi berhasil dikembalikan ke kondisi awal.');
      setTimeout(() => setResetSuccess(null), 4000);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-blue-700 whitespace-nowrap shrink-0"
          >
            SADIT Indonesia
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#portal-login"
              className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              Portal Akses
            </a>
            <a
              href="#jadwal-ujian"
              className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              Jadwal Ujian
            </a>
            <a
              href="#arsitektur-keamanan"
              className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              Arsitektur Keamanan
            </a>
            <a
              href="#catatan-kiosk"
              className="hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              Standar Kiosk
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleQuickReset}
              disabled={resetting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
              <span>Reset Data Simulasi</span>
            </button>
          </div>
        </div>
      </header>

      {resetSuccess && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 text-center text-xs font-medium text-emerald-800 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{resetSuccess}</span>
        </div>
      )}

      {/* Main Content Split */}
      <main id="portal-login" className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 lg:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left Column: Editorial Introduction & Active Exam Schedule */}
          <div className="lg:col-span-7 space-y-8">
            <div className="space-y-4">
              <div className="text-xs font-semibold text-blue-700 tracking-wide">
                Sistem Asesmen Digital Terintegrasi · Standar Sekolah Nasional
              </div>
              <h1
                className="text-3xl sm:text-4xl lg:text-[40px] font-bold text-slate-900 tracking-tight leading-[1.15]"
                style={{ textWrap: 'balance' }}
              >
                Pelaksanaan Ulangan & Asesmen Sekolah yang Terukur, Jujur, dan Ramah Perangkat
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
                Dirancang khusus untuk kebutuhan evaluasi akademik guru dan siswa di Indonesia.
                Menggabungkan pengawasan layar penuh (Exam Mode), sinkronisasi waktu server,
                penyimpanan jawaban otomatis saat jaringan terputus, serta rekam jejak audit
                pelanggaran secara transparan tanpa melanggar privasi perangkat.
              </p>
            </div>

            {/* Key Architectural Pillars */}
            <div
              id="arsitektur-keamanan"
              className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2"
            >
              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2.5 text-slate-900 font-semibold text-sm">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Deteksi Fokus & Layar Penuh</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Memanfaatkan Page Visibility API, deteksi fokus jendela, dan Fullscreen API.
                  Mencatat waktu pelanggaran secara presisi tanpa mengakses kamera atau mikrofon.
                </p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2.5 text-slate-900 font-semibold text-sm">
                  <Save className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Autosave Ganda & Anti-Hilang</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Jawaban disimpan otomatis ke server dan memori lokal. Pelanggaran atau
                  gangguan internet tidak akan menghapus jawaban yang telah dikerjakan siswa.
                </p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2.5 text-slate-900 font-semibold text-sm">
                  <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Timer Berbasis Waktu Server</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Durasi dihitung dari stempel waktu server otoritatif. Manipulasi jam pada
                  perangkat klien tidak memengaruhi batas waktu penguncian ujian.
                </p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2.5 text-slate-900 font-semibold text-sm">
                  <Lock className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Penangguhan & Verifikasi Guru</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Jika batas pelanggaran terlampaui, sesi ujian ditangguhkan sementara dan hanya
                  dapat dibuka kembali melalui PIN Pengawas atau Dashboard Guru.
                </p>
              </div>
            </div>

            {/* Active Exams Table */}
            <div id="jadwal-ujian" className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Daftar Sesi Ujian Terdaftar di Server
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Klik salah satu baris untuk mengisi Kode Ujian pada formulir login siswa
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {overview?.activeExams.length ?? 0} Sesi
                </span>
              </div>

              <div className="divide-y divide-slate-200">
                {overview?.activeExams.map((ex) => {
                  const now = Date.now();
                  const isStarted = now >= new Date(ex.startTime).getTime();
                  const isEnded = now > new Date(ex.endTime).getTime();
                  const isActive = isStarted && !isEnded;

                  return (
                    <div
                      key={ex.id}
                      onClick={() => {
                        setActiveRole('STUDENT');
                        setExamCode(ex.code);
                      }}
                      className="px-5 py-3.5 hover:bg-blue-50/50 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-900">{ex.title}</div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{ex.subject}</span>
                          <span aria-hidden="true">·</span>
                          <span>Kelas {ex.kelas}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{ex.durationMinutes} Menit</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">KKM {ex.kkm}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`text-xs font-medium ${
                            isActive ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {isActive ? 'Jadwal Aktif' : 'Belum Dimulai (Terjadwal)'}
                        </span>
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md tabular-nums">
                          {ex.code}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Login Card */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 space-y-6">
              {/* Role Segmented Control */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleRoleSwitch('STUDENT')}
                  className={`py-2.5 px-4 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                    activeRole === 'STUDENT'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <GraduationCap className="w-4 h-4 shrink-0" />
                  <span>Login Siswa</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRoleSwitch('TEACHER')}
                  className={`py-2.5 px-4 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                    activeRole === 'TEACHER'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span>Login Guru</span>
                </button>
              </div>

              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900">
                  {activeRole === 'STUDENT'
                    ? 'Masuk Ruang Ujian Siswa'
                    : 'Masuk Portal Manajemen Guru'}
                </h2>
                <p className="text-xs text-slate-500">
                  {activeRole === 'STUDENT'
                    ? 'Gunakan Username, PIN Siswa, serta Kode Ujian dari pengawas ruangan.'
                    : 'Kelola bank soal, jadwal asesmen, pengaturan Exam Mode, nilai, dan audit log.'}
                </p>
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    {activeRole === 'STUDENT' ? 'Username / NISN Siswa' : 'Username Guru'}
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={activeRole === 'STUDENT' ? 'Contoh: andi.pratama' : 'Contoh: budi.santoso'}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    {activeRole === 'STUDENT' ? 'PIN Akses Siswa (6 Digit)' : 'Kata Sandi Guru'}
                  </label>
                  <input
                    type="password"
                    required
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={activeRole === 'STUDENT' ? 'Masukkan PIN 6 digit' : 'Masukkan kata sandi'}
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>

                {activeRole === 'STUDENT' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Kode Ujian (Opsional — dapat diisi setelah login)
                    </label>
                    <input
                      type="text"
                      value={examCode}
                      onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                      placeholder="Contoh: MTK-XII-01"
                      className="w-full px-3.5 py-2.5 text-sm font-mono font-semibold uppercase tracking-wider bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>
                    {isLoading
                      ? 'Memverifikasi Kredensial...'
                      : activeRole === 'STUDENT'
                      ? 'Masuk & Verifikasi Ujian'
                      : 'Masuk Dashboard Guru'}
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </form>

              {/* Quick Demo Account Selector */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="text-xs font-semibold text-slate-700">
                  Pilih Akun Demo Cepat (1-Klik Isi Otomatis):
                </div>

                {activeRole === 'STUDENT' ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUsername('andi.pratama');
                        setSecret('112233');
                        setExamCode('MTK-XII-01');
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer flex items-center justify-between ${
                        username === 'andi.pratama'
                          ? 'bg-blue-50 border-blue-300 text-blue-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <span className="font-semibold">Andi Pratama</span>
                        <span className="text-slate-500"> · XII MIPA 1 · Belum Mulai Ujian</span>
                      </div>
                      <span className="font-mono text-[11px] text-blue-700 tabular-nums">
                        PIN: 112233
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUsername('rizky.ramadhan');
                        setSecret('334455');
                        setExamCode('MTK-XII-01');
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer flex items-center justify-between ${
                        username === 'rizky.ramadhan'
                          ? 'bg-blue-50 border-blue-300 text-blue-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <span className="font-semibold">Rizky Ramadhan</span>
                        <span className="text-amber-700"> · Status: Ujian Ditangguhkan (3/3)</span>
                      </div>
                      <span className="font-mono text-[11px] text-blue-700 tabular-nums">
                        PIN: 334455
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUsername('nadia.putri');
                        setSecret('223344');
                        setExamCode('MTK-XII-01');
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer flex items-center justify-between ${
                        username === 'nadia.putri'
                          ? 'bg-blue-50 border-blue-300 text-blue-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <span className="font-semibold">Nadia Putri</span>
                        <span className="text-emerald-700"> · Selesai (Nilai 98 · Lulus KKM)</span>
                      </div>
                      <span className="font-mono text-[11px] text-blue-700 tabular-nums">
                        PIN: 223344
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUsername('budi.santoso');
                        setSecret('guru123');
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer flex items-center justify-between ${
                        username === 'budi.santoso'
                          ? 'bg-blue-50 border-blue-300 text-blue-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <span className="font-semibold">Drs. Budi Santoso, M.Pd.</span>
                        <span className="text-slate-500"> · Guru Matematika & Pengawas</span>
                      </div>
                      <span className="font-mono text-[11px] text-blue-700">Sandi: guru123</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUsername('siti.aminah');
                        setSecret('guru123');
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer flex items-center justify-between ${
                        username === 'siti.aminah'
                          ? 'bg-blue-50 border-blue-300 text-blue-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <span className="font-semibold">Siti Aminah, S.Pd., M.Si.</span>
                        <span className="text-slate-500"> · Guru Biologi</span>
                      </div>
                      <span className="font-mono text-[11px] text-blue-700">Sandi: guru123</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Security & Browser Limitation Disclaimer Footer */}
      <footer id="catatan-kiosk" className="bg-white border-t border-slate-200 px-6 py-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-slate-500">
          <div className="space-y-1 max-w-3xl">
            <div className="font-semibold text-slate-700">
              Catatan Teknis Keamanan Browser & Rekomendasi Kiosk Mode:
            </div>
            <p className="leading-relaxed">
              Aplikasi web ini menggunakan standar keamanan browser modern (Fullscreen API, Page
              Visibility API, Window Blur Detection, dan Audit Log Waktu Server). Namun, web
              browser standar tidak dapat menjamin penguncian perangkat 100% pada tingkat sistem
              operasi. Untuk ujian berisiko tinggi, gunakan perangkat terkelola (Managed
              Chromebook Kiosk / Safe Exam Browser) dan aplikasi ini tidak pernah mengakses
              kamera/mikrofon atau menghapus jawaban siswa.
            </p>
          </div>
          <div className="text-slate-500 whitespace-nowrap shrink-0">
            SADIT · Sistem Asesmen Digital Sekolah Indonesia
          </div>
        </div>
      </footer>
    </div>
  );
};
