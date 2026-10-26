import { useState, useEffect, useCallback } from 'react';
import type { User } from './types';
import { api, setAuthCredentials, type PublicOverviewResponse } from './api';
import { LoginView } from './components/LoginView';
import { TeacherDashboard } from './components/TeacherDashboard';
import { StudentExamFlow } from './components/StudentExamFlow';

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('sadit_user');
      return saved ? (JSON.parse(saved) as User) : null;
    } catch {
      return null;
    }
  });
  const [prefillExamCode, setPrefillExamCode] = useState<string>('');
  const [overview, setOverview] = useState<PublicOverviewResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const loadOverview = useCallback(async () => {
    try {
      const res = await api.getOverview();
      setOverview(res);
    } catch {
      // Ignore initial overview fetch errors
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleLoginSuccess = async (
    username: string,
    secret: string,
    role: 'TEACHER' | 'STUDENT',
    examCode?: string
  ) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.login(username, secret, role);
      setAuthCredentials(res.token, res.csrfToken, res.serverTime);
      localStorage.setItem('sadit_user', JSON.stringify(res.user));
      if (examCode) {
        setPrefillExamCode(examCode.trim().toUpperCase());
      } else {
        setPrefillExamCode('');
      }
      setUser(res.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal masuk ke sistem.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore logout network errors
    }
    setAuthCredentials(null, null);
    localStorage.removeItem('sadit_user');
    setUser(null);
    setPrefillExamCode('');
    await loadOverview();
  };

  const handleResetDemo = async () => {
    await api.resetDemoData();
    setAuthCredentials(null, null);
    localStorage.removeItem('sadit_user');
    setUser(null);
    await loadOverview();
  };

  if (user?.role === 'TEACHER') {
    return <TeacherDashboard user={user} onLogout={handleLogout} />;
  }

  if (user?.role === 'STUDENT') {
    return (
      <StudentExamFlow
        user={user}
        initialExamCode={prefillExamCode}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <LoginView
      overview={overview}
      onLoginSuccess={handleLoginSuccess}
      onResetDemo={handleResetDemo}
      errorMsg={errorMsg}
      isLoading={isLoading}
    />
  );
}
