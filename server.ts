import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import type {
  User,
  Exam,
  Question,
  Attempt,
  AuditLogEntry,
  ViolationType,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'sadit-db.json');

interface UserWithSecret extends User {
  secret: string; // password for teacher, PIN for student
}

interface DatabaseSchema {
  users: UserWithSecret[];
  exams: Exam[];
  questions: Question[];
  attempts: Attempt[];
  auditLogs: AuditLogEntry[];
}

interface SessionData {
  user: User;
  csrfToken: string;
  createdAt: number;
}

const sessions = new Map<string, SessionData>();

// XSS Sanitizer
function sanitizeString(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/[<>]/g, (ch) => (ch === '<' ? '‹' : '›'));
}

function sanitizePayload<T>(obj: T): T {
  if (typeof obj === 'string') {
    return sanitizeString(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizePayload(item)) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      cleaned[k] = sanitizePayload(v);
    }
    return cleaned as T;
  }
  return obj;
}

function buildInitialSeed(): DatabaseSchema {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  const tomorrowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const tomorrowEnd = new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString();
  const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const twentyMinsAgo = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
  const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

  const users: UserWithSecret[] = [
    {
      id: 'usr-t1',
      username: 'budi.santoso',
      fullName: 'Drs. Budi Santoso, M.Pd.',
      role: 'TEACHER',
      nip: '197804122005011004',
      secret: 'guru123',
    },
    {
      id: 'usr-t2',
      username: 'siti.aminah',
      fullName: 'Siti Aminah, S.Pd., M.Si.',
      role: 'TEACHER',
      nip: '198409212009022008',
      secret: 'guru123',
    },
    {
      id: 'usr-s1',
      username: 'andi.pratama',
      fullName: 'Andi Pratama',
      role: 'STUDENT',
      kelas: 'XII MIPA 1',
      nisn: '0064829101',
      secret: '112233',
    },
    {
      id: 'usr-s2',
      username: 'nadia.putri',
      fullName: 'Nadia Putri Maharani',
      role: 'STUDENT',
      kelas: 'XII MIPA 1',
      nisn: '0064829102',
      secret: '223344',
    },
    {
      id: 'usr-s3',
      username: 'rizky.ramadhan',
      fullName: 'Rizky Ramadhan',
      role: 'STUDENT',
      kelas: 'XII MIPA 1',
      nisn: '0064829103',
      secret: '334455',
    },
    {
      id: 'usr-s4',
      username: 'citra.lestari',
      fullName: 'Citra Dewi Lestari',
      role: 'STUDENT',
      kelas: 'XI MIPA 2',
      nisn: '0071928304',
      secret: '445566',
    },
    {
      id: 'usr-s5',
      username: 'fajar.nugroho',
      fullName: 'Fajar Adi Nugroho',
      role: 'STUDENT',
      kelas: 'XII MIPA 1',
      nisn: '0064829105',
      secret: '556677',
    },
  ];

  const exams: Exam[] = [
    {
      id: 'exm-1',
      title: 'Asesmen Sumatif Tengah Semester: Kalkulus & Limit Fungsi',
      subject: 'Matematika Lanjut',
      kelas: 'XII MIPA 1',
      code: 'MTK-XII-01',
      durationMinutes: 45,
      startTime: twoHoursAgo,
      endTime: sixHoursLater,
      kkm: 75,
      allowSeeResult: true,
      supervisorPin: '123456',
      instructions: [
        'Berdoalah sebelum memulai pengerjaan asesmen digital.',
        'Saat tombol MULAI UJIAN ditekan, layar akan otomatis masuk ke Mode Layar Penuh (Fullscreen Exam Mode).',
        'Dilarang berpindah tab browser, meminimalkan jendela, atau keluar dari mode layar penuh selama ujian berlangsung.',
        'Setiap aktivitas meninggalkan halaman ujian akan dicatat beserta waktu server ke dalam Audit Log Guru.',
        'Jawaban Anda disimpan secara otomatis (Autosave) ke server dan penyimpanan lokal perangkat.',
        'Jika jumlah pelanggaran mencapai batas maksimal (3 kali), ujian akan ditangguhkan sementara dan memerlukan PIN Verifikasi Guru Pengawas (PIN Demo: 123456).',
      ],
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
      createdAt: twoHoursAgo,
    },
    {
      id: 'exm-2',
      title: 'Ulangan Harian Terpadu: Sistem Peredaran Darah & Respirasi Seluler',
      subject: 'Biologi',
      kelas: 'XI MIPA 2',
      code: 'BIO-XI-02',
      durationMinutes: 40,
      startTime: twoHoursAgo,
      endTime: sixHoursLater,
      kkm: 78,
      allowSeeResult: false,
      supervisorPin: '654321',
      instructions: [
        'Pastikan koneksi perangkat stabil; fitur Autosave aktif melindungi jawaban Anda.',
        'Ujian ini menerapkan Exam Mode ketat dengan batas maksimal 3 pelanggaran perpindahan jendela/fullscreen.',
        'Hasil nilai ujian ini bersifat tertutup dan baru dapat dilihat setelah diizinkan oleh Guru Mata Pelajaran.',
      ],
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
      createdAt: twoHoursAgo,
    },
    {
      id: 'exm-3',
      title: 'Simulasi UTBK-SNBT: Penalaran Umum & Literasi Bahasa Indonesia',
      subject: 'Bahasa Indonesia',
      kelas: 'XII MIPA 1',
      code: 'LIT-XII-03',
      durationMinutes: 60,
      startTime: tomorrowStart,
      endTime: tomorrowEnd,
      kkm: 70,
      allowSeeResult: true,
      supervisorPin: '111222',
      instructions: [
        'Ujian terjadwal untuk sesi besok. Siswa belum dapat membuka lembar soal sebelum waktu jadwal dimulai.',
      ],
      security: {
        requireFullscreen: true,
        detectTabSwitch: true,
        detectWindowBlur: true,
        preventCopyPaste: true,
        maxViolations: 2,
        violationAction: 'AUTO_SUBMIT',
        autosaveIntervalSec: 10,
        shuffleQuestions: true,
      },
      createdAt: twoHoursAgo,
    },
  ];

  const questions: Question[] = [
    // Exam 1: MTK-XII-01 (Total 100 pts)
    {
      id: 'q-101',
      examId: 'exm-1',
      subject: 'Matematika Lanjut',
      type: 'PG',
      text: 'Nilai dari limit fungsi aljabar lim (x → 3) dari (x² - 9) / (x - 3) adalah...',
      options: [
        { key: 'A', text: '0' },
        { key: 'B', text: '3' },
        { key: 'C', text: '6' },
        { key: 'D', text: '9' },
        { key: 'E', text: 'Tak terdefinisi' },
      ],
      correctAns: 'C',
      points: 10,
      explanation: 'Faktorkan pembilang: (x - 3)(x + 3) / (x - 3) = x + 3. Substitusi x = 3 menghasilkan 3 + 3 = 6.',
    },
    {
      id: 'q-102',
      examId: 'exm-1',
      subject: 'Matematika Lanjut',
      type: 'PG',
      text: 'Jika f(x) = 3x⁴ - 2x³ + 5x - 7, maka turunan pertama f\'(x) pada saat x = 1 adalah...',
      options: [
        { key: 'A', text: '4' },
        { key: 'B', text: '6' },
        { key: 'C', text: '11' },
        { key: 'D', text: '13' },
        { key: 'E', text: '18' },
      ],
      correctAns: 'C',
      points: 15,
      explanation: 'f\'(x) = 12x³ - 6x² + 5. Untuk x = 1, maka f\'(1) = 12(1) - 6(1) + 5 = 11.',
    },
    {
      id: 'q-103',
      examId: 'exm-1',
      subject: 'Matematika Lanjut',
      type: 'PG',
      text: 'Persamaan garis singgung kurva y = x² - 4x + 5 pada titik dengan absis x = 3 memiliki gradien sebesar...',
      options: [
        { key: 'A', text: '-2' },
        { key: 'B', text: '1' },
        { key: 'C', text: '2' },
        { key: 'D', text: '4' },
        { key: 'E', text: '6' },
      ],
      correctAns: 'C',
      points: 15,
      explanation: 'Gradien garis singgung m = y\' = 2x - 4. Pada x = 3, m = 2(3) - 4 = 2.',
    },
    {
      id: 'q-104',
      examId: 'exm-1',
      subject: 'Matematika Lanjut',
      type: 'PG',
      text: 'Hasil dari integral tak tentu ∫ (6x² - 4x + 3) dx adalah...',
      options: [
        { key: 'A', text: '2x³ - 2x² + 3x + C' },
        { key: 'B', text: '3x³ - 2x² + 3x + C' },
        { key: 'C', text: '2x³ - 4x² + 3x + C' },
        { key: 'D', text: '12x - 4 + C' },
        { key: 'E', text: '6x³ - 2x² + 3x + C' },
      ],
      correctAns: 'A',
      points: 10,
      explanation: '∫ (6x² - 4x + 3) dx = (6/3)x³ - (4/2)x² + 3x + C = 2x³ - 2x² + 3x + C.',
    },
    {
      id: 'q-105',
      examId: 'exm-1',
      subject: 'Matematika Lanjut',
      type: 'BS',
      text: 'Pernyataan: Setiap fungsi yang kontinu pada titik x = c pasti memiliki turunan (diferensiabel) pada titik x = c tersebut.',
      correctAns: 'SALAH',
      points: 10,
      explanation: 'Salah. Contoh penyangkal adalah f(x) = |x| di x = 0 yang kontinu namun tidak diferensiabel di x = 0.',
    },
    {
      id: 'q-106',
      examId: 'exm-1',
      subject: 'Matematika Lanjut',
      type: 'BS',
      text: 'Pernyataan: Nilai dari lim (x → 0) (sin 4x) / (2x) adalah sama dengan 2.',
      correctAns: 'BENAR',
      points: 10,
      explanation: 'Benar. Berdasarkan sifat limit fungsi trigonometri, lim (x → 0) (sin ax)/(bx) = a/b = 4/2 = 2.',
    },
    {
      id: 'q-107',
      examId: 'exm-1',
      subject: 'Matematika Lanjut',
      type: 'ISIAN',
      text: 'Tentukan nilai maksimum lokal dari fungsi f(x) = -x² + 6x - 5 pada himpunan bilangan real. (Tuliskan angka saja)',
      correctAns: '4',
      points: 10,
      explanation: 'Stasioner saat f\'(x) = -2x + 6 = 0 → x = 3. Nilai maksimum f(3) = -(3)² + 6(3) - 5 = -9 + 18 - 5 = 4.',
    },
    {
      id: 'q-108',
      examId: 'exm-1',
      subject: 'Matematika Lanjut',
      type: 'URAIAN',
      text: 'Sebuah perusahaan memproduksi x unit barang dengan fungsi biaya total C(x) = x² + 20x + 300 (dalam ribuan rupiah) dan fungsi pendapatan R(x) = 100x - x². Jelaskan langkah menentukan jumlah unit x agar keuntungan maksimum, dan hitung keuntungan maksimumnya!',
      correctAns: '40',
      points: 20,
      explanation: 'Fungsi laba P(x) = R(x) - C(x) = -2x² + 80x - 300. Laba maksimum saat P\'(x) = -4x + 80 = 0 → x = 20 unit. Keuntungan maksimum P(20) = -2(400) + 80(20) - 300 = 500 ribu rupiah.',
    },

    // Exam 2: BIO-XI-02 (Total 100 pts)
    {
      id: 'q-201',
      examId: 'exm-2',
      subject: 'Biologi',
      type: 'PG',
      text: 'Komponen darah manusia yang berfungsi utama dalam proses pembekuan darah saat terjadi luka dengan mengubah protrombin menjadi trombin adalah...',
      options: [
        { key: 'A', text: 'Eritrosit (Sel Darah Merah)' },
        { key: 'B', text: 'Leukosit (Sel Darah Putih)' },
        { key: 'C', text: 'Trombosit (Keping Darah)' },
        { key: 'D', text: 'Plasma Darah' },
        { key: 'E', text: 'Limfosit T' },
      ],
      correctAns: 'C',
      points: 20,
      explanation: 'Trombosit pecah mengeluarkan trombokinase yang bersama ion Ca²⁺ dan vitamin K mengubah protrombin menjadi trombin.',
    },
    {
      id: 'q-202',
      examId: 'exm-2',
      subject: 'Biologi',
      type: 'PG',
      text: 'Tahapan respirasi aerob yang berlangsung di dalam matriks mitokondria dan menghasilkan 2 ATP, 6 NADH, serta 2 FADH₂ per molekul glukosa adalah...',
      options: [
        { key: 'A', text: 'Glikolisis' },
        { key: 'B', text: 'Siklus Krebs (Siklus Asam Sitrat)' },
        { key: 'C', text: 'Transpor Elektron' },
        { key: 'D', text: 'Fermentasi Asam Laktat' },
        { key: 'E', text: 'Fotofosforilasi' },
      ],
      correctAns: 'B',
      points: 20,
      explanation: 'Siklus Krebs terjadi di matriks mitokondria dan menghasilkan 2 ATP, 6 NADH, 2 FADH₂, serta 4 CO₂.',
    },
    {
      id: 'q-203',
      examId: 'exm-2',
      subject: 'Biologi',
      type: 'PG',
      text: 'Pembuluh darah yang membawa darah kaya oksigen dari paru-paru menuju serambi kiri jantung adalah...',
      options: [
        { key: 'A', text: 'Arteri Pulmonalis' },
        { key: 'B', text: 'Vena Pulmonalis' },
        { key: 'C', text: 'Vena Kava Superior' },
        { key: 'D', text: 'Aorta Dorsalis' },
        { key: 'E', text: 'Arteri Koronaria' },
      ],
      correctAns: 'B',
      points: 15,
      explanation: 'Vena pulmonalis adalah satu-satunya vena yang membawa darah kaya oksigen dari paru-paru ke atrium kiri jantung.',
    },
    {
      id: 'q-204',
      examId: 'exm-2',
      subject: 'Biologi',
      type: 'BS',
      text: 'Pernyataan: Pada efek Bohr, peningkatan kadar CO₂ dan penurunan pH darah di jaringan tubuh akan mempermudah pelepasan oksigen dari oksihemoglobin ke sel-sel jaringan.',
      correctAns: 'BENAR',
      points: 15,
      explanation: 'Benar. Penurunan pH menggeser kurva disosiasi oksigen ke kanan sehingga afinitas Hb terhadap O₂ menurun dan O₂ dilepas ke jaringan aktif.',
    },
    {
      id: 'q-205',
      examId: 'exm-2',
      subject: 'Biologi',
      type: 'ISIAN',
      text: 'Sebutkan nama protein pigmen respirasi di dalam eritrosit yang mengandung unsur besi (Fe) dan berfungsi mengikat oksigen!',
      correctAns: 'hemoglobin',
      points: 15,
      explanation: 'Hemoglobin (Hb) adalah metalloprotein pengikat oksigen di sel darah merah.',
    },
    {
      id: 'q-206',
      examId: 'exm-2',
      subject: 'Biologi',
      type: 'URAIAN',
      text: 'Jelaskan perbedaan mendasar antara peredaran darah pulmonalis (kecil) dan peredaran darah sistemik (besar) beserta ruang jantung yang dilaluinya!',
      correctAns: 'bilik kanan paru-paru serambi kiri bilik kiri seluruh tubuh serambi kanan',
      points: 15,
      explanation: 'Peredaran darah kecil: Bilik kanan → Arteri pulmonalis → Paru-paru → Vena pulmonalis → Serambi kiri. Peredaran darah besar: Bilik kiri → Aorta → Seluruh tubuh → Vena kava → Serambi kanan.',
    },

    // Exam 3: LIT-XII-03
    {
      id: 'q-301',
      examId: 'exm-3',
      subject: 'Bahasa Indonesia',
      type: 'PG',
      text: 'Manakah kalimat berikut yang memenuhi kaidah kalimat efektif dan kesejajaran bentuk (paralelisme) menurut PUEBI/EYD V?',
      options: [
        { key: 'A', text: 'Tahap akhir penyelesaian gedung itu adalah kegiatan pengecatan tembok, memasang penerangan, dan pengujian sistem air.' },
        { key: 'B', text: 'Tahap akhir penyelesaian gedung itu adalah pengecatan tembok, pemasangan penerangan, dan pengujian sistem air.' },
        { key: 'C', text: 'Tahap akhir penyelesaian gedung itu adalah mengecat tembok, pemasangan penerangan, dan sistem air diuji.' },
        { key: 'D', text: 'Bagi seluruh peserta ujian diharapkan hadir tepat waktu di ruangan.' },
        { key: 'E', text: 'Pertemuan itu membicarakan tentang strategi peningkatan literasi digital.' },
      ],
      correctAns: 'B',
      points: 100,
      explanation: 'Kalimat B menggunakan bentuk nomina peN-an secara sejajar: pengecatan, pemasangan, dan pengujian.',
    },
  ];

  const attempts: Attempt[] = [
    {
      id: 'att-seed-1',
      examId: 'exm-1',
      examCode: 'MTK-XII-01',
      studentId: 'usr-s2',
      studentName: 'Nadia Putri Maharani',
      studentKelas: 'XII MIPA 1',
      startedAt: thirtyMinsAgo,
      expiresAt: new Date(new Date(thirtyMinsAgo).getTime() + 45 * 60 * 1000).toISOString(),
      submittedAt: tenMinsAgo,
      lastSavedAt: tenMinsAgo,
      status: 'SUBMITTED',
      answers: {
        'q-101': 'C',
        'q-102': 'C',
        'q-103': 'C',
        'q-104': 'A',
        'q-105': 'SALAH',
        'q-106': 'BENAR',
        'q-107': '4',
        'q-108': 'Fungsi keuntungan P(x) = R(x) - C(x) = -2x^2 + 80x - 300. Turunan P\'(x) = -4x + 80 = 0 maka x = 20 unit. Keuntungan maksimum P(20) = 500 ribu rupiah.',
      },
      doubtful: {},
      essayScores: {
        'q-108': 18,
      },
      violationsCount: 1,
      objectiveScore: 80,
      essayScoreTotal: 18,
      finalScore: 98,
      maxPossibleScore: 100,
      passedKkm: true,
      teacherNotes: 'Penyelesaian kalkulus sangat sistematis dan tepat.',
      submitReason: 'MANUAL',
    },
    {
      id: 'att-seed-2',
      examId: 'exm-1',
      examCode: 'MTK-XII-01',
      studentId: 'usr-s3',
      studentName: 'Rizky Ramadhan',
      studentKelas: 'XII MIPA 1',
      startedAt: twentyMinsAgo,
      expiresAt: new Date(new Date(twentyMinsAgo).getTime() + 45 * 60 * 1000).toISOString(),
      lastSavedAt: fifteenMinsAgo,
      status: 'SUSPENDED',
      answers: {
        'q-101': 'C',
        'q-102': 'B',
        'q-103': 'C',
        'q-105': 'BENAR',
      },
      doubtful: {
        'q-102': true,
      },
      essayScores: {},
      violationsCount: 3,
      objectiveScore: 25,
      essayScoreTotal: 0,
      finalScore: 25,
      maxPossibleScore: 100,
      passedKkm: false,
      teacherNotes: 'Ditangguhkan otomatis oleh sistem setelah 3 kali keluar fullscreen / pindah tab.',
    },
    {
      id: 'att-seed-3',
      examId: 'exm-1',
      examCode: 'MTK-XII-01',
      studentId: 'usr-s5',
      studentName: 'Fajar Adi Nugroho',
      studentKelas: 'XII MIPA 1',
      startedAt: thirtyMinsAgo,
      expiresAt: new Date(new Date(thirtyMinsAgo).getTime() + 45 * 60 * 1000).toISOString(),
      submittedAt: fifteenMinsAgo,
      lastSavedAt: fifteenMinsAgo,
      status: 'SUBMITTED',
      answers: {
        'q-101': 'C',
        'q-102': 'C',
        'q-103': 'D',
        'q-104': 'A',
        'q-105': 'SALAH',
        'q-106': 'SALAH',
        'q-107': '4',
        'q-108': 'Menggunakan turunan pertama P\'(x) = 0 sehingga didapat x = 20 unit.',
      },
      doubtful: {},
      essayScores: {
        'q-108': 12,
      },
      violationsCount: 2,
      objectiveScore: 55,
      essayScoreTotal: 12,
      finalScore: 67,
      maxPossibleScore: 100,
      passedKkm: false,
      teacherNotes: 'Perlu remedial pada materi persamaan garis singgung dan limit trigonometri.',
      submitReason: 'MANUAL',
    },
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'log-1',
      attemptId: 'att-seed-1',
      examId: 'exm-1',
      examCode: 'MTK-XII-01',
      studentId: 'usr-s2',
      studentName: 'Nadia Putri Maharani',
      studentKelas: 'XII MIPA 1',
      type: 'WINDOW_BLUR',
      description: 'Fokus jendela browser hilang (notifikasi sistem muncul)',
      timestamp: twentyMinsAgo,
      violationCountAtEvent: 1,
    },
    {
      id: 'log-2',
      attemptId: 'att-seed-2',
      examId: 'exm-1',
      examCode: 'MTK-XII-01',
      studentId: 'usr-s3',
      studentName: 'Rizky Ramadhan',
      studentKelas: 'XII MIPA 1',
      type: 'EXIT_FULLSCREEN',
      description: 'Siswa keluar dari mode layar penuh (Fullscreen Exam Mode)',
      timestamp: twentyMinsAgo,
      violationCountAtEvent: 1,
    },
    {
      id: 'log-3',
      attemptId: 'att-seed-2',
      examId: 'exm-1',
      examCode: 'MTK-XII-01',
      studentId: 'usr-s3',
      studentName: 'Rizky Ramadhan',
      studentKelas: 'XII MIPA 1',
      type: 'TAB_SWITCH',
      description: 'Perpindahan tab/aplikasi terdeteksi melalui Page Visibility API (document.hidden)',
      timestamp: fifteenMinsAgo,
      violationCountAtEvent: 2,
    },
    {
      id: 'log-4',
      attemptId: 'att-seed-2',
      examId: 'exm-1',
      examCode: 'MTK-XII-01',
      studentId: 'usr-s3',
      studentName: 'Rizky Ramadhan',
      studentKelas: 'XII MIPA 1',
      type: 'TAB_SWITCH',
      description: 'Perpindahan tab terdeteksi kembali — mencapai batas maksimal 3 pelanggaran',
      timestamp: fifteenMinsAgo,
      violationCountAtEvent: 3,
    },
    {
      id: 'log-5',
      attemptId: 'att-seed-2',
      examId: 'exm-1',
      examCode: 'MTK-XII-01',
      studentId: 'usr-s3',
      studentName: 'Rizky Ramadhan',
      studentKelas: 'XII MIPA 1',
      type: 'SUSPENDED_AUTO',
      description: 'Ujian ditangguhkan otomatis oleh sistem keamanan. Menunggu verifikasi guru pengawas.',
      timestamp: fifteenMinsAgo,
      violationCountAtEvent: 3,
    },
    {
      id: 'log-6',
      attemptId: 'att-seed-3',
      examId: 'exm-1',
      examCode: 'MTK-XII-01',
      studentId: 'usr-s5',
      studentName: 'Fajar Adi Nugroho',
      studentKelas: 'XII MIPA 1',
      type: 'COPY_PASTE_ATTEMPT',
      description: 'Percobaan salin teks soal atau klik kanan diblokir oleh Exam Mode',
      timestamp: twentyMinsAgo,
      violationCountAtEvent: 1,
    },
    {
      id: 'log-7',
      attemptId: 'att-seed-3',
      examId: 'exm-1',
      examCode: 'MTK-XII-01',
      studentId: 'usr-s5',
      studentName: 'Fajar Adi Nugroho',
      studentKelas: 'XII MIPA 1',
      type: 'EXIT_FULLSCREEN',
      description: 'Siswa menekan tombol Escape / keluar dari mode layar penuh',
      timestamp: fifteenMinsAgo,
      violationCountAtEvent: 2,
    },
  ];

  return { users, exams, questions, attempts, auditLogs };
}

