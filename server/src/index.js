import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import * as sm from './sessionManager.js';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.get('/health', (req, res) => res.json({ ok: true }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  maxHttpBufferSize: 25 * 1024 * 1024, // code-screenshot images can be a few MB each
});

function roomOf(pin) {
  return `session:${pin}`;
}

function teacherSnapshot(session) {
  return {
    pin: session.pin,
    hostToken: session.hostToken,
    phase: session.phase,
    players: sm.sanitizePlayersForTeacher(session),
    ...phaseExtras(session),
  };
}

function phaseExtras(session) {
  if (session.phase === 'question') {
    return { question: sm.getQuestionPayload(session), questionStartTime: session.questionStartTime, now: Date.now() };
  }
  if (session.phase === 'leaderboard') {
    return { leaderboard: sm.computeLeaderboard(session), questionIndex: session.currentQuestionIndex, totalQuestions: session.quiz.questions.length };
  }
  if (session.phase === 'final') {
    return { leaderboard: sm.computeLeaderboard(session) };
  }
  return {};
}

function studentSnapshot(session, player) {
  return {
    playerId: player.id,
    rejoinToken: player.rejoinToken,
    nickname: player.nickname,
    phase: session.phase,
    score: player.score,
    streak: player.streak,
    ...phaseExtras(session),
  };
}

function endQuestionAndBroadcast(pin) {
  const session = sm.getSession(pin);
  if (!session || session.phase !== 'question') return;
  const { timedOutPlayers, leaderboard } = sm.finalizeQuestion(session);
  io.to(roomOf(pin)).emit('session:questionEnded', { questionIndex: session.currentQuestionIndex });
  for (const t of timedOutPlayers) {
    const player = session.players.get(t.playerId);
    if (player?.socketId) {
      io.to(player.socketId).emit('session:answerResult', {
        correct: t.correct,
        points: t.points,
        streak: t.streak,
      });
    }
  }
  io.to(roomOf(pin)).emit('session:leaderboard', {
    leaderboard,
    questionIndex: session.currentQuestionIndex,
    totalQuestions: session.quiz.questions.length,
  });
}

