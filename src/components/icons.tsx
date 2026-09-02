// Small line-icon set for the mobile tab bar — stroke=currentColor so each
// icon inherits the nav link's color (including the active-state highlight)
// for free, no separate "active" art needed.
import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.6" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.6" />
    </Icon>
  );
}

export function ExercisesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="19" cy="12" r="2.2" />
      <path d="M7.2 12h9.6" />
      <path d="M3.5 12h1M19.5 12h1" />
    </Icon>
  );
}

export function WorkoutsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16.5" rx="2.2" />
      <path d="M8 2.7v3M16 2.7v3M4.3 9.5h15.4" />
      <path d="M8.3 13.2l2 2 4.4-4.4" />
    </Icon>
  );
}

export function ChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 5.5h16v10.5H9.5L5 20v-4H4z" />
    </Icon>
  );
}

export function GroupIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8.2" r="3" />
      <path d="M3.3 19.5c0-3.2 2.6-5.4 5.7-5.4s5.7 2.2 5.7 5.4" />
      <circle cx="17.3" cy="8.8" r="2.3" />
      <path d="M15.6 14.5c2.5.3 4.4 2.2 4.4 5" />
    </Icon>
  );
}

export function ProfileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c0-4 3.4-6.3 7.5-6.3s7.5 2.3 7.5 6.3" />
    </Icon>
  );
}