function loadDb(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const seed = buildInitialSeed();
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw) as DatabaseSchema;
  } catch {
    const seed = buildInitialSeed();
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
}

function saveDb(db: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

let db = loadDb();

// Calculate score helper
function recalculateAttemptScore(attempt: Attempt, exam: Exam, questions: Question[]): Attempt {
  const examQuestions = questions.filter((q) => q.examId === exam.id);
  let objectiveScore = 0;
  let essayScoreTotal = 0;
  let maxPossibleScore = 0;

  for (const q of examQuestions) {
    maxPossibleScore += q.points;
    const rawAns = (attempt.answers[q.id] || '').trim();

    if (q.type === 'PG' || q.type === 'BS') {
      if (rawAns && q.correctAns && rawAns.toUpperCase() === q.correctAns.trim().toUpperCase()) {
        objectiveScore += q.points;
      }
    } else if (q.type === 'ISIAN') {
      if (rawAns && q.correctAns && rawAns.toLowerCase() === q.correctAns.trim().toLowerCase()) {
        objectiveScore += q.points;
      }
    } else if (q.type === 'URAIAN') {
      if (typeof attempt.essayScores[q.id] === 'number') {
        essayScoreTotal += attempt.essayScores[q.id];
      } else if (rawAns.length >= 15) {
        // Heuristic initial score before teacher manual override if keywords match
        const keywords = (q.correctAns || '')
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 2);
        if (keywords.length > 0) {
          const matched = keywords.filter((kw) => rawAns.toLowerCase().includes(kw)).length;
          const ratio = Math.min(1, matched / Math.max(1, Math.ceil(keywords.length * 0.6)));
          const autoEssay = Math.round(q.points * Math.max(0.5, ratio));
          attempt.essayScores[q.id] = autoEssay;
          essayScoreTotal += autoEssay;
        } else {
          const autoEssay = Math.round(q.points * 0.75);
          attempt.essayScores[q.id] = autoEssay;
          essayScoreTotal += autoEssay;
        }
      }
    }
  }

  const rawTotal = objectiveScore + essayScoreTotal;
  const normalizedFinal =
    maxPossibleScore > 0 ? Math.round((rawTotal / maxPossibleScore) * 100) : 0;

  attempt.objectiveScore = objectiveScore;
  attempt.essayScoreTotal = essayScoreTotal;
  attempt.maxPossibleScore = maxPossibleScore;
  attempt.finalScore = normalizedFinal;
  attempt.passedKkm = normalizedFinal >= exam.kkm;
  return attempt;
}

