import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './Home.jsx';
import Dashboard from './teacher/Dashboard.jsx';
import QuizEditor from './teacher/QuizEditor.jsx';
import QuestionEditor from './teacher/QuestionEditor.jsx';
import HostSession from './teacher/HostSession.jsx';
import StudentEntry from './student/StudentEntry.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/teacher" element={<Dashboard />} />
        <Route path="/teacher/quiz/:quizId" element={<QuizEditor />} />
        <Route path="/teacher/quiz/:quizId/question/:questionId" element={<QuestionEditor />} />
        <Route path="/host/:quizId" element={<HostSession />} />
        <Route path="/play" element={<StudentEntry />} />
      </Routes>
    </BrowserRouter>
  );
}
