import type { Muscle } from "../constants/muscles";

// A soft anatomical mannequin (rounded, tapered limbs) rather than the
// original blocky rect/polygon draft — same viewBox, same data-muscle ids,
// same primary/secondary highlight classes, so it drops in without touching
// callers or the CSS in index.css.

interface MuscleMapProps {
  primaryMuscles?: Muscle[];
  secondaryMuscles?: Muscle[];
  /** Heatmap mode: 0..1 per muscle, overrides primary/secondary entirely.
   * Color is interpolated live between --stone and --ember via CSS
   * color-mix(), so it stays correct in both themes with no JS palette. */
  intensities?: Partial<Record<Muscle, number>>;
  size?: number;
  /** Pass to make regions clickable (browsing, or picking primary/secondary
   * in a form). Omit for a plain read-only preview. */
  onMuscleClick?: (muscle: Muscle) => void;
}

// Tapered capsule: a rounded-cap shape from one circle (cx1,y1,r1) to
// another (cx2,y2,r2) — used for every limb segment so joints read as
// smooth tapers instead of hard rectangle seams.
function capsule(cx1: number, y1: number, r1: number, cx2: number, y2: number, r2: number) {
  return `M${cx1 - r1},${y1} A${r1},${r1} 0 0 1 ${cx1 + r1},${y1} L${cx2 + r2},${y2} A${r2},${r2} 0 0 1 ${cx2 - r2},${y2} Z`;
}

function BaseBody() {
  return (
    <>
      <ellipse className="base" cx={110} cy={34} rx={23} ry={26} />
      <path className="base" d={capsule(110, 54, 15, 110, 80, 20)} />
      <path
        className="base"
        d="M56,78
          C46,108 46,146 62,180
          C50,204 47,226 56,250
          C68,256 152,256 164,250
          C173,226 170,204 158,180
          C174,146 174,108 164,78
          C144,68 76,68 56,78 Z"
      />
      <path className="base" d={capsule(44, 88, 17, 36, 178, 13)} />
      <path className="base" d={capsule(176, 88, 17, 184, 178, 13)} />
      <path className="base" d={capsule(34, 182, 13, 28, 280, 10)} />
      <path className="base" d={capsule(186, 182, 13, 192, 280, 10)} />
      <ellipse className="base" cx={26} cy={290} rx={11} ry={8} />
      <ellipse className="base" cx={194} cy={290} rx={11} ry={8} />
      <path className="base" d={capsule(88, 254, 23, 80, 372, 16)} />
      <path className="base" d={capsule(132, 254, 23, 140, 372, 16)} />
      <path className="base" d={capsule(80, 378, 15, 74, 470, 10)} />
      <path className="base" d={capsule(140, 378, 15, 146, 470, 10)} />
      <ellipse className="base" cx={70} cy={486} rx={17} ry={9} />
      <ellipse className="base" cx={150} cy={486} rx={17} ry={9} />
    </>
  );
}

function muscleClass(muscle: Muscle, primary: Muscle[], secondary: Muscle[], interactive: boolean, heat: boolean) {
  let cls = "muscle";
  if (!heat) {
    if (primary.includes(muscle)) cls += " is-primary";
    else if (secondary.includes(muscle)) cls += " is-secondary";
  }
  if (interactive) cls += " is-clickable";
  return cls;
}

function heatStyle(muscle: Muscle, intensities: Partial<Record<Muscle, number>> | undefined) {
  if (!intensities) return undefined;
  const t = Math.max(0, Math.min(1, intensities[muscle] ?? 0));
  const pct = Math.round(t * 100);
  const color = `color-mix(in srgb, var(--ember) ${pct}%, var(--stone))`;
  return { fill: color, stroke: t > 0.5 ? color : "var(--stone-line)" };
}

interface FigureProps {
  primary: Muscle[];
  secondary: Muscle[];
  intensities?: Partial<Record<Muscle, number>>;
  onMuscleClick?: (muscle: Muscle) => void;
}

