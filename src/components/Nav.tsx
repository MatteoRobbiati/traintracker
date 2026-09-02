import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LINKS = [
  { to: "/", label: "Dashboard", icon: "◆" },
  { to: "/exercises", label: "Exercises", icon: "▤" },
  { to: "/workouts", label: "Workouts", icon: "●" },
  { to: "/group", label: "Group", icon: "▲" },
  { to: "/profile", label: "Profile", icon: "◐" },
];

interface NavProps {
  chatOpen: boolean;
  onToggleChat: () => void;
}

export default function Nav({ chatOpen, onToggleChat }: NavProps) {
  const { signOut, onlineUsers, user } = useAuth();
  const navigate = useNavigate();
  const othersOnline = Object.keys(onlineUsers).filter((id) => id !== user?.id).length;

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const chatButton = (className: string) => (
    <button type="button" className={className} onClick={onToggleChat} aria-pressed={chatOpen}>
      <span aria-hidden="true">✦</span> Chat
      {othersOnline > 0 && (
        <span className="chip focus" style={{ marginLeft: 6, padding: "1px 6px" }}>
          {othersOnline}
        </span>
      )}
    </button>
  );

  return (
    <>
      <nav className="top-nav">
        <span className="brand">Gym Tracker</span>
        <div className="nav-links row">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"}>
              {l.label}
            </NavLink>
          ))}
          {chatButton("linklike")}
          <button type="button" className="linklike" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </nav>
      <nav className="bottom-nav">
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === "/"}>
            <span aria-hidden="true">{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
        <button type="button" className="linklike" onClick={onToggleChat}>
          <span aria-hidden="true">✦</span>
          Chat
        </button>
      </nav>
    </>
  );
}
