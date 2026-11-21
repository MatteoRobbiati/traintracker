import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useConnections } from "../hooks/useConnections";
import Avatar from "./Avatar";
import {
  DashboardIcon,
  ExercisesIcon,
  WorkoutsIcon,
  ChatIcon,
  GroupIcon,
  FriendsIcon,
  ProfileIcon,
  PlusIcon,
  LogoutIcon,
  LogoMark,
} from "./icons";

// Desktop: everything inline. Mobile: the four most-used destinations plus a
// big "log a workout" button in the bottom bar; the rest lives in the
// avatar menu (top right) so the bar never gets cramped.
const LINKS = [
  { to: "/", label: "Home" },
  { to: "/workouts", label: "Workouts" },
  { to: "/exercises", label: "Exercises" },
  { to: "/group", label: "Group" },
  { to: "/connections", label: "Friends" },
];

interface NavProps {
  chatOpen: boolean;
  onToggleChat: () => void;
}

export default function Nav({ chatOpen, onToggleChat }: NavProps) {
  const { signOut, onlineUsers, user, profile } = useAuth();
  const { rows: connectionRows } = useConnections();
  const navigate = useNavigate();
  const location = useLocation();
  const othersOnline = Object.keys(onlineUsers).filter((id) => id !== user?.id).length;
  const incomingRequests = connectionRows.filter((r) => r.status === "incoming_pending").length;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the menu on navigation, outside click, or Escape.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const name = profile?.name ?? "Me";

  return (
    <>
      <div className="top-nav-wrap">
        <nav className="top-nav">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <LogoMark />
            </span>
            TrainTrack
          </Link>
          <div className="nav-links row">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === "/"} className="nav-link">
                {l.label}
                {l.to === "/connections" && incomingRequests > 0 && <span className="nav-count">{incomingRequests}</span>}
              </NavLink>
            ))}
            <button type="button" className="linklike" onClick={onToggleChat} aria-pressed={chatOpen}>
              Chat
              {othersOnline > 0 && <span className="nav-count online">{othersOnline}</span>}
            </button>
          </div>
          <div className="menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="menu-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Avatar name={name} size={34} />
              {incomingRequests > 0 && <span className="dot-badge" />}
            </button>
            {menuOpen && (
              <div className="menu" role="menu">
                <div className="menu-head">
                  <div style={{ fontWeight: 600 }}>{name}</div>
                  <div className="muted tiny truncate">{user?.email}</div>
                </div>
                <NavLink to="/profile" end role="menuitem">
                  <ProfileIcon width={18} height={18} /> Profile & settings
                </NavLink>
                <NavLink to="/exercises" role="menuitem">
                  <ExercisesIcon width={18} height={18} /> Exercise library
                </NavLink>
                <NavLink to="/connections" role="menuitem">
                  <FriendsIcon width={18} height={18} /> Friends
                  {incomingRequests > 0 && (
                    <span className="nav-count" style={{ marginLeft: "auto" }}>
                      {incomingRequests}
                    </span>
                  )}
                </NavLink>
                <div className="sep" />
                <button type="button" role="menuitem" onClick={handleSignOut}>
                  <LogoutIcon width={18} height={18} /> Sign out
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/" end className="bottom-nav-item">
          <DashboardIcon />
          <span>Home</span>
        </NavLink>
        <NavLink to="/workouts" end className="bottom-nav-item">
          <WorkoutsIcon />
          <span>Workouts</span>
        </NavLink>
        <Link to="/workouts/new" className="bottom-nav-fab" aria-label="Log a workout">
          <PlusIcon width={26} height={26} strokeWidth={2.4} />
        </Link>
        <NavLink to="/group" className="bottom-nav-item">
          <GroupIcon />
          <span>Group</span>
        </NavLink>
        <button type="button" className="bottom-nav-item" onClick={onToggleChat} aria-pressed={chatOpen}>
          <span style={{ position: "relative", display: "inline-flex" }}>
            <ChatIcon />
            {othersOnline > 0 && <span className="bottom-nav-badge online">{othersOnline}</span>}
          </span>
          <span>Chat</span>
        </button>
      </nav>
    </>
  );
}
