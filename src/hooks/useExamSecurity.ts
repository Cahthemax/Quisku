import { useEffect, useRef, useState, useCallback } from 'react';
import type { ExamSecurityConfig, ViolationType } from '../types';

interface UseExamSecurityOptions {
  enabled: boolean;
  security: ExamSecurityConfig;
  onViolation: (type: ViolationType, description: string) => void;
}

export function useExamSecurity({
  enabled,
  security,
  onViolation,
}: UseExamSecurityOptions) {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [fullscreenSupported, setFullscreenSupported] = useState<boolean>(true);
  const lastViolationTimeRef = useRef<number>(0);
  const hadFullscreenOnceRef = useRef<boolean>(false);

  const triggerGuardedViolation = useCallback(
    (type: ViolationType, description: string) => {
      if (!enabled) return;
      const now = Date.now();
      // Prevent double-counting when blur + visibilitychange fire simultaneously
      if (now - lastViolationTimeRef.current < 1200) {
        return;
      }
      lastViolationTimeRef.current = now;
      onViolation(type, description);
    },
    [enabled, onViolation]
  );

  const enterFullscreen = useCallback(async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        hadFullscreenOnceRef.current = true;
        setIsFullscreen(true);
        return true;
      }
      setFullscreenSupported(false);
      setIsFullscreen(true);
      return false;
    } catch {
      // In restricted iframe sandboxes where Fullscreen API is blocked by parent permissions
      setFullscreenSupported(false);
      setIsFullscreen(true);
      return false;
    }
  }, []);

  const exitFullscreenCleanly = useCallback(async () => {
    hadFullscreenOnceRef.current = false;
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore
    }
    setIsFullscreen(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // 1. Page Visibility API (Tab Switch / Minimize)
    const handleVisibilityChange = () => {
      if (document.hidden && security.detectTabSwitch) {
        triggerGuardedViolation(
          'TAB_SWITCH',
          'Terdeteksi perpindahan tab atau jendela browser disembunyikan (Page Visibility API).'
        );
      }
    };

    // 2. Window Blur / Focus Lost Detection
    const handleWindowBlur = () => {
      if (security.detectWindowBlur && !document.hidden) {
        triggerGuardedViolation(
          'WINDOW_BLUR',
          'Terdeteksi kehilangan fokus dari halaman ujian (membuka aplikasi lain atau jendela pop-up).'
        );
      }
    };

    // 3. Fullscreen Change Detection
    const handleFullscreenChange = () => {
      const currentlyFull = Boolean(document.fullscreenElement);
      setIsFullscreen(currentlyFull);
      if (!currentlyFull && hadFullscreenOnceRef.current && security.requireFullscreen) {
        triggerGuardedViolation(
          'EXIT_FULLSCREEN',
          'Terdeteksi keluar dari mode layar penuh (Fullscreen Exam Mode).'
        );
      }
    };

    // 4. Anti Copy-Paste, Right Click & Shortcut Protection
    const handleContextMenu = (e: MouseEvent) => {
      if (security.preventCopyPaste) {
        e.preventDefault();
      }
    };

    const handleCopyCutPaste = (e: ClipboardEvent) => {
      if (security.preventCopyPaste) {
        e.preventDefault();
        triggerGuardedViolation(
          'COPY_PASTE_ATTEMPT',
          `Percobaan ${e.type.toUpperCase()} pada lembar soal ujian diblokir.`
        );
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!security.preventCopyPaste) return;
      const key = e.key.toLowerCase();
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
        (e.ctrlKey && ['u', 'p', 's'].includes(key))
      ) {
        e.preventDefault();
        triggerGuardedViolation(
          'COPY_PASTE_ATTEMPT',
          `Pintasan keyboard terlarang (${e.ctrlKey ? 'Ctrl+' : ''}${e.key.toUpperCase()}) terdeteksi.`
        );
      }
    };

    // 5. Prevent Accidental Page Navigation / Reload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Ujian sedang berlangsung. Meninggalkan halaman akan tercatat sebagai pelanggaran.';
      return e.returnValue;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopyCutPaste);
    document.addEventListener('cut', handleCopyCutPaste);
    document.addEventListener('paste', handleCopyCutPaste);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopyCutPaste);
      document.removeEventListener('cut', handleCopyCutPaste);
      document.removeEventListener('paste', handleCopyCutPaste);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, security, triggerGuardedViolation]);

  return {
    isFullscreen,
    fullscreenSupported,
    enterFullscreen,
    exitFullscreenCleanly,
    triggerManualViolation: triggerGuardedViolation,
  };
}
