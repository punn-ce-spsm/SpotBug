import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { getQuiz, saveQuiz } from '../lib/storage.js';
import { eventToImageFraction } from '../lib/geometry.js';

const DEFAULT_RADIUS = 0.04;
const MIN_RADIUS = 0.015;
const MAX_RADIUS = 0.4;

export default function QuestionEditor() {
  const { quizId, questionId } = useParams();
  const navigate = useNavigate();
  const [quiz] = useState(() => getQuiz(quizId));
  const question = quiz?.questions.find((q) => q.id === questionId);

  const [bugs, setBugs] = useState(() => question?.bugs || []);
  const [timeLimitSec, setTimeLimitSec] = useState(() => question?.timeLimitSec ?? 30);
  const [selectedBugId, setSelectedBugId] = useState(null);
  const [renderedWidth, setRenderedWidth] = useState(0);
  const [error, setError] = useState(null);

  const imgRef = useRef(null);
  const dragRef = useRef(null); // { type: 'move' | 'resize', bugId }
  const bugsRef = useRef(bugs);
  bugsRef.current = bugs;

  useEffect(() => {
    if (!imgRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setRenderedWidth(entry.contentRect.width);
    });
    ro.observe(imgRef.current);
    return () => ro.disconnect();
  }, []);

  if (!quiz || !question) {
    return (
      <div className="app-shell">
        <div className="screen screen-center">
          <p>That question doesn't exist.</p>
          <Link className="btn" to={`/teacher/quiz/${quizId}`}>
            Back to Quiz
          </Link>
        </div>
      </div>
    );
  }

  function persist(nextBugs, nextTimeLimit) {
    const updatedQuestion = { ...question, bugs: nextBugs, timeLimitSec: nextTimeLimit };
    const nextQuiz = {
      ...quiz,
      questions: quiz.questions.map((q) => (q.id === question.id ? updatedQuestion : q)),
    };
    const result = saveQuiz(nextQuiz);
    if (!result.ok) setError(result.error);
    else setError(null);
  }

  function handleImageClick(e) {
    if (dragRef.current) return; // a drag just ended; ignore the synthetic click
    const { x, y } = eventToImageFraction(e, imgRef.current);
    const bug = { id: nanoid(), x, y, r: DEFAULT_RADIUS };
    const next = [...bugsRef.current, bug];
    setBugs(next);
    setSelectedBugId(bug.id);
    persist(next, timeLimitSec);
  }

  function updateBug(id, patch) {
    setBugs((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function handleMarkerPointerDown(e, bugId) {
    e.stopPropagation();
    e.preventDefault();
    setSelectedBugId(bugId);
    dragRef.current = { type: 'move', bugId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleMarkerPointerMove(e, bugId) {
    if (!dragRef.current || dragRef.current.type !== 'move' || dragRef.current.bugId !== bugId) return;
    const { x, y } = eventToImageFraction(e, imgRef.current);
    updateBug(bugId, { x, y });
  }

  function handleResizePointerDown(e, bugId) {
    e.stopPropagation();
    e.preventDefault();
    setSelectedBugId(bugId);
    dragRef.current = { type: 'resize', bugId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleResizePointerMove(e, bugId) {
    if (!dragRef.current || dragRef.current.type !== 'resize' || dragRef.current.bugId !== bugId) return;
    const bug = bugsRef.current.find((b) => b.id === bugId);
    if (!bug || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const centerPxX = rect.left + bug.x * rect.width;
    const centerPxY = rect.top + bug.y * rect.height;
    const dx = e.clientX - centerPxX;
    const dy = e.clientY - centerPxY;
    const rPx = Math.sqrt(dx * dx + dy * dy);
    const r = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, rPx / rect.width));
    updateBug(bugId, { r });
  }

  function handleDragEnd() {
    if (!dragRef.current) return;
    dragRef.current = null;
    persist(bugsRef.current, timeLimitSec);
  }

  function removeBug(id) {
    const next = bugs.filter((b) => b.id !== id);
    setBugs(next);
    if (selectedBugId === id) setSelectedBugId(null);
    persist(next, timeLimitSec);
  }

  function handleTimeLimitChange(value) {
    const n = Math.min(300, Math.max(5, Number(value) || 30));
    setTimeLimitSec(n);
    persist(bugs, n);
  }

  return (
    <div className="app-shell">
      <div className="screen">
        <div className="top-bar">
          <Link to={`/teacher/quiz/${quizId}`} className="logo">
            Spot<span className="bug">Bug</span>
          </Link>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <p className="text-muted">Tap the image to mark a bug. Drag a marker to move it, drag its edge handle to resize the tolerance area.</p>

        <div style={{ position: 'relative', lineHeight: 0, userSelect: 'none', touchAction: 'none' }}>
          <img
            ref={imgRef}
            src={question.imageDataUrl}
            alt="Question"
            onClick={handleImageClick}
            style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12, cursor: 'crosshair' }}
            draggable={false}
          />
          {bugs.map((bug, i) => {
            const diameter = Math.max(8, bug.r * renderedWidth * 2);
            const selected = bug.id === selectedBugId;
            return (
              <div
                key={bug.id}
                onPointerDown={(e) => handleMarkerPointerDown(e, bug.id)}
                onPointerMove={(e) => handleMarkerPointerMove(e, bug.id)}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
                style={{
                  position: 'absolute',
                  left: `${bug.x * 100}%`,
                  top: `${bug.y * 100}%`,
                  width: diameter,
                  height: diameter,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  border: `3px solid ${selected ? 'var(--blue)' : 'var(--red)'}`,
                  background: selected ? 'rgba(19,104,206,0.15)' : 'rgba(226,27,60,0.15)',
                  cursor: 'grab',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: -10,
                    left: -10,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'var(--surface)',
                    border: '2px solid var(--text)',
                    fontSize: 12,
                    lineHeight: '18px',
                    textAlign: 'center',
                    fontWeight: 700,
                  }}
                >
                  {i + 1}
                </span>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeBug(bug.id);
                  }}
                  aria-label="Delete this bug"
                  style={{
                    position: 'absolute',
                    top: -10,
                    right: -10,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'var(--red)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
                {selected && (
                  <div
                    onPointerDown={(e) => handleResizePointerDown(e, bug.id)}
                    onPointerMove={(e) => handleResizePointerMove(e, bug.id)}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={handleDragEnd}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      right: 0,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'var(--blue)',
                      border: '2px solid #fff',
                      transform: 'translate(50%, -50%)',
                      cursor: 'ew-resize',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="card">
          <label htmlFor="timeLimit">
            <strong>Time limit (seconds)</strong>
          </label>
          <input
            id="timeLimit"
            type="number"
            min={5}
            max={300}
            value={timeLimitSec}
            onChange={(e) => handleTimeLimitChange(e.target.value)}
          />
        </div>

        <p className="text-muted">{bugs.length} bug(s) marked{bugs.length === 0 && ' — mark at least one'}</p>

        <button className="btn block" onClick={() => navigate(`/teacher/quiz/${quizId}`)}>
          Done
        </button>
      </div>
    </div>
  );
}
