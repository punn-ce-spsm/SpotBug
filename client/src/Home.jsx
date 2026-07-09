import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="app-shell">
      <div className="screen screen-center">
        <h1>
          Spot<span style={{ color: 'var(--red)' }}>Bug</span>
        </h1>
        <p className="text-muted">Race to tap the bug in the code — Kahoot-style, on your phone.</p>
        <div className="list" style={{ width: '100%', maxWidth: 320, marginTop: 24 }}>
          <Link to="/teacher" className="btn block">
            I'm a Teacher
          </Link>
          <Link to="/play" className="btn secondary block">
            I'm a Student — Join a Game
          </Link>
        </div>
      </div>
    </div>
  );
}
