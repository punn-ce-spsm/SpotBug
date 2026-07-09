import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listQuizzes, createQuiz, saveQuiz, deleteQuiz, exportQuiz, importQuizFromFile } from '../lib/storage.js';

export default function Dashboard() {
  const [quizzes, setQuizzes] = useState(() => listQuizzes());
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  function refresh() {
    setQuizzes(listQuizzes());
  }

  function handleCreate() {
    const quiz = createQuiz('Untitled Quiz');
    const result = saveQuiz(quiz);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate(`/teacher/quiz/${quiz.id}`);
  }

  function handleDelete(id) {
    if (!window.confirm('Delete this quiz? This cannot be undone.')) return;
    deleteQuiz(id);
    refresh();
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = await importQuizFromFile(file);
      const result = saveQuiz(imported);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app-shell">
      <div className="screen">
        <div className="top-bar">
          <Link to="/" className="logo">
            Spot<span className="bug">Bug</span>
          </Link>
        </div>
        <h2>Your Quizzes</h2>
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row">
          <button className="btn" onClick={handleCreate}>
            + New Quiz
          </button>
          <button className="btn secondary" onClick={() => fileInputRef.current?.click()}>
            Import JSON
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleImportFile} />
        </div>

        {quizzes.length === 0 && <p className="text-muted">No quizzes yet — create one or import a JSON file.</p>}

        <div className="list">
          {quizzes.map((quiz) => (
            <div className="card" key={quiz.id}>
              <h3>{quiz.title}</h3>
              <p className="text-muted">{quiz.questions.length} question(s)</p>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <Link className="btn secondary" to={`/teacher/quiz/${quiz.id}`}>
                  Edit
                </Link>
                <Link
                  className="btn green"
                  to={`/host/${quiz.id}`}
                  onClick={(e) => {
                    if (quiz.questions.length === 0) {
                      e.preventDefault();
                      setError('Add at least one question before hosting.');
                    }
                  }}
                >
                  Host
                </Link>
                <button className="btn secondary" onClick={() => exportQuiz(quiz)}>
                  Export
                </button>
                <button className="btn danger" onClick={() => handleDelete(quiz.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