function FrontFigure({ primary, secondary, intensities, onMuscleClick }: FigureProps) {
  const heat = !!intensities;
  const cls = (m: Muscle) => muscleClass(m, primary, secondary, !!onMuscleClick, heat);
  const style = (m: Muscle) => heatStyle(m, intensities);
  const click = (m: Muscle) => (onMuscleClick ? () => onMuscleClick(m) : undefined);
  return (
    <svg viewBox="0 0 220 520" role="img" aria-label="Front muscle view">
      <BaseBody />
      <path className={cls("neck")} data-muscle="neck" onClick={click("neck")} style={style("neck")} d={capsule(110, 54, 14, 110, 76, 17)} />
      <path className={cls("traps")} data-muscle="traps" onClick={click("traps")} style={style("traps")} d="M60,82 C64,76 82,72 98,73 L92,96 L66,96 Z" />
      <path className={cls("traps")} data-muscle="traps" onClick={click("traps")} style={style("traps")} d="M160,82 C156,76 138,72 122,73 L128,96 L154,96 Z" />
      <ellipse className={cls("front_delts")} data-muscle="front_delts" onClick={click("front_delts")} style={style("front_delts")} cx={46} cy={92} rx={19} ry={21} />
      <ellipse className={cls("front_delts")} data-muscle="front_delts" onClick={click("front_delts")} style={style("front_delts")} cx={174} cy={92} rx={19} ry={21} />
      <path
        className={cls("chest")}
        data-muscle="chest"
        onClick={click("chest")} style={style("chest")}
        d="M68,86 C86,80 134,80 152,86 L146,146 C130,154 90,154 74,146 Z"
      />
      <path
        className={cls("abs")}
        data-muscle="abs"
        onClick={click("abs")} style={style("abs")}
        d="M84,150 C96,146 124,146 136,150 L132,222 C120,228 100,228 88,222 Z"
      />
      <path
        className={cls("obliques")}
        data-muscle="obliques"
        onClick={click("obliques")} style={style("obliques")}
        d="M62,150 L82,150 L78,214 L64,206 C58,190 58,168 62,150 Z"
      />
      <path
        className={cls("obliques")}
        data-muscle="obliques"
        onClick={click("obliques")} style={style("obliques")}
        d="M158,150 L138,150 L142,214 L156,206 C162,190 162,168 158,150 Z"
      />
      <path className={cls("biceps")} data-muscle="biceps" onClick={click("biceps")} style={style("biceps")} d={capsule(44, 90, 16, 38, 168, 12)} />
      <path className={cls("biceps")} data-muscle="biceps" onClick={click("biceps")} style={style("biceps")} d={capsule(176, 90, 16, 182, 168, 12)} />
      <path className={cls("forearms")} data-muscle="forearms" onClick={click("forearms")} style={style("forearms")} d={capsule(36, 184, 12, 29, 272, 9)} />
      <path className={cls("forearms")} data-muscle="forearms" onClick={click("forearms")} style={style("forearms")} d={capsule(184, 184, 12, 191, 272, 9)} />
      <path className={cls("quads")} data-muscle="quads" onClick={click("quads")} style={style("quads")} d={capsule(86, 256, 22, 78, 368, 15)} />
      <path className={cls("quads")} data-muscle="quads" onClick={click("quads")} style={style("quads")} d={capsule(134, 256, 22, 142, 368, 15)} />
      {/* Two symmetric inner-thigh adductors, not one shape down the
          centerline — anatomically correct, and doesn't read as a single
          odd centered blob when highlighted. */}
      <path
        className={cls("adductors")}
        data-muscle="adductors"
        onClick={click("adductors")} style={style("adductors")}
        d={capsule(102, 262, 11, 96, 318, 7)}
      />
      <path
        className={cls("adductors")}
        data-muscle="adductors"
        onClick={click("adductors")} style={style("adductors")}
        d={capsule(118, 262, 11, 124, 318, 7)}
      />
      <path className={cls("calves")} data-muscle="calves" onClick={click("calves")} style={style("calves")} d={capsule(78, 382, 14, 73, 466, 9)} />
      <path className={cls("calves")} data-muscle="calves" onClick={click("calves")} style={style("calves")} d={capsule(142, 382, 14, 147, 466, 9)} />
      <path
        className="ab-line"
        d="M110,150 L110,222 M88,168 L132,168 M86,188 L134,188 M86,206 L134,206"
      />
    </svg>
  );
}

