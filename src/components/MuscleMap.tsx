import type { Muscle } from "../constants/muscles";

// Ported 1:1 from the approved Muscle Map artifact draft (schematic front/back
// silhouette, straight-edge shapes keyed by data-muscle). Solid fill for
// primary muscles, muted fill for secondary, neutral stone otherwise.

interface MuscleMapProps {
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  size?: number;
}

const LEFT_UPPER_ARM = { x: 25, y: 85, w: 28, h: 108, rx: 14 };
const RIGHT_UPPER_ARM = { x: 167, y: 85, w: 28, h: 108, rx: 14 };
const LEFT_FOREARM_BASE = { x: 20, y: 193, w: 24, h: 108, rx: 12 };
const RIGHT_FOREARM_BASE = { x: 176, y: 193, w: 24, h: 108, rx: 12 };
const LEFT_THIGH_BASE = { x: 68, y: 250, w: 38, h: 128, rx: 16 };
const RIGHT_THIGH_BASE = { x: 114, y: 250, w: 38, h: 128, rx: 16 };
const LEFT_SHIN_BASE = { x: 72, y: 380, w: 30, h: 108, rx: 14 };
const RIGHT_SHIN_BASE = { x: 118, y: 380, w: 30, h: 108, rx: 14 };
const LEFT_FOOT = { x: 66, y: 492, w: 34, h: 16, rx: 6 };
const RIGHT_FOOT = { x: 120, y: 492, w: 34, h: 16, rx: 6 };

type Rect = { x: number; y: number; w: number; h: number; rx: number };

function Rect({ r, className }: { r: Rect; className: string }) {
  return <rect className={className} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.rx} />;
}

function BaseBody() {
  return (
    <>
      <circle className="base" cx={110} cy={38} r={28} />
      <Rect r={LEFT_UPPER_ARM} className="base" />
      <Rect r={RIGHT_UPPER_ARM} className="base" />
      <Rect r={LEFT_FOREARM_BASE} className="base" />
      <Rect r={RIGHT_FOREARM_BASE} className="base" />
      <Rect r={LEFT_THIGH_BASE} className="base" />
      <Rect r={RIGHT_THIGH_BASE} className="base" />
      <Rect r={LEFT_SHIN_BASE} className="base" />
      <Rect r={RIGHT_SHIN_BASE} className="base" />
      <Rect r={LEFT_FOOT} className="base" />
      <Rect r={RIGHT_FOOT} className="base" />
      <polygon className="base" points="55,82 165,82 150,160 145,220 155,250 65,250 75,220 70,160" />
    </>
  );
}

function muscleClass(muscle: Muscle, primary: Muscle[], secondary: Muscle[]) {
  if (primary.includes(muscle)) return "muscle is-primary";
  if (secondary.includes(muscle)) return "muscle is-secondary";
  return "muscle";
}

function FrontFigure({ primary, secondary }: { primary: Muscle[]; secondary: Muscle[] }) {
  const cls = (m: Muscle) => muscleClass(m, primary, secondary);
  return (
    <svg viewBox="0 0 220 520" role="img" aria-label="Front muscle view">
      <BaseBody />
      <rect className={cls("neck")} data-muscle="neck" x={96} y={64} width={28} height={20} rx={6} />
      <polygon className={cls("traps")} data-muscle="traps" points="58,84 96,84 90,97 60,95" />
      <polygon className={cls("traps")} data-muscle="traps" points="162,84 124,84 130,97 160,95" />
      <circle className={cls("front_delts")} data-muscle="front_delts" cx={46} cy={97} r={19} />
      <circle className={cls("front_delts")} data-muscle="front_delts" cx={174} cy={97} r={19} />
      <polygon className={cls("chest")} data-muscle="chest" points="72,90 148,90 143,150 77,150" />
      <rect className={cls("abs")} data-muscle="abs" x={88} y={150} width={44} height={70} rx={4} />
      <polygon className={cls("obliques")} data-muscle="obliques" points="70,150 88,150 84,212 72,206" />
      <polygon className={cls("obliques")} data-muscle="obliques" points="150,150 132,150 136,212 148,206" />
      <rect className={cls("biceps")} data-muscle="biceps" x={28} y={95} width={22} height={68} rx={10} />
      <rect className={cls("biceps")} data-muscle="biceps" x={170} y={95} width={22} height={68} rx={10} />
      <rect className={cls("forearms")} data-muscle="forearms" x={21} y={196} width={22} height={92} rx={10} />
      <rect className={cls("forearms")} data-muscle="forearms" x={177} y={196} width={22} height={92} rx={10} />
      <rect className={cls("quads")} data-muscle="quads" x={70} y={255} width={34} height={115} rx={14} />
      <rect className={cls("quads")} data-muscle="quads" x={116} y={255} width={34} height={115} rx={14} />
      <rect className={cls("adductors")} data-muscle="adductors" x={98} y={255} width={10} height={98} rx={5} />
      <rect className={cls("adductors")} data-muscle="adductors" x={112} y={255} width={10} height={98} rx={5} />
      <rect className={cls("calves")} data-muscle="calves" x={74} y={384} width={26} height={92} rx={12} />
      <rect className={cls("calves")} data-muscle="calves" x={120} y={384} width={26} height={92} rx={12} />
      <path
        className="ab-line"
        d="M110,150 L110,220 M88,168 L132,168 M88,187 L132,187 M88,205 L132,205"
      />
    </svg>
  );
}

