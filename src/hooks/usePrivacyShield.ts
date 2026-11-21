import { useCallback, useEffect, useRef, useState } from 'react';

const UNLOCK_DURATION_SECONDS = 60;

export function usePrivacyShield() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const expiresAtRef = useRef<number>(0);

  const lockNow = useCallback(() => {
    expiresAtRef.current = 0;
    setIsUnlocked(false);
    setSecondsLeft(0);
  }, []);

  const unlockFor60s = useCallback(() => {
    expiresAtRef.current = Date.now() + UNLOCK_DURATION_SECONDS * 1000;
    setIsUnlocked(true);
    setSecondsLeft(UNLOCK_DURATION_SECONDS);
  }, []);

  useEffect(() => {
    if (!isUnlocked) return;

    const timer = window.setInterval(() => {
      const remaining = Math.ceil((expiresAtRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        expiresAtRef.current = 0;
        setIsUnlocked(false);
        setSecondsLeft(0);
      } else {
        setSecondsLeft(remaining);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isUnlocked]);

  return {
    isUnlocked,
    secondsLeft,
    unlockFor60s,
    lockNow,
  };
}