// Check if any IN_PROGRESS attempt has expired based on server clock
function enforceServerTimers(): void {
  const nowMs = Date.now();
  let changed = false;
  for (const att of db.attempts) {
    if (att.status === 'IN_PROGRESS') {
      const expMs = new Date(att.expiresAt).getTime();
      if (nowMs >= expMs) {
        const exam = db.exams.find((e) => e.id === att.examId);
        att.status = 'SUBMITTED';
        att.submittedAt = new Date(nowMs).toISOString();
        att.submitReason = 'TIME_EXPIRED';
        if (exam) {
          recalculateAttemptScore(att, exam, db.questions);
        }
        changed = true;
      }
    }
  }
  if (changed) {
    saveDb(db);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  // Security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Sanitize all incoming request bodies
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizePayload(req.body);
    }
    next();
  });

  // Auth helper middleware
  function getSession(req: Request): SessionData | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    return sessions.get(token) || null;
  }

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const session = getSession(req);
    if (!session) {
      res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir. Silakan login kembali.' });
      return;
    }
    // Check CSRF on state-mutating requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const csrf = req.headers['x-csrf-token'];
      if (!csrf || csrf !== session.csrfToken) {
        res.status(403).json({ error: 'Token keamanan CSRF tidak valid.' });
        return;
      }
    }
    (req as Request & { userSession?: SessionData }).userSession = session;
    next();
  }

  // Public info for demo quick-fill and server clock sync
  app.get('/api/public/overview', (_req: Request, res: Response) => {
    enforceServerTimers();
    res.json({
      serverTime: new Date().toISOString(),
      activeExams: db.exams.map((e) => ({
        id: e.id,
        title: e.title,
        subject: e.subject,
        kelas: e.kelas,
        code: e.code,
        durationMinutes: e.durationMinutes,
        startTime: e.startTime,
        endTime: e.endTime,
        kkm: e.kkm,
      })),
      demoStudents: db.users
        .filter((u) => u.role === 'STUDENT')
        .map((u) => ({
          username: u.username,
          fullName: u.fullName,
          kelas: u.kelas,
          nisn: u.nisn,
          pin: u.secret,
        })),
      demoTeachers: db.users
        .filter((u) => u.role === 'TEACHER')
        .map((u) => ({
          username: u.username,
          fullName: u.fullName,
          nip: u.nip,
          password: u.secret,
        })),
    });
  });

  // Authoritative Server Time Sync
  app.get('/api/time', (_req: Request, res: Response) => {
    enforceServerTimers();
    res.json({ serverTime: new Date().toISOString() });
  });

  // Reset Demo Data
  app.post('/api/public/reset-demo', (_req: Request, res: Response) => {
    db = buildInitialSeed();
    saveDb(db);
    res.json({ message: 'Data simulasi berhasil direset ke kondisi awal.', serverTime: new Date().toISOString() });
  });

  // Login endpoint (Guru & Siswa)
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, secret, role } = req.body as {
      username?: string;
      secret?: string;
      role?: 'TEACHER' | 'STUDENT';
    };

    if (!username || !secret) {
      res.status(400).json({ error: 'Username dan kata sandi / PIN wajib diisi.' });
      return;
    }

    const found = db.users.find(
      (u) =>
        u.username.toLowerCase() === username.trim().toLowerCase() &&
        u.secret === secret.trim() &&
        (!role || u.role === role)
    );

    if (!found) {
      res.status(401).json({
        error:
          role === 'TEACHER'
            ? 'Username atau kata sandi Guru tidak ditemukan.'
            : 'Username atau PIN Siswa tidak sesuai.',
      });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    const csrfToken = crypto.randomBytes(16).toString('hex');
    const { secret: _hidden, ...safeUser } = found;

    sessions.set(token, {
      user: safeUser,
      csrfToken,
      createdAt: Date.now(),
    });

    res.json({
      user: safeUser,
      token,
      csrfToken,
      serverTime: new Date().toISOString(),
    });
  });

  app.post('/api/auth/logout', requireAuth, (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessions.delete(authHeader.slice(7).trim());
    }
    res.json({ ok: true });
  });

  // ============================================================================
  // TEACHER ENDPOINTS
  // ============================================================================
  app.get('/api/teacher/dashboard', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionData }).userSession;
    if (session.user.role !== 'TEACHER') {
      res.status(403).json({ error: 'Akses khusus Guru.' });
      return;
    }
    enforceServerTimers();
    res.json({
      serverTime: new Date().toISOString(),
      exams: db.exams,
      questions: db.questions,
      attempts: db.attempts,
      auditLogs: db.auditLogs.slice().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      students: db.users
        .filter((u) => u.role === 'STUDENT')
        .map(({ secret, ...u }) => ({ ...u, pin: secret })),
    });
  });

  // Create or Update Exam
  app.post('/api/teacher/exams', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionData }).userSession;
    if (session.user.role !== 'TEACHER') {
      res.status(403).json({ error: 'Akses khusus Guru.' });
      return;
    }

    const body = req.body as Partial<Exam>;
    if (!body.title || !body.code || !body.subject || !body.kelas) {
      res.status(400).json({ error: 'Judul, Kode Ujian, Mata Pelajaran, dan Kelas wajib diisi.' });
      return;
    }

    const normalizedCode = body.code.trim().toUpperCase();
    const duplicate = db.exams.find((e) => e.code === normalizedCode && e.id !== body.id);
    if (duplicate) {
      res.status(400).json({ error: `Kode ujian ${normalizedCode} sudah digunakan oleh ujian lain.` });
      return;
    }

    if (body.id) {
      const idx = db.exams.findIndex((e) => e.id === body.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Ujian tidak ditemukan.' });
        return;
      }
      db.exams[idx] = {
        ...db.exams[idx],
        title: body.title.trim(),
        subject: body.subject.trim(),
        kelas: body.kelas.trim(),
        code: normalizedCode,
        durationMinutes: Number(body.durationMinutes) || 45,
        startTime: body.startTime || db.exams[idx].startTime,
        endTime: body.endTime || db.exams[idx].endTime,
        kkm: Number(body.kkm) || 75,
        allowSeeResult: Boolean(body.allowSeeResult),
        supervisorPin: (body.supervisorPin || '123456').trim(),
        instructions: Array.isArray(body.instructions) && body.instructions.length > 0
          ? body.instructions
          : db.exams[idx].instructions,
        security: body.security ? { ...db.exams[idx].security, ...body.security } : db.exams[idx].security,
      };
      saveDb(db);
      res.json({ exam: db.exams[idx] });
      return;
    }

    const newExam: Exam = {
      id: `exm-${Date.now()}`,
      title: body.title.trim(),
      subject: body.subject.trim(),
      kelas: body.kelas.trim(),
      code: normalizedCode,
      durationMinutes: Number(body.durationMinutes) || 45,
      startTime: body.startTime || new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      endTime: body.endTime || new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      kkm: Number(body.kkm) || 75,
      allowSeeResult: Boolean(body.allowSeeResult),
      supervisorPin: (body.supervisorPin || '123456').trim(),
      instructions:
        Array.isArray(body.instructions) && body.instructions.length > 0
          ? body.instructions
          : [
              'Berdoalah sebelum memulai ujian.',
              'Ujian wajib dikerjakan dalam Mode Layar Penuh (Fullscreen Exam Mode).',
              'Dilarang berpindah tab atau keluar dari jendela ujian.',
              'Jawaban tersimpan otomatis secara berkala.',
            ],
      security: {
        requireFullscreen: body.security?.requireFullscreen ?? true,
        detectTabSwitch: body.security?.detectTabSwitch ?? true,
        detectWindowBlur: body.security?.detectWindowBlur ?? true,
        preventCopyPaste: body.security?.preventCopyPaste ?? true,
        maxViolations: Number(body.security?.maxViolations) || 3,
        violationAction: body.security?.violationAction || 'SUSPEND',
        autosaveIntervalSec: Number(body.security?.autosaveIntervalSec) || 15,
        shuffleQuestions: Boolean(body.security?.shuffleQuestions),
      },
      createdAt: new Date().toISOString(),
    };

    db.exams.unshift(newExam);
    saveDb(db);
    res.json({ exam: newExam });
  });

  app.delete('/api/teacher/exams/:id', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionData }).userSession;
    if (session.user.role !== 'TEACHER') {
      res.status(403).json({ error: 'Akses khusus Guru.' });
      return;
    }
    const { id } = req.params;
    db.exams = db.exams.filter((e) => e.id !== id);
    db.questions = db.questions.filter((q) => q.examId !== id);
    saveDb(db);
    res.json({ ok: true });
  });

  // Create or Update Question in Bank Soal
  app.post('/api/teacher/questions', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionData }).userSession;
    if (session.user.role !== 'TEACHER') {
      res.status(403).json({ error: 'Akses khusus Guru.' });
      return;
    }

    const body = req.body as Partial<Question>;
    if (!body.examId || !body.text || !body.type) {
      res.status(400).json({ error: 'Ujian, Tipe Soal, dan Teks Pertanyaan wajib diisi.' });
      return;
    }

    const exam = db.exams.find((e) => e.id === body.examId);
    const subject = body.subject || exam?.subject || 'Umum';

    if (body.id) {
      const idx = db.questions.findIndex((q) => q.id === body.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Soal tidak ditemukan.' });
        return;
      }
      db.questions[idx] = {
        ...db.questions[idx],
        examId: body.examId,
        subject,
        type: body.type,
        text: body.text.trim(),
        options: body.options,
        correctAns: body.correctAns?.trim() || '',
        points: Number(body.points) || 10,
        explanation: body.explanation?.trim() || '',
      };
      saveDb(db);
      res.json({ question: db.questions[idx] });
      return;
    }

    const newQuestion: Question = {
      id: `q-${Date.now()}`,
      examId: body.examId,
      subject,
      type: body.type,
      text: body.text.trim(),
      options: body.options,
      correctAns: body.correctAns?.trim() || '',
      points: Number(body.points) || 10,
      explanation: body.explanation?.trim() || '',
    };

    db.questions.push(newQuestion);
    saveDb(db);
    res.json({ question: newQuestion });
  });

  app.delete('/api/teacher/questions/:id', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionData }).userSession;
    if (session.user.role !== 'TEACHER') {
      res.status(403).json({ error: 'Akses khusus Guru.' });
      return;
    }
    db.questions = db.questions.filter((q) => q.id !== req.params.id);
    saveDb(db);
    res.json({ ok: true });
  });

  // Teacher Unlock / Resume Suspended Student Attempt
  app.post('/api/teacher/attempts/:id/unlock', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionData }).userSession;
    if (session.user.role !== 'TEACHER') {
      res.status(403).json({ error: 'Akses khusus Guru.' });
      return;
    }
    const attempt = db.attempts.find((a) => a.id === req.params.id);
    if (!attempt) {
      res.status(404).json({ error: 'Data pengerjaan siswa tidak ditemukan.' });
      return;
    }

    attempt.status = 'IN_PROGRESS';
    attempt.violationsCount = Math.max(0, attempt.violationsCount - 1);
    attempt.teacherNotes = `Dibuka kembali oleh ${session.user.fullName} pada ${new Date().toLocaleTimeString('id-ID')}`;

    db.auditLogs.push({
      id: `log-${Date.now()}`,
      attemptId: attempt.id,
      examId: attempt.examId,
      examCode: attempt.examCode,
      studentId: attempt.studentId,
      studentName: attempt.studentName,
      studentKelas: attempt.studentKelas,
      type: 'TEACHER_UNLOCK',
      description: `Penangguhan ujian dibuka oleh Guru (${session.user.fullName}). Siswa diizinkan melanjutkan.`,
      timestamp: new Date().toISOString(),
      violationCountAtEvent: attempt.violationsCount,
    });

    saveDb(db);
    res.json({ attempt });
  });

  // Teacher Grade Essay / Update Feedback
  app.post('/api/teacher/attempts/:id/grade', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionData }).userSession;
    if (session.user.role !== 'TEACHER') {
      res.status(403).json({ error: 'Akses khusus Guru.' });
      return;
    }
    const attempt = db.attempts.find((a) => a.id === req.params.id);
    if (!attempt) {
      res.status(404).json({ error: 'Data pengerjaan siswa tidak ditemukan.' });
      return;
    }
    const exam = db.exams.find((e) => e.id === attempt.examId);
    if (!exam) {
      res.status(404).json({ error: 'Ujian tidak ditemukan.' });
      return;
    }

    const { essayScores, teacherNotes } = req.body as {
      essayScores?: Record<string, number>;
      teacherNotes?: string;
    };

    if (essayScores && typeof essayScores === 'object') {
      for (const [qId, val] of Object.entries(essayScores)) {
        attempt.essayScores[qId] = Math.max(0, Number(val) || 0);
      }
    }
    if (typeof teacherNotes === 'string') {
      attempt.teacherNotes = teacherNotes.trim();
    }

    recalculateAttemptScore(attempt, exam, db.questions);
    saveDb(db);
    res.json({ attempt });
  });

  // ============================================================================
  // STUDENT EXAM FLOW ENDPOINTS
  // ============================================================================

  // Step 1: Verify Exam Code & Schedule -> Return Instructions
  app.post('/api/student/verify-code', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionData }).userSession;
    const { code } = req.body as { code?: string };
    if (!code) {
      res.status(400).json({ error: 'Masukkan kode ujian terlebih dahulu.' });
      return;
    }

    enforceServerTimers();
    const normalizedCode = code.trim().toUpperCase();
    const exam = db.exams.find((e) => e.code === normalizedCode);
    if (!exam) {
      res.status(404).json({ error: `Kode ujian "${normalizedCode}" tidak ditemukan. Periksa kembali kode dari Guru.` });
      return;
    }

    const nowMs = Date.now();
    const startMs = new Date(exam.startTime).getTime();
    const endMs = new Date(exam.endTime).getTime();

    if (nowMs < startMs) {
      res.status(403).json({
        error: `Ujian "${exam.title}" belum dimulai. Jadwal mulai: ${new Date(exam.startTime).toLocaleString('id-ID')}. Siswa tidak dapat membuka soal sebelum jadwal.`,
        scheduleLocked: true,
        exam: {
          title: exam.title,
          subject: exam.subject,
          kelas: exam.kelas,
          code: exam.code,
          startTime: exam.startTime,
          endTime: exam.endTime,
        },
      });
      return;
    }

    if (nowMs > endMs) {
      res.status(403).json({
        error: `Jadwal pelaksanaan ujian "${exam.title}" telah berakhir pada ${new Date(exam.endTime).toLocaleString('id-ID')}.`,
        scheduleLocked: true,
      });
      return;
    }

    const questionCount = db.questions.filter((q) => q.examId === exam.id).length;
    const existingAttempt = db.attempts.find(
      (a) => a.examId === exam.id && a.studentId === session.user.id
    );

    res.json({
      serverTime: new Date().toISOString(),
      exam: {
        ...exam,
        supervisorPin: undefined, // Never leak supervisor PIN to student client
      },
      questionCount,
      existingAttempt: existingAttempt || null,
    });
  });

  // Step 2: Start or Resume Exam -> Activate Attempt & Server Timer
  app.post('/api/student/start-exam', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionData }).userSession;
    const { examId } = req.body as { examId?: string };

    enforceServerTimers();
    const exam = db.exams.find((e) => e.id === examId);
    if (!exam) {
      res.status(404).json({ error: 'Ujian tidak ditemukan.' });
      return;
    }

    const nowMs = Date.now();
    if (nowMs < new Date(exam.startTime).getTime()) {
      res.status(403).json({ error: 'Ujian belum dimulai sesuai waktu server.' });
      return;
    }
    if (nowMs > new Date(exam.endTime).getTime()) {
      res.status(403).json({ error: 'Waktu jadwal ujian telah ditutup.' });
      return;
    }

    let attempt = db.attempts.find(
      (a) => a.examId === exam.id && a.studentId === session.user.id
    );

    if (!attempt) {
      const startedAt = new Date(nowMs).toISOString();
      const expiresAt = new Date(nowMs + exam.durationMinutes * 60 * 1000).toISOString();
      attempt = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        examId: exam.id,
        examCode: exam.code,
        studentId: session.user.id,
        studentName: session.user.fullName,
        studentKelas: session.user.kelas || 'XII MIPA 1',
        startedAt,
        expiresAt,
        lastSavedAt: startedAt,
        status: 'IN_PROGRESS',
        answers: {},
        doubtful: {},
        essayScores: {},
        violationsCount: 0,
        objectiveScore: 0,
        essayScoreTotal: 0,
        finalScore: 0,
        maxPossibleScore: 100,
        passedKkm: false,
      };
      db.attempts.push(attempt);
      saveDb(db);
    }

    // Prepare sanitized questions (strip correctAns and explanation while exam is active)
    const examQuestions = db.questions
      .filter((q) => q.examId === exam.id)
      .map(({ correctAns: _c, explanation: _e, ...safeQ }) => safeQ);

    res.json({
      serverTime: new Date().toISOString(),
      exam: {
        ...exam,
        supervisorPin: undefined,
      },
      attempt,
      questions: examQuestions,
    });
  });

  // Step 3: Autosave Student Answers (Periodic & Real-Time Recovery)
  app.post('/api/student/attempts/:id/autosave', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionData }).userSession;
    enforceServerTimers();

    const attempt = db.attempts.find(
      (a) => a.id === req.params.id && a.studentId === session.user.id
    );
    if (!attempt) {
      res.status(404).json({ error: 'Sesi pengerjaan ujian tidak ditemukan.' });
      return;
    }

    if (attempt.status === 'SUBMITTED') {
      res.status(409).json({
        error: 'Waktu ujian telah habis atau ujian telah dikirim sebelumnya.',
        attempt,
        autoSubmitted: true,
      });
      return;
    }

    const { answers, doubtful } = req.body as {
      answers?: Record<string, string>;
      doubtful?: Record<string, boolean>;
    };

    if (answers && typeof answers === 'object') {
      attempt.answers = { ...attempt.answers, ...answers };
    }
    if (doubtful && typeof doubtful === 'object') {
      attempt.doubtful = { ...attempt.doubtful, ...doubtful };
    }
    attempt.lastSavedAt = new Date().toISOString();

    const exam = db.exams.find((e) => e.id === attempt.examId);
    if (exam) {
      recalculateAttemptScore(attempt, exam, db.questions);
    }

    saveDb(db);
    res.json({
      serverTime: new Date().toISOString(),
      lastSavedAt: attempt.lastSavedAt,
      status: attempt.status,
      violationsCount: attempt.violationsCount,
    });
  });

  // Step 4: Log Security Violation (Page Visibility, Blur, Fullscreen Exit, Copy-Paste)
  app.post('/api/student/attempts/:id/violation', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionData }).userSession;
    enforceServerTimers();

    const attempt = db.attempts.find(
      (a) => a.id === req.params.id && a.studentId === session.user.id
    );
    if (!attempt) {
      res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
      return;
    }

    if (attempt.status !== 'IN_PROGRESS') {
      res.json({
        serverTime: new Date().toISOString(),
        attempt,
      });
      return;
    }

    const { type, description, answers, doubtful } = req.body as {
      type?: ViolationType;
      description?: string;
      answers?: Record<string, string>;
      doubtful?: Record<string, boolean>;
    };

    // Preserve student answers first (NEVER delete answers on violation!)
    if (answers && typeof answers === 'object') {
      attempt.answers = { ...attempt.answers, ...answers };
    }
    if (doubtful && typeof doubtful === 'object') {
      attempt.doubtful = { ...attempt.doubtful, ...doubtful };
    }
    attempt.lastSavedAt = new Date().toISOString();

    const exam = db.exams.find((e) => e.id === attempt.examId);
    const maxViolations = exam?.security.maxViolations ?? 3;
    const action = exam?.security.violationAction ?? 'SUSPEND';

    attempt.violationsCount += 1;
    const nowIso = new Date().toISOString();

    const logEntry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      attemptId: attempt.id,
      examId: attempt.examId,
      examCode: attempt.examCode,
      studentId: attempt.studentId,
      studentName: attempt.studentName,
      studentKelas: attempt.studentKelas,
      type: type || 'TAB_SWITCH',
      description: description || 'Terdeteksi aktivitas meninggalkan halaman ujian',
      timestamp: nowIso,
      violationCountAtEvent: attempt.violationsCount,
    };
    db.auditLogs.push(logEntry);

    if (attempt.violationsCount >= maxViolations) {
      if (action === 'AUTO_SUBMIT') {
        attempt.status = 'SUBMITTED';
        attempt.submittedAt = nowIso;
        attempt.submitReason = 'MAX_VIOLATIONS';
        if (exam) {
          recalculateAttemptScore(attempt, exam, db.questions);
        }
      } else {
        attempt.status = 'SUSPENDED';
        db.auditLogs.push({
          id: `log-${Date.now()}-susp`,
          attemptId: attempt.id,
          examId: attempt.examId,
          examCode: attempt.examCode,
          studentId: attempt.studentId,
          studentName: attempt.studentName,
          studentKelas: attempt.studentKelas,
          type: 'SUSPENDED_AUTO',
          description: `Ujian ditangguhkan otomatis karena mencapai batas ${maxViolations} pelanggaran. Jawaban tersimpan aman.`,
          timestamp: nowIso,
          violationCountAtEvent: attempt.violationsCount,
        });
      }
    }

    saveDb(db);
    res.json({
      serverTime: nowIso,
      attempt,
      latestLog: logEntry,
    });
  });

  // Step 5: Verify Supervisor PIN on Suspended Exam Screen
  app.post('/api/student/attempts/:id/verify-supervisor', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionData }).userSession;
    const attempt = db.attempts.find(
      (a) => a.id === req.params.id && a.studentId === session.user.id
    );
    if (!attempt) {
      res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
      return;
    }

    const exam = db.exams.find((e) => e.id === attempt.examId);
    if (!exam) {
      res.status(404).json({ error: 'Data ujian tidak ditemukan.' });
      return;
    }

    const { supervisorPin } = req.body as { supervisorPin?: string };
    if (!supervisorPin || supervisorPin.trim() !== exam.supervisorPin) {
      res.status(403).json({
        error: 'PIN Verifikasi Pengawas / Guru tidak sesuai. Hubungi Guru Pengawas ruangan Anda.',
      });
      return;
    }

    attempt.status = 'IN_PROGRESS';
    // Reset 1 violation slot so student can continue carefully
    attempt.violationsCount = Math.max(0, exam.security.maxViolations - 1);

    db.auditLogs.push({
      id: `log-${Date.now()}-pin`,
      attemptId: attempt.id,
      examId: attempt.examId,
      examCode: attempt.examCode,
      studentId: attempt.studentId,
      studentName: attempt.studentName,
      studentKelas: attempt.studentKelas,
      type: 'TEACHER_UNLOCK',
      description: 'Ujian dibuka kembali melalui verifikasi PIN Pengawas Guru di perangkat siswa.',
      timestamp: new Date().toISOString(),
      violationCountAtEvent: attempt.violationsCount,
    });

    saveDb(db);
    res.json({
      serverTime: new Date().toISOString(),
      attempt,
    });
  });

  // Step 6: Submit Exam
  app.post('/api/student/attempts/:id/submit', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionData }).userSession;
    const attempt = db.attempts.find(
      (a) => a.id === req.params.id && a.studentId === session.user.id
    );
    if (!attempt) {
      res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
      return;
    }

    const exam = db.exams.find((e) => e.id === attempt.examId);
    if (!exam) {
      res.status(404).json({ error: 'Ujian tidak ditemukan.' });
      return;
    }

    const { answers, doubtful, submitReason } = req.body as {
      answers?: Record<string, string>;
      doubtful?: Record<string, boolean>;
      submitReason?: 'MANUAL' | 'TIME_EXPIRED' | 'MAX_VIOLATIONS';
    };

    if (answers && typeof answers === 'object') {
      attempt.answers = { ...attempt.answers, ...answers };
    }
    if (doubtful && typeof doubtful === 'object') {
      attempt.doubtful = { ...attempt.doubtful, ...doubtful };
    }

    const nowIso = new Date().toISOString();
    attempt.status = 'SUBMITTED';
    attempt.submittedAt = nowIso;
    attempt.lastSavedAt = nowIso;
    attempt.submitReason = submitReason || 'MANUAL';

    recalculateAttemptScore(attempt, exam, db.questions);
    saveDb(db);

    // Respect allowSeeResult setting!
    const safeAttempt: Attempt = exam.allowSeeResult
      ? attempt
      : {
          ...attempt,
          objectiveScore: 0,
          essayScoreTotal: 0,
          finalScore: 0,
        };

    res.json({
      serverTime: nowIso,
      allowSeeResult: exam.allowSeeResult,
      kkm: exam.kkm,
      attempt: safeAttempt,
      questionsWithKey: exam.allowSeeResult
        ? db.questions.filter((q) => q.examId === exam.id)
        : [],
    });
  });

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SADIT Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