function BackFigure({ primary, secondary, intensities, onMuscleClick }: FigureProps) {
  const heat = !!intensities;
  const cls = (m: Muscle) => muscleClass(m, primary, secondary, !!onMuscleClick, heat);
  const style = (m: Muscle) => heatStyle(m, intensities);
  const click = (m: Muscle) => (onMuscleClick ? () => onMuscleClick(m) : undefined);
  return (
    <svg viewBox="0 0 220 520" role="img" aria-label="Back muscle view">
      <BaseBody />
      <path className={cls("neck")} data-muscle="neck" onClick={click("neck")} style={style("neck")} d={capsule(110, 54, 14, 110, 76, 17)} />
      <path
        className={cls("traps")}
        data-muscle="traps"
        onClick={click("traps")} style={style("traps")}
        d="M70,84 C84,80 136,80 150,84 L130,138 C120,142 100,142 90,138 Z"
      />
      <ellipse className={cls("rear_delts")} data-muscle="rear_delts" onClick={click("rear_delts")} style={style("rear_delts")} cx={46} cy={92} rx={19} ry={21} />
      <ellipse className={cls("rear_delts")} data-muscle="rear_delts" onClick={click("rear_delts")} style={style("rear_delts")} cx={174} cy={92} rx={19} ry={21} />
      <path
        className={cls("lats")}
        data-muscle="lats"
        onClick={click("lats")} style={style("lats")}
        d="M66,138 L88,142 L81,204 C71,203 63,193 59,178 C57,165 59,151 66,138 Z"
      />
      <path
        className={cls("lats")}
        data-muscle="lats"
        onClick={click("lats")} style={style("lats")}
        d="M154,138 L132,142 L139,204 C149,203 157,193 161,178 C163,165 161,151 154,138 Z"
      />
      <path className={cls("upper_back")} data-muscle="upper_back" onClick={click("upper_back")} style={style("upper_back")} d="M92,136 L128,136 L122,176 L98,176 Z" />
      <path
        className={cls("lower_back")}
        data-muscle="lower_back"
        onClick={click("lower_back")} style={style("lower_back")}
        d="M90,182 C100,178 120,178 130,182 L126,220 C112,224 108,224 94,220 Z"
      />
      <path className={cls("triceps")} data-muscle="triceps" onClick={click("triceps")} style={style("triceps")} d={capsule(44, 90, 16, 38, 168, 12)} />
      <path className={cls("triceps")} data-muscle="triceps" onClick={click("triceps")} style={style("triceps")} d={capsule(176, 90, 16, 182, 168, 12)} />
      <path className={cls("forearms")} data-muscle="forearms" onClick={click("forearms")} style={style("forearms")} d={capsule(36, 184, 12, 29, 272, 9)} />
      <path className={cls("forearms")} data-muscle="forearms" onClick={click("forearms")} style={style("forearms")} d={capsule(184, 184, 12, 191, 272, 9)} />
      <path
        className={cls("glutes")}
        data-muscle="glutes"
        onClick={click("glutes")} style={style("glutes")}
        d="M64,248 C82,240 138,240 156,248 L150,282 C128,292 92,292 70,282 Z"
      />
      <path className={cls("hamstrings")} data-muscle="hamstrings" onClick={click("hamstrings")} style={style("hamstrings")} d={capsule(86, 286, 20, 78, 368, 15)} />
      <path className={cls("hamstrings")} data-muscle="hamstrings" onClick={click("hamstrings")} style={style("hamstrings")} d={capsule(134, 286, 20, 142, 368, 15)} />
      <path className={cls("calves")} data-muscle="calves" onClick={click("calves")} style={style("calves")} d={capsule(78, 382, 14, 73, 466, 9)} />
      <path className={cls("calves")} data-muscle="calves" onClick={click("calves")} style={style("calves")} d={capsule(142, 382, 14, 147, 466, 9)} />
    </svg>
  );
}

export default function MuscleMap({
  primaryMuscles = [],
  secondaryMuscles = [],
  intensities,
  size = 230,
  onMuscleClick,
}: MuscleMapProps) {
  return (
    <div className="row" style={{ gap: 16 }}>
      <div className="figure-card" style={{ maxWidth: size }}>
        <FrontFigure
          primary={primaryMuscles}
          secondary={secondaryMuscles}
          intensities={intensities}
          onMuscleClick={onMuscleClick}
        />
        <span className="cap">Front</span>
      </div>
      <div className="figure-card" style={{ maxWidth: size }}>
        <BackFigure
          primary={primaryMuscles}
          secondary={secondaryMuscles}
          intensities={intensities}
          onMuscleClick={onMuscleClick}
        />
        <span className="cap">Back</span>
      </div>
    </div>
  );
}
