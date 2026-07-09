import { useEffect, useRef, useState } from 'react';

// The server is authoritative for timing (it decides when a question ends),
// so the on-screen countdown is synced to server clock via a one-time offset
// computed from the `now` timestamp the server includes in its broadcast —
// this keeps the visible timer accurate even if the client's clock is skewed.
export function useCountdown({ questionStartTime, serverNow, timeLimitSec }) {
  const offsetRef = useRef(0);
  const [, forceTick] = useState(0);

  useEffect(() => {
    offsetRef.current = serverNow - Date.now();
  }, [serverNow, questionStartTime]);

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  const timeLimitMs = timeLimitSec * 1000;
  const elapsed = Date.now() + offsetRef.current - questionStartTime;
  const remainingMs = Math.max(0, timeLimitMs - elapsed);
  return {
    remainingMs,
    remainingSec: Math.ceil(remainingMs / 1000),
    percent: Math.max(0, Math.min(1, remainingMs / timeLimitMs)),
  };
}
