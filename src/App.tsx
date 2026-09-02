import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Nav from "./components/Nav";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Exercises from "./pages/Exercises";
import ExerciseForm from "./pages/ExerciseForm";
import ExerciseDetail from "./pages/ExerciseDetail";
import Workouts from "./pages/Workouts";
import WorkoutForm from "./pages/WorkoutForm";
import WorkoutDetail from "./pages/WorkoutDetail";
import Group from "./pages/Group";
import Profile from "./pages/Profile";
import Chat from "./pages/Chat";

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell" style={{ flexDirection: "column" }}>
      <Nav />
      <main className="app-main">{children}</main>
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/exercises" element={<Protected><Exercises /></Protected>} />
          <Route path="/exercises/new" element={<Protected><ExerciseForm /></Protected>} />
          <Route path="/exercises/:id" element={<Protected><ExerciseDetail /></Protected>} />
          <Route path="/exercises/:id/edit" element={<Protected><ExerciseForm /></Protected>} />
          <Route path="/workouts" element={<Protected><Workouts /></Protected>} />
          <Route path="/workouts/new" element={<Protected><WorkoutForm /></Protected>} />
          <Route path="/workouts/:id" element={<Protected><WorkoutDetail /></Protected>} />
          <Route path="/workouts/:id/edit" element={<Protected><WorkoutForm /></Protected>} />
          <Route path="/group" element={<Protected><Group /></Protected>} />
          <Route path="/chat" element={<Protected><Chat /></Protected>} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
