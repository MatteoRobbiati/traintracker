import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useConnections } from "../hooks/useConnections";
import { DashboardIcon, ExercisesIcon, WorkoutsIcon, ChatIcon, GroupIcon, FriendsIcon, ProfileIcon } from "./icons";

const LINKS = [
  { to: "/", label: "Dashboard", Icon: DashboardIcon },
  { to: "/exercises", label: "Exercises", Icon: ExercisesIcon },
  { to: "/workouts", label: "Workouts", Icon: WorkoutsIcon },
  { to: "/group", label: "Group", Icon: GroupIcon },
  { to: "/connections", label: "Friends", Icon: FriendsIcon },
  { to: "/profile", label: "Profile", Icon: ProfileIcon },
];

interface NavProps {
  chatOpen: boolean;
  onToggleChat: () => void;
}

export default function Nav({ chatOpen, onToggleChat }: NavProps) {
  const { signOut, onlineUsers, user } = useAuth();
  const { rows: connectionRows } = useConnections();
  const navigate = useNavigate();
  const othersOnline = Object.keys(onlineUsers).filter((id) => id !== user?.id).length;
  const incomingRequests = connectionRows.filter((r) => r.status === "incoming_pending").length;

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <>
      <nav className="top-nav">
        <span className="brand">TrainTrack</span>
        <div className="nav-links row">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"}>
              {l.label}
              {l.to === "/connections" && incomingRequests > 0 && (
                <span className="chip focus" style={{ marginLeft: 6, padding: "1px 6px" }}>
                  {incomingRequests}
                </span>
              )}
            </NavLink>
          ))}
          <button type="button" className="linklike" onClick={onToggleChat} aria-pressed={chatOpen}>
            Chat
            {othersOnline > 0 && (
              <span className="chip focus" style={{ marginLeft: 6, padding: "1px 6px" }}>
                {othersOnline}
              </span>
            )}
          </button>
          <button type="button" className="linklike" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </nav>
      <nav className="bottom-nav">
        {LINKS.slice(0, 3).map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === "/"} className="bottom-nav-item">
            <l.Icon />
            <span>{l.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className="bottom-nav-item bottom-nav-button"
          onClick={onToggleChat}
          aria-pressed={chatOpen}
        >
          <span style={{ position: "relative" }}>
            <ChatIcon />
            {othersOnline > 0 && <span className="bottom-nav-badge">{othersOnline}</span>}
          </span>
          <span>Chat</span>
        </button>
        {LINKS.slice(3).map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === "/"} className="bottom-nav-item">
            <span style={{ position: "relative" }}>
              <l.Icon />
              {l.to === "/connections" && incomingRequests > 0 && (
                <span className="bottom-nav-badge">{incomingRequests}</span>
              )}
            </span>
            <span>{l.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
