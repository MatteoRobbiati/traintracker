import { useState } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Nav from "./components/Nav";
import ChatPanel from "./components/ChatPanel";
import { DEFAULT_ROOM, type RoomId } from "./constants/rooms";
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
import Connections from "./pages/Connections";

// Passed down to every page via <Outlet context={...}/> so any of them (the
// Dashboard "what's new" banner, say) can open the chat panel straight to a
// specific room -- read it with useOutletContext<AppOutletContext>().
export interface AppOutletContext {
  openChat: (room?: RoomId) => void;
}

// One layout instance wraps every authenticated route via <Outlet/>, so Nav
// and ChatPanel stay mounted (and the chat's realtime subscription stays
// connected) across navigation instead of remounting per page.
function AppLayout() {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatRoom, setChatRoom] = useState<RoomId>(DEFAULT_ROOM);

  function openChat(room?: RoomId) {
    if (room) setChatRoom(room);
    setChatOpen(true);
  }

  return (
    <ProtectedRoute>
      <div className="app-shell" style={{ flexDirection: "column" }}>
        <Nav chatOpen={chatOpen} onToggleChat={() => setChatOpen((v) => !v)} />
        <main className="app-main">
          <Outlet context={{ openChat } satisfies AppOutletContext} />
        </main>
        <ChatPanel
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          room={chatRoom}
          onRoomChange={setChatRoom}
        />
      </div>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/exercises" element={<Exercises />} />
              <Route path="/exercises/new" element={<ExerciseForm />} />
              <Route path="/exercises/:id" element={<ExerciseDetail />} />
              <Route path="/exercises/:id/edit" element={<ExerciseForm />} />
              <Route path="/workouts" element={<Workouts />} />
              <Route path="/workouts/new" element={<WorkoutForm />} />
              <Route path="/workouts/:id" element={<WorkoutDetail />} />
              <Route path="/workouts/:id/edit" element={<WorkoutForm />} />
              <Route path="/group" element={<Group />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/:userId" element={<Profile />} />
              <Route path="/connections" element={<Connections />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}
