import { nanoid } from 'nanoid';
import { isTapInsideBug } from './geometry.js';
import { scoreAnswer } from './scoring.js';

const PLAYER_DISCONNECT_GRACE_MS = 5 * 60 * 1000; // survive a phone lock/refresh mid-game
const HOST_DISCONNECT_GRACE_MS = 3 * 60 * 1000; // survive a teacher tab refresh
const MAX_QUESTIONS = 200;
const MAX_NICKNAME_LEN = 20;

const sessions = new Map(); // pin -> session

function generatePin() {
  let pin;
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000));
  } while (sessions.has(pin));
  return pin;
}

function validateQuiz(quiz) {
  if (!quiz || typeof quiz !== 'object') return 'Quiz is missing.';
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    return 'Quiz has no questions.';
  }
  if (quiz.questions.length > MAX_QUESTIONS) return 'Quiz has too many questions.';
  for (const [i, q] of quiz.questions.entries()) {
    if (!q.imageDataUrl) return `Question ${i + 1} is missing an image.`;
    if (!Array.isArray(q.bugs) || q.bugs.length === 0) {
      return `Question ${i + 1} has no bugs marked.`;
    }
    if (!q.imgWidth || !q.imgHeight) return `Question ${i + 1} is missing image dimensions.`;
    if (!q.timeLimitSec || q.timeLimitSec <= 0) return `Question ${i + 1} has an invalid time limit.`;
  }
  return null;
}

export function createSession(quiz) {
  const error = validateQuiz(quiz);
  if (error) return { ok: false, error };

  const pin = generatePin();
  const hostToken = nanoid();
  const session = {
    pin,
    quiz,
    hostToken,
    teacherSocketId: null,
    teacherConnected: true,
    hostGraceTimer: null,
    phase: 'lobby', // lobby | question | leaderboard | final | ended
    currentQuestionIndex: -1,
    questionStartTime: null,
    questionTimer: null,
    players: new Map(), // playerId -> player
    createdAt: Date.now(),
  };
  sessions.set(pin, session);
  return { ok: true, session };
}

export function getSession(pin) {
  return sessions.get(pin);
}

export function destroySession(pin) {
  const session = sessions.get(pin);
  if (!session) return;
  clearTimeout(session.questionTimer);
  clearTimeout(session.hostGraceTimer);
  for (const player of session.players.values()) {
    clearTimeout(player.disconnectGraceTimer);
  }
  sessions.delete(pin);
}

function currentQuestion(session) {
  return session.quiz.questions[session.currentQuestionIndex];
}

export function sanitizeQuestion(question, index, total) {
  return {
    questionIndex: index,
    totalQuestions: total,
    imageDataUrl: question.imageDataUrl,
    imgWidth: question.imgWidth,
    imgHeight: question.imgHeight,
    timeLimitSec: question.timeLimitSec,
    numBugs: question.bugs.length,
  };
}

export function sanitizePlayersForTeacher(session) {
  return Array.from(session.players.values()).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    connected: p.connected,
    score: p.score,
  }));
}

function freshAnswerState() {
  return {
    foundBugIds: new Set(),
    resolved: false,
    submittedAt: null,
    correct: null,
    points: 0,
  };
}

export function addOrRejoinPlayer(session, { nickname, rejoinToken, socketId }) {
  if (rejoinToken) {
    const existing = Array.from(session.players.values()).find((p) => p.rejoinToken === rejoinToken);
    if (existing) {
      clearTimeout(existing.disconnectGraceTimer);
      existing.disconnectGraceTimer = null;
      existing.connected = true;
      existing.socketId = socketId;
      return { ok: true, player: existing, isRejoin: true };
    }
    // token unknown (server restarted or session is different) — fall through to a fresh join
  }

  const trimmed = (nickname || '').trim();
  if (!trimmed) return { ok: false, error: 'Nickname is required.' };
  if (trimmed.length > MAX_NICKNAME_LEN) return { ok: false, error: 'Nickname is too long.' };

  const lower = trimmed.toLowerCase();
  const taken = Array.from(session.players.values()).some((p) => p.nicknameLower === lower);
  if (taken) return { ok: false, error: 'That nickname is already taken in this session.' };

  const player = {
    id: nanoid(),
    nickname: trimmed,
    nicknameLower: lower,
    rejoinToken: nanoid(),
    socketId,
    connected: true,
    disconnectGraceTimer: null,
    score: 0,
    streak: 0,
    prevRank: null,
    answer: freshAnswerState(),
  };
  session.players.set(player.id, player);
  return { ok: true, player, isRejoin: false };
}

export function markPlayerDisconnected(session, playerId, onExpire) {
  const player = session.players.get(playerId);
  if (!player) return;
  player.connected = false;
  clearTimeout(player.disconnectGraceTimer);
  player.disconnectGraceTimer = setTimeout(() => {
    session.players.delete(playerId);
    if (onExpire) onExpire();
  }, PLAYER_DISCONNECT_GRACE_MS);
}

