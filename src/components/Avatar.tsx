// Initials on a color derived from the name -- stable per person, so the same
// friend always gets the same bubble across the app.
const AVATAR_COLORS = ["#D9531E", "#1D6FE0", "#2F7D42", "#7A3FC9", "#C13566", "#0E9488", "#B7791F", "#4C6EF5"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AvatarProps {
  name: string;
  size?: number;
  title?: string;
}

export default function Avatar({ name, size = 28, title }: AvatarProps) {
  return (
    <span
      className="avatar"
      title={title ?? name}
      style={{ ["--size" as string]: `${size}px`, background: AVATAR_COLORS[hash(name) % AVATAR_COLORS.length] }}
    >
      {initials(name)}
    </span>
  );
}