function BackFigure({ primary, secondary }: { primary: Muscle[]; secondary: Muscle[] }) {
  const cls = (m: Muscle) => muscleClass(m, primary, secondary);
  return (
    <svg viewBox="0 0 220 520" role="img" aria-label="Back muscle view">
      <BaseBody />
      <rect className={cls("neck")} data-muscle="neck" x={96} y={64} width={28} height={20} rx={6} />
      <polygon className={cls("traps")} data-muscle="traps" points="72,84 148,84 128,150 92,150" />
      <circle className={cls("rear_delts")} data-muscle="rear_delts" cx={46} cy={97} r={19} />
      <circle className={cls("rear_delts")} data-muscle="rear_delts" cx={174} cy={97} r={19} />
      <polygon className={cls("lats")} data-muscle="lats" points="68,150 92,150 83,212 65,197" />
      <polygon className={cls("lats")} data-muscle="lats" points="152,150 128,150 137,212 155,197" />
      <polygon className={cls("upper_back")} data-muscle="upper_back" points="96,140 124,140 118,176 102,176" />
      <rect className={cls("lower_back")} data-muscle="lower_back" x={92} y={184} width={26} height={40} rx={4} />
      <rect className={cls("triceps")} data-muscle="triceps" x={28} y={95} width={22} height={68} rx={10} />
      <rect className={cls("triceps")} data-muscle="triceps" x={170} y={95} width={22} height={68} rx={10} />
      <rect className={cls("forearms")} data-muscle="forearms" x={21} y={196} width={22} height={92} rx={10} />
      <rect className={cls("forearms")} data-muscle="forearms" x={177} y={196} width={22} height={92} rx={10} />
      <polygon className={cls("glutes")} data-muscle="glutes" points="66,248 108,248 104,292 70,286" />
      <polygon className={cls("glutes")} data-muscle="glutes" points="154,248 112,248 116,292 150,286" />
      <rect className={cls("hamstrings")} data-muscle="hamstrings" x={70} y={255} width={34} height={115} rx={14} />
      <rect className={cls("hamstrings")} data-muscle="hamstrings" x={116} y={255} width={34} height={115} rx={14} />
      <rect className={cls("calves")} data-muscle="calves" x={74} y={384} width={26} height={92} rx={12} />
      <rect className={cls("calves")} data-muscle="calves" x={120} y={384} width={26} height={92} rx={12} />
    </svg>
  );
}

export default function MuscleMap({ primaryMuscles, secondaryMuscles, size = 230 }: MuscleMapProps) {
  return (
    <div className="row" style={{ gap: 16 }}>
      <div className="figure-card" style={{ maxWidth: size }}>
        <FrontFigure primary={primaryMuscles} secondary={secondaryMuscles} />
        <span className="cap">Front</span>
      </div>
      <div className="figure-card" style={{ maxWidth: size }}>
        <BackFigure primary={primaryMuscles} secondary={secondaryMuscles} />
        <span className="cap">Back</span>
      </div>
    </div>
  );
}
