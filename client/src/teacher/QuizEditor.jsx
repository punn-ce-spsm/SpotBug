import { useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { getQuiz, saveQuiz } from '../lib/storage.js';
import { processImageFile } from '../lib/imageUtils.js';

export default function QuizEditor() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(() => getQuiz(quizId));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  if (!quiz) {
    return (
      <div className="app-shell">
        <div className="screen screen-center">
          <p>That quiz doesn't exist.</p>
          <Link className="btn" to="/teacher">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  function persist(next) {
    const result = saveQuiz(next);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setQuiz(result.quiz);
  }

  function updateTitle(title) {
    persist({ ...quiz, title });
  }

  async function handleAddQuestion(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const { dataUrl, width, height } = await processImageFile(file);
      const question = {
        id: nanoid(),
        imageDataUrl: dataUrl,
        imgWidth: width,
        imgHeight: height,
        timeLimitSec: 30,
        bugs: [],
      };
      const next = { ...quiz, questions: [...quiz.questions, question] };
      const result = saveQuiz(next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      navigate(`/teacher/quiz/${quiz.id}/question/${question.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function move(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= quiz.questions.length) return;
    const questions = [...quiz.questions];
    [questions[index], questions[target]] = [questions[target], questions[index]];
    persist({ ...quiz, questions });
  }

  function removeQuestion(id) {
    if (!window.confirm('Delete this question?')) return;
    persist({ ...quiz, questions: quiz.questions.filter((q) => q.id !== id) });
  }

  return (
    <div className="app-shell">
      <div className="screen">
        <div className="top-bar">
          <Link to="/teacher" className="logo">
            Spot<span className="bug">Bug</span>
          </Link>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <input
          type="text"
          value={quiz.title}
          onChange={(e) => updateTitle(e.target.value)}
          aria-label="Quiz title"
        />

        <div className="btn-row">
          <button className="btn" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            {busy ? 'Processing image…' : '+ Add Question (upload image)'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAddQuestion} />
        </div>

        <div className="list">
          {quiz.questions.map((q, i) => (
            <div className="card" key={q.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <img
                src={q.imageDataUrl}
                alt={`Question ${i + 1}`}
                style={{ width: 90, height: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
              />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <strong>Question {i + 1}</strong>
                <div className="text-muted">
                  {q.bugs.length} bug{q.bugs.length === 1 ? '' : 's'} marked · {q.timeLimitSec}s
                  {q.bugs.length === 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}> — needs at least 1 bug</span>}
                </div>
              </div>
              <div className="btn-row">
                <button className="btn secondary" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  ↑
                </button>
                <button className="btn secondary" onClick={() => move(i, 1)} disabled={i === quiz.questions.length - 1} aria-label="Move down">
                  ↓
                </button>
                <Link className="btn secondary" to={`/teacher/quiz/${quiz.id}/question/${q.id}`}>
                  Edit
                </Link>
                <button className="btn danger" onClick={() => removeQuestion(q.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
          {quiz.questions.length === 0 && <p className="text-muted">No questions yet — add one above.</p>}
        </div>

        <Link
          className="btn green block"
          to={`/host/${quiz.id}`}
          onClick={(e) => {
            const bad = quiz.questions.find((q) => q.bugs.length === 0);
            if (quiz.questions.length === 0 || bad) {
              e.preventDefault();
              setError(quiz.questions.length === 0 ? 'Add at least one question first.' : 'Every question needs at least one bug marked.');
            }
          }}
        >
          Host This Quiz
        </Link>
      </div>
    </div>
  );
}
