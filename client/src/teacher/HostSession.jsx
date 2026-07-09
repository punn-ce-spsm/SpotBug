import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getSocket, emitWithAck } from '../lib/socket.js';
import { getQuiz } from '../lib/storage.js';
import { useCountdown } from '../lib/useCountdown.js';
import RankedList from '../components/RankedList.jsx';
import Podium from '../components/Podium.jsx';

function hostStorageKey(quizId) {
  return `spotbug_host_${quizId}`;
}

export default function HostSession() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const quiz = useRef(getQuiz(quizId)).current;

  const [phase, setPhase] = useState('connecting'); // connecting | lobby | question | leaderboard | final | ended | error
  const [errorMsg, setErrorMsg] = useState(null);
  const [players, setPlayers] = useState([]);
  const [question, setQuestion] = useState(null);
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [serverNow, setServerNow] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [answerProgress, setAnswerProgress] = useState({ answeredCount: 0, totalPlayers: 0 });
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [leaderboardQuestionIndex, setLeaderboardQuestionIndex] = useState(0);

  const sessionRef = useRef({ pin: null, hostToken: null });
  const initializedRef = useRef(false);
  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(() => {
    if (!quiz) return;
    const socket = getSocket();

    function applySnapshot(snap) {
      sessionRef.current = { pin: snap.pin, hostToken: snap.hostToken };
      localStorage.setItem(hostStorageKey(quizId), JSON.stringify({ pin: snap.pin, hostToken: snap.hostToken }));
      setPlayers(snap.players || []);
      setPhase(snap.phase);
      if (snap.phase === 'question' && snap.question) {
        setQuestion(snap.question);
        setQuestionStartTime(snap.questionStartTime);
        setServerNow(snap.now);
        setTotalQuestions(snap.question.totalQuestions);
      }
      if (snap.phase === 'leaderboard' || snap.phase === 'final') {
        setLeaderboard(snap.leaderboard || []);
        setTotalQuestions(snap.totalQuestions ?? snap.leaderboard?.length ?? 0);
        if (typeof snap.questionIndex === 'number') setLeaderboardQuestionIndex(snap.questionIndex);
      }
    }

    async function init() {
      const stored = localStorage.getItem(hostStorageKey(quizId));
      if (stored) {
        try {
          const { pin, hostToken } = JSON.parse(stored);
          const res = await emitWithAck('teacher:resumeSession', { pin, hostToken });
          if (res?.ok) {
            applySnapshot(res);
            return;
          }
        } catch {
          // fall through to creating a fresh session
        }
        localStorage.removeItem(hostStorageKey(quizId));
      }
      const res = await emitWithAck('teacher:createSession', quiz);
      if (!res?.ok) {
        setErrorMsg(res?.error || 'Could not start a session.');
        setPhase('error');
        return;
      }
      sessionRef.current = { pin: res.pin, hostToken: res.hostToken };
      localStorage.setItem(hostStorageKey(quizId), JSON.stringify({ pin: res.pin, hostToken: res.hostToken }));
      setPlayers([]);
      setPhase('lobby');
    }

    if (!initializedRef.current) {
      initializedRef.current = true;
      init();
    }

    function onConnect() {
      // Reconnecting mid-session (e.g. brief wifi drop) — reclaim our room.
      if (sessionRef.current.pin) {
        emitWithAck('teacher:resumeSession', sessionRef.current).then((res) => {
          if (res?.ok) applySnapshot(res);
        });
      }
    }
    function onPlayers(list) {
      setPlayers(list);
    }
    function onQuestion(payload) {
      setPhase('question');
      setQuestion(payload.question);
      setQuestionStartTime(payload.questionStartTime);
      setServerNow(payload.now);
      setTotalQuestions(payload.question.totalQuestions);
      setAnswerProgress({ answeredCount: 0, totalPlayers: playersRef.current.length });
    }
    function onAnswerProgress(p) {
      setAnswerProgress(p);
    }
    function onLeaderboard(payload) {
      setPhase('leaderboard');
      setLeaderboard(payload.leaderboard);
      setTotalQuestions(payload.totalQuestions);
      setLeaderboardQuestionIndex(payload.questionIndex);
    }
    function onFinal(payload) {
      setPhase('final');
      setLeaderboard(payload.leaderboard);
    }
    function onEnded(payload) {
      setPhase('ended');
      setErrorMsg(payload?.reason || 'Session ended.');
      localStorage.removeItem(hostStorageKey(quizId));
    }

    socket.on('connect', onConnect);
    socket.on('session:players', onPlayers);
    socket.on('session:question', onQuestion);
    socket.on('session:answerProgress', onAnswerProgress);
    socket.on('session:leaderboard', onLeaderboard);
    socket.on('session:final', onFinal);
    socket.on('session:ended', onEnded);

    return () => {
      socket.off('connect', onConnect);
      socket.off('session:players', onPlayers);
      socket.off('session:question', onQuestion);
      socket.off('session:answerProgress', onAnswerProgress);
      socket.off('session:leaderboard', onLeaderboard);
      socket.off('session:final', onFinal);
      socket.off('session:ended', onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  async function handleStart() {
    const res = await emitWithAck('teacher:startGame', sessionRef.current);
    if (!res?.ok) setErrorMsg(res?.error);
  }

  async function handleNext() {
    const res = await emitWithAck('teacher:nextQuestion', sessionRef.current);
    if (!res?.ok) setErrorMsg(res?.error);
  }

  async function handleEnd() {
    if (!window.confirm('End this session for everyone?')) return;
    await emitWithAck('teacher:endSession', sessionRef.current);
    localStorage.removeItem(hostStorageKey(quizId));
    navigate('/teacher');
  }

  if (!quiz) {
    return (
      <div className="app-shell">
        <div className="screen screen-center">
          <p>That quiz doesn't exist.</p>
          <Link className="btn" to="/teacher">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell wide">
      <div className="screen">
        <div className="top-bar">
          <span className="logo">Spot<span className="bug">Bug</span></span>
          {sessionRef.current.pin && <span className="badge">PIN {sessionRef.current.pin}</span>}
        </div>
        {errorMsg && phase !== 'ended' && <div className="error-banner">{errorMsg}</div>}

        {phase === 'connecting' && (
          <div className="screen-center" style={{ flex: 1 }}>
            <div className="spinner" />
            <p>Starting session…</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="screen-center" style={{ flex: 1 }}>
            <p className="error-banner">{errorMsg}</p>
            <Link className="btn" to="/teacher">Back to Dashboard</Link>
          </div>
        )}

        {phase === 'lobby' && (
          <div className="screen-center" style={{ flex: 1, gap: 20 }}>
            <p>Students go to the app and enter this PIN:</p>
            <div className="pin-display">{sessionRef.current.pin}</div>
            <h2>{players.length} player{players.length === 1 ? '' : 's'} joined</h2>
            <div className="list" style={{ width: '100%', maxWidth: 400 }}>
              {players.map((p) => (
                <div key={p.id} className="badge" style={{ opacity: p.connected ? 1 : 0.5 }}>
                  {p.nickname}{!p.connected && ' (disconnected)'}
                </div>
              ))}
            </div>
            <button className="btn green" onClick={handleStart}>Start Game</button>
          </div>
        )}

        {phase === 'question' && question && (
          <HostQuestionView
            question={question}
            questionStartTime={questionStartTime}
            serverNow={serverNow}
            answerProgress={answerProgress}
            totalPlayers={players.length}
          />
        )}

        {phase === 'leaderboard' && (
          <div className="screen" style={{ flex: 1 }}>
            <h2>Leaderboard — Question {leaderboardQuestionIndex + 1}/{totalQuestions}</h2>
            <RankedList ranking={leaderboard} />
            <button className="btn green block" onClick={handleNext}>Next</button>
          </div>
        )}

        {phase === 'final' && (
          <div className="screen" style={{ flex: 1 }}>
            <h2>Final Results 🎉</h2>
            <Podium ranking={leaderboard} />
            <RankedList ranking={leaderboard} />
            <div className="btn-row">
              <button className="btn danger block" onClick={handleEnd}>End Session</button>
            </div>
          </div>
        )}

        {phase === 'ended' && (
          <div className="screen-center" style={{ flex: 1 }}>
            <p>{errorMsg}</p>
            <Link className="btn" to="/teacher">Back to Dashboard</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function HostQuestionView({ question, questionStartTime, serverNow, answerProgress, totalPlayers }) {
  const { remainingSec, percent } = useCountdown({
    questionStartTime,
    serverNow,
    timeLimitSec: question.timeLimitSec,
  });
  return (
    <div className="screen" style={{ flex: 1 }}>
      <div className="top-bar">
        <h2>Question {question.questionIndex + 1}/{question.totalQuestions}</h2>
        <span className="badge">{remainingSec}s</span>
      </div>
      <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${percent * 100}%`, background: 'var(--purple)', transition: 'width 0.1s linear' }} />
      </div>
      <img src={question.imageDataUrl} alt="Question" style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)' }} />
      <p className="text-muted">{question.numBugs} bug(s) to find</p>
      <p><strong>{answerProgress.answeredCount}</strong> / {totalPlayers || answerProgress.totalPlayers} answered</p>
    </div>
  );
}
