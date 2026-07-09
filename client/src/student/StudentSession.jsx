import { useEffect, useRef, useState } from 'react';
import { getSocket, emitWithAck } from '../lib/socket.js';
import { eventToImageFraction } from '../lib/geometry.js';
import { useCountdown } from '../lib/useCountdown.js';
import RankedList from '../components/RankedList.jsx';
import Podium from '../components/Podium.jsx';

export default function StudentSession({ pin, initialSnapshot, onLeave }) {
  const [phase, setPhase] = useState(initialSnapshot.phase);
  const [question, setQuestion] = useState(initialSnapshot.question || null);
  const [questionStartTime, setQuestionStartTime] = useState(initialSnapshot.questionStartTime || null);
  const [serverNow, setServerNow] = useState(initialSnapshot.now || null);
  const [foundMarkers, setFoundMarkers] = useState([]);
  const [missFlash, setMissFlash] = useState(null);
  const [resolved, setResolved] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [answerResult, setAnswerResult] = useState(null);
  const [leaderboard, setLeaderboard] = useState(initialSnapshot.leaderboard || []);
  const [totalQuestions, setTotalQuestions] = useState(initialSnapshot.question?.totalQuestions ?? initialSnapshot.totalQuestions ?? 0);
  const [connErrorMsg, setConnErrorMsg] = useState(null);
  const [myScore, setMyScore] = useState(initialSnapshot.score || 0);
  const [myStreak, setMyStreak] = useState(initialSnapshot.streak || 0);

  const imgRef = useRef(null);
  const resolvedRef = useRef(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();

    function onQuestion(payload) {
      setQuestion(payload.question);
      setQuestionStartTime(payload.questionStartTime);
      setServerNow(payload.now);
      setTotalQuestions(payload.question.totalQuestions);
      setFoundMarkers([]);
      setMissFlash(null);
      setResolved(false);
      resolvedRef.current = false;
      submittingRef.current = false;
      setTimeUp(false);
      setAnswerResult(null);
      setPhase('question');
    }
    function onQuestionEnded() {
      setTimeUp(true);
    }
    function onAnswerResult(payload) {
      setAnswerResult(payload);
      setMyScore((s) => s + payload.points);
      setMyStreak(payload.streak);
      setPhase('feedback');
    }
    function onLeaderboard(payload) {
      setLeaderboard(payload.leaderboard);
      setTotalQuestions(payload.totalQuestions);
      setPhase('leaderboard');
    }
    function onFinal(payload) {
      setLeaderboard(payload.leaderboard);
      setPhase('final');
    }
    function onEnded(payload) {
      setConnErrorMsg(payload?.reason || 'The session ended.');
      setPhase('ended');
    }

    socket.on('session:question', onQuestion);
    socket.on('session:questionEnded', onQuestionEnded);
    socket.on('session:answerResult', onAnswerResult);
    socket.on('session:leaderboard', onLeaderboard);
    socket.on('session:final', onFinal);
    socket.on('session:ended', onEnded);

    return () => {
      socket.off('session:question', onQuestion);
      socket.off('session:questionEnded', onQuestionEnded);
      socket.off('session:answerResult', onAnswerResult);
      socket.off('session:leaderboard', onLeaderboard);
      socket.off('session:final', onFinal);
      socket.off('session:ended', onEnded);
    };
  }, []);

  async function submitAnswer() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    await emitWithAck('student:submit', {});
  }

  async function handlePointerDown(e) {
    if (phase !== 'question' || resolvedRef.current || timeUp) return;
    const { x, y } = eventToImageFraction(e, imgRef.current);
    const res = await emitWithAck('student:tap', { x, y });
    if (!res?.ok) return;
    if (res.hit) {
      setFoundMarkers((prev) => [...prev, { bugId: res.bugId, x, y }]);
    } else {
      const key = Date.now() + Math.random();
      setMissFlash({ x, y, key });
      setTimeout(() => setMissFlash((cur) => (cur?.key === key ? null : cur)), 500);
    }
    if (res.allFound) {
      resolvedRef.current = true;
      setResolved(true);
      submitAnswer();
    }
  }

  if (phase === 'lobby') {
    return (
      <Shell pin={pin}>
        <div className="screen-center" style={{ flex: 1 }}>
          <h2>You're in!</h2>
          <p className="text-muted">Waiting for the host to start the game…</p>
          <div className="spinner" />
        </div>
      </Shell>
    );
  }

  if (phase === 'question' && question) {
    return (
      <Shell pin={pin}>
        <QuestionView
          question={question}
          questionStartTime={questionStartTime}
          serverNow={serverNow}
          imgRef={imgRef}
          onPointerDown={handlePointerDown}
          foundMarkers={foundMarkers}
          missFlash={missFlash}
          resolved={resolved}
          timeUp={timeUp}
        />
      </Shell>
    );
  }

  if (phase === 'feedback') {
    return (
      <Shell pin={pin}>
        <div className="screen-center" style={{ flex: 1 }}>
          <h1 style={{ color: answerResult?.correct ? 'var(--green)' : 'var(--red)' }}>
            {answerResult?.correct ? 'Correct!' : "Time's Up"}
          </h1>
          <p style={{ fontSize: 32, fontWeight: 800 }}>+{answerResult?.points ?? 0} pts</p>
          {answerResult?.streak >= 2 && <p className="badge">🔥 Streak x{answerResult.streak}!</p>}
          <p className="text-muted">Waiting for other players…</p>
        </div>
      </Shell>
    );
  }

  if (phase === 'leaderboard') {
    return (
      <Shell pin={pin}>
        <div className="screen" style={{ flex: 1 }}>
          <h2>Leaderboard</h2>
          <p className="text-muted">Your score: {myScore}</p>
          <RankedList ranking={leaderboard} highlightPlayerId={initialSnapshot.playerId} />
          <p className="text-muted">Waiting for the next question…</p>
        </div>
      </Shell>
    );
  }

  if (phase === 'final') {
    return (
      <Shell pin={pin}>
        <div className="screen" style={{ flex: 1 }}>
          <h2>Final Results 🎉</h2>
          <Podium ranking={leaderboard} />
          <RankedList ranking={leaderboard} highlightPlayerId={initialSnapshot.playerId} />
          <button className="btn block" onClick={onLeave}>Play Again</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell pin={pin}>
      <div className="screen-center" style={{ flex: 1 }}>
        <p>{connErrorMsg || 'Disconnected.'}</p>
        <button className="btn" onClick={onLeave}>Back to Join Screen</button>
      </div>
    </Shell>
  );
}

