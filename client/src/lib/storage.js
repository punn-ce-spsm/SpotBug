import { nanoid } from 'nanoid';

const STORAGE_KEY = 'spotbug_quizzes_v1';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt localStorage content shouldn't crash the whole app.
    return [];
  }
}

function writeAll(quizzes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizzes));
    return { ok: true };
  } catch (err) {
    const isQuota = err && (err.name === 'QuotaExceededError' || err.code === 22);
    return {
      ok: false,
      error: isQuota
        ? 'Browser storage is full. Export and remove some quizzes (especially ones with many/large images) to free up space.'
        : 'Could not save to browser storage.',
    };
  }
}

export function listQuizzes() {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getQuiz(id) {
  return readAll().find((q) => q.id === id) || null;
}

export function createQuiz(title) {
  return {
    id: nanoid(),
    title: title || 'Untitled Quiz',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    questions: [],
  };
}

export function saveQuiz(quiz) {
  const all = readAll();
  const idx = all.findIndex((q) => q.id === quiz.id);
  const updated = { ...quiz, updatedAt: Date.now() };
  if (idx === -1) all.push(updated);
  else all[idx] = updated;
  const result = writeAll(all);
  return { ...result, quiz: updated };
}

export function deleteQuiz(id) {
  const all = readAll().filter((q) => q.id !== id);
  return writeAll(all);
}

export function validateQuizShape(quiz) {
  if (!quiz || typeof quiz !== 'object') return 'Not a valid quiz file.';
  if (!Array.isArray(quiz.questions)) return 'Quiz is missing a questions list.';
  for (const [i, q] of quiz.questions.entries()) {
    if (!q.imageDataUrl) return `Question ${i + 1} is missing its image.`;
    if (!q.imgWidth || !q.imgHeight) return `Question ${i + 1} is missing image dimensions.`;
    if (!Array.isArray(q.bugs)) return `Question ${i + 1} is missing its bug list.`;
    for (const b of q.bugs) {
      if (typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.r !== 'number') {
        return `Question ${i + 1} has a malformed bug marker.`;
      }
    }
  }
  return null;
}

export function exportQuiz(quiz) {
  const blob = new Blob([JSON.stringify(quiz, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (quiz.title || 'quiz').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'quiz';
  a.download = `spotbug-${safeName}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importQuizFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch {
        reject(new Error('That file is not valid JSON.'));
        return;
      }
      const error = validateQuizShape(parsed);
      if (error) {
        reject(new Error(error));
        return;
      }
      // Re-id on import so it never collides with an existing quiz.
      const imported = {
        ...parsed,
        id: nanoid(),
        title: parsed.title ? `${parsed.title} (imported)` : 'Imported Quiz',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        questions: parsed.questions.map((q) => ({ ...q, id: q.id || nanoid() })),
      };
      resolve(imported);
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}