export function markHostDisconnected(session, onExpire) {
  session.teacherConnected = false;
  clearTimeout(session.hostGraceTimer);
  session.hostGraceTimer = setTimeout(() => {
    onExpire();
  }, HOST_DISCONNECT_GRACE_MS);
}

export function reconnectHost(session, socketId) {
  clearTimeout(session.hostGraceTimer);
  session.hostGraceTimer = null;
  session.teacherConnected = true;
  session.teacherSocketId = socketId;
}

function beginQuestion(session) {
  session.phase = 'question';
  session.questionStartTime = Date.now();
  const q = currentQuestion(session);
  for (const player of session.players.values()) {
    player.answer = freshAnswerState();
  }
  clearTimeout(session.questionTimer);
  return q;
}

export function startGame(session) {
  if (session.phase !== 'lobby') return { ok: false, error: 'Game already started.' };
  session.currentQuestionIndex = 0;
  const q = beginQuestion(session);
  return { ok: true, question: q };
}

export function scheduleQuestionTimeout(session, callback) {
  const q = currentQuestion(session);
  clearTimeout(session.questionTimer);
  session.questionTimer = setTimeout(callback, q.timeLimitSec * 1000);
}

export function handleTap(session, player, xFrac, yFrac) {
  if (session.phase !== 'question') return { ok: false, error: 'Not accepting taps right now.' };
  if (player.answer.resolved) return { ok: false, error: 'Already answered.' };
  const q = currentQuestion(session);
  let hitBugId = null;
  for (const bug of q.bugs) {
    if (player.answer.foundBugIds.has(bug.id)) continue;
    if (isTapInsideBug(xFrac, yFrac, bug, q.imgWidth, q.imgHeight)) {
      hitBugId = bug.id;
      break;
    }
  }
  if (hitBugId) player.answer.foundBugIds.add(hitBugId);
  const allFound = player.answer.foundBugIds.size === q.bugs.length;
  return { ok: true, hit: Boolean(hitBugId), bugId: hitBugId, allFound, foundCount: player.answer.foundBugIds.size, totalBugs: q.bugs.length };
}

function resolvePlayerAnswer(session, player, correct) {
  const q = currentQuestion(session);
  const timeLimitMs = q.timeLimitSec * 1000;
  const responseTimeMs = correct
    ? Math.min(Date.now() - session.questionStartTime, timeLimitMs)
    : timeLimitMs;
  const { points, streak } = scoreAnswer({
    correct,
    responseTimeMs,
    timeLimitMs,
    currentStreak: player.streak,
  });
  player.score += points;
  player.streak = streak;
  player.answer.resolved = true;
  player.answer.submittedAt = responseTimeMs;
  player.answer.correct = correct;
  player.answer.points = points;
  return { correct, points, streak, responseTimeMs };
}

export function handleSubmit(session, player) {
  if (session.phase !== 'question') return { ok: false, error: 'Not accepting answers right now.' };
  if (player.answer.resolved) return { ok: false, error: 'Already answered.' };
  const q = currentQuestion(session);
  if (player.answer.foundBugIds.size !== q.bugs.length) {
    return { ok: false, error: 'Find all the bugs before submitting.' };
  }
  const result = resolvePlayerAnswer(session, player, true);
  return { ok: true, ...result };
}

// Called when the server-authoritative question timer fires. Any player who
// hasn't already resolved (via early submit) is scored as incorrect/timed out.
export function finalizeQuestion(session) {
  const timedOutPlayers = [];
  for (const player of session.players.values()) {
    if (!player.answer.resolved) {
      const result = resolvePlayerAnswer(session, player, false);
      timedOutPlayers.push({ playerId: player.id, ...result });
    }
  }
  session.phase = 'leaderboard';
  return { timedOutPlayers, leaderboard: computeLeaderboard(session) };
}

export function computeLeaderboard(session) {
  const ranked = Array.from(session.players.values())
    .sort((a, b) => b.score - a.score || a.nicknameLower.localeCompare(b.nicknameLower))
    .map((p, i) => {
      const rank = i + 1;
      const entry = {
        playerId: p.id,
        nickname: p.nickname,
        score: p.score,
        rank,
        prevRank: p.prevRank,
        delta: p.prevRank == null ? 0 : p.prevRank - rank,
        lastAnswerCorrect: p.answer.correct,
        lastAnswerPoints: p.answer.points,
      };
      return entry;
    });
  for (const entry of ranked) {
    session.players.get(entry.playerId).prevRank = entry.rank;
  }
  return ranked;
}

export function nextQuestion(session) {
  session.currentQuestionIndex += 1;
  if (session.currentQuestionIndex >= session.quiz.questions.length) {
    session.phase = 'final';
    return { ok: true, final: true, leaderboard: computeLeaderboard(session) };
  }
  const q = beginQuestion(session);
  return { ok: true, final: false, question: q };
}

export function getQuestionPayload(session) {
  const q = currentQuestion(session);
  return sanitizeQuestion(q, session.currentQuestionIndex, session.quiz.questions.length);
}