function Shell({ pin, children }) {
  return (
    <div className="app-shell">
      <div className="screen">
        <div className="top-bar">
          <span className="logo">Spot<span className="bug">Bug</span></span>
          <span className="badge">PIN {pin}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function QuestionView({ question, questionStartTime, serverNow, imgRef, onPointerDown, foundMarkers, missFlash, resolved, timeUp }) {
  const { remainingSec, percent } = useCountdown({
    questionStartTime,
    serverNow,
    timeLimitSec: question.timeLimitSec,
  });
  const foundCount = foundMarkers.length;
  return (
    <div className="screen" style={{ flex: 1 }}>
      <div className="top-bar">
        <span>Q{question.questionIndex + 1}/{question.totalQuestions}</span>
        <span className="badge">{remainingSec}s</span>
      </div>
      <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${percent * 100}%`, background: 'var(--purple)', transition: 'width 0.1s linear' }} />
      </div>
      <div style={{ position: 'relative', lineHeight: 0, touchAction: 'none' }} onPointerDown={onPointerDown}>
        <img
          ref={imgRef}
          src={question.imageDataUrl}
          alt="Find the bug"
          style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12 }}
          draggable={false}
        />
        {foundMarkers.map((m, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${m.x * 100}%`,
              top: `${m.y * 100}%`,
              width: 32,
              height: 32,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              background: 'var(--green)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: 18,
              border: '2px solid #fff',
            }}
          >
            ✓
          </div>
        ))}
        {missFlash && (
          <div
            style={{
              position: 'absolute',
              left: `${missFlash.x * 100}%`,
              top: `${missFlash.y * 100}%`,
              width: 28,
              height: 28,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              background: 'rgba(226,27,60,0.85)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
            }}
          >
            ×
          </div>
        )}
      </div>
      <p style={{ textAlign: 'center', fontWeight: 700 }}>
        {foundCount} / {question.numBugs} bugs found
      </p>
      {resolved && <p className="text-muted" style={{ textAlign: 'center' }}>All found! Locking in your answer…</p>}
      {timeUp && !resolved && <p className="text-muted" style={{ textAlign: 'center' }}>Time's up!</p>}
    </div>
  );
}
