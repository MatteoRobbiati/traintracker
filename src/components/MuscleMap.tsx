import type { Muscle } from "../constants/muscles";
import { MUSCLE_PATH_FRONT, MUSCLE_PATH_BACK, DECORATIVE_FRONT, DECORATIVE_BACK } from "./muscleMapData.generated";

// Body art adapted from HichamELBSI/react-native-body-highlighter (MIT
// License) — see NOTICE.md for attribution. Their muscle taxonomy matches
// ours almost 1:1 (naming aside); "lats" isn't a distinct slug in their
// data, but their "upper-back" already includes a separate wing-shaped
// sub-path that reads exactly as lats — muscleMapData.generated.ts splits
// it by sub-path index. viewBox is native to the source art: front is
// "0 0 724 1448", back is the same canvas via translate(-724, 0) (it's
// "724 0 724 1448" in their original combined front+back figure).

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

function MuscleShapes({
  paths,
  primary,
  secondary,
  intensities,
  onMuscleClick,
}: {
  paths: Partial<Record<Muscle, string>>;
} & FigureProps) {
  const heat = !!intensities;
  return (
    <>
      {(Object.entries(paths) as [Muscle, string][]).map(([muscle, d]) => (
        <path
          key={muscle}
          className={muscleClass(muscle, primary, secondary, !!onMuscleClick, heat)}
          data-muscle={muscle}
          d={d}
          style={heatStyle(muscle, intensities)}
          onClick={onMuscleClick ? () => onMuscleClick(muscle) : undefined}
        />
      ))}
    </>
  );
}

function FrontFigure({ primary, secondary, intensities, onMuscleClick }: FigureProps) {
  return (
    <svg viewBox="0 0 724 1448" role="img" aria-label="Front muscle view">
      <path className="base" d={DECORATIVE_FRONT} />
      <MuscleShapes
        paths={MUSCLE_PATH_FRONT}
        primary={primary}
        secondary={secondary}
        intensities={intensities}
        onMuscleClick={onMuscleClick}
      />
    </svg>
  );
}

function BackFigure({ primary, secondary, intensities, onMuscleClick }: FigureProps) {
  return (
    <svg viewBox="0 0 724 1448" role="img" aria-label="Back muscle view">
      <g transform="translate(-724, 0)">
        <path className="base" d={DECORATIVE_BACK} />
        <MuscleShapes
          paths={MUSCLE_PATH_BACK}
          primary={primary}
          secondary={secondary}
          intensities={intensities}
          onMuscleClick={onMuscleClick}
        />
      </g>
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
