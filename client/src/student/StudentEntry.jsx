import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { emitWithAck } from '../lib/socket.js';
import StudentSession from './StudentSession.jsx';

const SESSION_KEY = 'spotbug_player_session';
const NICKNAME_KEY = 'spotbug_last_nickname';

function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function StudentEntry() {
  const [mode, setMode] = useState('checking'); // checking | form | joined
  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState(() => localStorage.getItem(NICKNAME_KEY) || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [joinedState, setJoinedState] = useState(null); // { pin, snapshot }
  const attemptedRejoin = useRef(false);

  useEffect(() => {
    if (attemptedRejoin.current) return;
    attemptedRejoin.current = true;
    const stored = readStoredSession();
    if (!stored) {
      setMode('form');
      return;
    }
    emitWithAck('student:join', { pin: stored.pin, nickname: stored.nickname, rejoinToken: stored.rejoinToken })
      .then((res) => {
        if (res?.ok) {
          setJoinedState({ pin: stored.pin, snapshot: res });
          setMode('joined');
        } else {
          localStorage.removeItem(SESSION_KEY);
          setMode('form');
        }
      })
      .catch(() => {
        localStorage.removeItem(SESSION_KEY);
        setMode('form');
      });
  }, []);

  async function handleJoin(e) {
    e.preventDefault();
    const trimmedPin = pin.trim();
    const trimmedNick = nickname.trim();
    if (!/^\d{6}$/.test(trimmedPin)) {
      setError('Enter the 6-digit PIN from your teacher\'s screen.');
      return;
    }
    if (!trimmedNick) {
      setError('Enter a nickname.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await emitWithAck('student:join', { pin: trimmedPin, nickname: trimmedNick });
      if (!res?.ok) {
        setError(res?.error || 'Could not join that game.');
        return;
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify({ pin: trimmedPin, nickname: trimmedNick, rejoinToken: res.rejoinToken }));
      localStorage.setItem(NICKNAME_KEY, trimmedNick);
      setJoinedState({ pin: trimmedPin, snapshot: res });
      setMode('joined');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleLeave() {
    localStorage.removeItem(SESSION_KEY);
    setJoinedState(null);
    setMode('form');
    setPin('');
  }

  if (mode === 'checking') {
    return (
      <div className="app-shell">
        <div className="screen screen-center">
          <div className="spinner" />
          <p>Reconnecting…</p>
        </div>
      </div>
    );
  }

  if (mode === 'joined' && joinedState) {
    return <StudentSession pin={joinedState.pin} initialSnapshot={joinedState.snapshot} onLeave={handleLeave} />;
  }

  return (
    <div className="app-shell">
      <div className="screen screen-center">
        <Link to="/" className="logo">Spot<span className="bug">Bug</span></Link>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleJoin} className="list" style={{ width: '100%', maxWidth: 320 }}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="Game PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            style={{ textAlign: 'center', fontSize: 28, letterSpacing: '0.2em' }}
          />
          <input
            type="text"
            maxLength={20}
            placeholder="Nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            style={{ textAlign: 'center' }}
          />
          <button className="btn block" type="submit" disabled={busy}>
            {busy ? 'Joining…' : 'Join'}
          </button>
        </form>
      </div>
    </div>
  );
}
