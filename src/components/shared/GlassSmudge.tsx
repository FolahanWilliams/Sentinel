/**
 * GlassSmudge — Fingerprint smudge effect on click
 *
 * Renders a brief radial gradient "smudge" at the click point that fades out.
 */

interface GlassSmudgeProps {
  x: number;
  y: number;
  onComplete: () => void;
}

export function GlassSmudge({ x, y, onComplete }: GlassSmudgeProps) {
  return (
    <div
      className="glass-smudge"
      style={{
        left: x - 30,
        top: y - 30,
      }}
      onAnimationEnd={onComplete}
    />
  );
}
