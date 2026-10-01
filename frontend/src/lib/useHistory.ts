import { useEffect, useRef, useState } from 'react';

// Tracks a real rolling window of a polled value, client-side, for sparklines.
// No fabricated data: starts empty and fills in as the value is actually observed.
export function useHistory(value: number | null | undefined, maxPoints = 20): number[] {
  const [history, setHistory] = useState<number[]>([]);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (value == null || value === last.current) return;
    last.current = value;
    setHistory((h) => [...h, value].slice(-maxPoints));
  }, [value, maxPoints]);

  return history;
}