io.on('connection', (socket) => {
  socket.on('teacher:createSession', (quiz, cb) => {
    const result = sm.createSession(quiz);
    if (!result.ok) return cb?.({ ok: false, error: result.error });
    const { session } = result;
    session.teacherSocketId = socket.id;
    socket.data.role = 'teacher';
    socket.data.pin = session.pin;
    socket.join(roomOf(session.pin));
    cb?.({ ok: true, pin: session.pin, hostToken: session.hostToken });
  });

  socket.on('teacher:resumeSession', ({ pin, hostToken }, cb) => {
    const session = sm.getSession(pin);
    if (!session || session.hostToken !== hostToken) {
      return cb?.({ ok: false, error: 'Session not found.' });
    }
    sm.reconnectHost(session, socket.id);
    socket.data.role = 'teacher';
    socket.data.pin = pin;
    socket.join(roomOf(pin));
    cb?.({ ok: true, ...teacherSnapshot(session) });
  });

  socket.on('teacher:startGame', ({ pin, hostToken }, cb) => {
    const session = sm.getSession(pin);
    if (!session || session.hostToken !== hostToken) return cb?.({ ok: false, error: 'Session not found.' });
    const result = sm.startGame(session);
    if (!result.ok) return cb?.({ ok: false, error: result.error });
    sm.scheduleQuestionTimeout(session, () => endQuestionAndBroadcast(pin));
    const payload = { question: sm.getQuestionPayload(session), questionStartTime: session.questionStartTime, now: Date.now() };
    io.to(roomOf(pin)).emit('session:question', payload);
    cb?.({ ok: true });
  });

  socket.on('teacher:nextQuestion', ({ pin, hostToken }, cb) => {
    const session = sm.getSession(pin);
    if (!session || session.hostToken !== hostToken) return cb?.({ ok: false, error: 'Session not found.' });
    if (session.phase !== 'leaderboard') return cb?.({ ok: false, error: 'Not ready for next question.' });
    const result = sm.nextQuestion(session);
    if (result.final) {
      io.to(roomOf(pin)).emit('session:final', { leaderboard: result.leaderboard });
    } else {
      sm.scheduleQuestionTimeout(session, () => endQuestionAndBroadcast(pin));
      io.to(roomOf(pin)).emit('session:question', {
        question: sm.getQuestionPayload(session),
        questionStartTime: session.questionStartTime,
        now: Date.now(),
      });
    }
    cb?.({ ok: true, final: Boolean(result.final) });
  });

  socket.on('teacher:endSession', ({ pin, hostToken }, cb) => {
    const session = sm.getSession(pin);
    if (!session || session.hostToken !== hostToken) return cb?.({ ok: false, error: 'Session not found.' });
    io.to(roomOf(pin)).emit('session:ended', { reason: 'The teacher ended the session.' });
    sm.destroySession(pin);
    cb?.({ ok: true });
  });

  socket.on('student:join', ({ pin, nickname, rejoinToken }, cb) => {
    const session = sm.getSession(pin);
    if (!session) return cb?.({ ok: false, error: 'No session found for that PIN.' });
    if (session.phase === 'ended') return cb?.({ ok: false, error: 'That session has ended.' });
    const result = sm.addOrRejoinPlayer(session, { nickname, rejoinToken, socketId: socket.id });
    if (!result.ok) return cb?.({ ok: false, error: result.error });
    socket.data.role = 'student';
    socket.data.pin = pin;
    socket.data.playerId = result.player.id;
    socket.join(roomOf(pin));
    if (session.teacherSocketId) {
      io.to(session.teacherSocketId).emit('session:players', sm.sanitizePlayersForTeacher(session));
    }
    cb?.({ ok: true, ...studentSnapshot(session, result.player) });
  });

  socket.on('student:tap', ({ x, y }, cb) => {
    const { pin, playerId } = socket.data;
    const session = sm.getSession(pin);
    if (!session) return cb?.({ ok: false, error: 'Session not found.' });
    const player = session.players.get(playerId);
    if (!player) return cb?.({ ok: false, error: 'Player not found.' });
    if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x > 1 || y < 0 || y > 1) {
      return cb?.({ ok: false, error: 'Invalid tap coordinates.' });
    }
    const result = sm.handleTap(session, player, x, y);
    cb?.(result);
  });

  socket.on('student:submit', (_payload, cb) => {
    const { pin, playerId } = socket.data;
    const session = sm.getSession(pin);
    if (!session) return cb?.({ ok: false, error: 'Session not found.' });
    const player = session.players.get(playerId);
    if (!player) return cb?.({ ok: false, error: 'Player not found.' });
    const result = sm.handleSubmit(session, player);
    if (result.ok) {
      socket.emit('session:answerResult', { correct: result.correct, points: result.points, streak: result.streak });
      if (session.teacherSocketId) {
        const answeredCount = Array.from(session.players.values()).filter((p) => p.answer.resolved).length;
        io.to(session.teacherSocketId).emit('session:answerProgress', { answeredCount, totalPlayers: session.players.size });
      }
    }
    cb?.(result);
  });

  socket.on('disconnect', () => {
    const { role, pin, playerId } = socket.data;
    if (!pin) return;
    const session = sm.getSession(pin);
    if (!session) return;

    if (role === 'teacher') {
      sm.markHostDisconnected(session, () => {
        io.to(roomOf(pin)).emit('session:ended', { reason: 'The teacher disconnected.' });
        sm.destroySession(pin);
      });
    } else if (role === 'student') {
      sm.markPlayerDisconnected(session, playerId, () => {
        if (session.teacherSocketId) {
          io.to(session.teacherSocketId).emit('session:players', sm.sanitizePlayersForTeacher(session));
        }
      });
      if (session.teacherSocketId) {
        io.to(session.teacherSocketId).emit('session:players', sm.sanitizePlayersForTeacher(session));
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`SpotBug relay server listening on :${PORT}`);
});
