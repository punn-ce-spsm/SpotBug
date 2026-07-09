// Kahoot-style scoring: max 1000 pts near-instant, decaying to 500 pts at time-limit.
export function computeBasePoints(responseTimeMs, timeLimitMs) {
  const ratio = Math.min(Math.max(responseTimeMs, 0) / timeLimitMs, 1);
  return Math.floor((1 - ratio / 2) * 1000);
}

// Streak bonus: +100 flat once consecutive-correct streak reaches 2+; resets on any miss.
export function applyStreak(currentStreak, wasCorrect) {
  if (!wasCorrect) return { streak: 0, bonus: 0 };
  const streak = currentStreak + 1;
  const bonus = streak >= 2 ? 100 : 0;
  return { streak, bonus };
}

export function scoreAnswer({ correct, responseTimeMs, timeLimitMs, currentStreak }) {
  const { streak, bonus } = applyStreak(currentStreak, correct);
  if (!correct) return { points: 0, streak, bonus: 0, base: 0 };
  const base = computeBasePoints(responseTimeMs, timeLimitMs);
  return { points: base + bonus, streak, bonus, base };
}
