import type { Run } from "./built-in-faces-oracle-utils";

/**
 * Moves of a built-in from a place where it doesn't fit, for the built-in oracles (J's delegate, 2 Nov 2026: "look for the
 * nearest fit near where it stands, keeping its back on the face it stood against ... the run's own length is a sensible
 * bound. If nothing fits within that, refuse and leave it where it is"), restated from the decision: a nudge, Snap to wall or a
 * drag goes along its face, its back where Fit stood it (`run`, fitted there: the line through its centre along its face), to
 * a place that fits no further than its own width from where the move aims along it, with none clearly nearer that fits; or it
 * is refused, and then no place on that line within its width clearly fits (its fitted place, where that is in reach).
 */

export type StuckMoves = {
  contained: (at: Run) => boolean;
  /** Fits as the region tests it, give or take its rounding (the oracle's fitsAt). */
  fits: (at: Run) => boolean;
  /** Fits with a millimetre to spare at each end: a place the code must not pass over. */
  clearlyFits: (at: Run) => boolean;
  /** A move's result (the inspector's clamp, from where `piece` stands), aimed at (x, z); a drag's; Snap to wall's aim. */
  move: (piece: Run, x: number, z: number) => [number, number];
  drag: (piece: Run, x: number, z: number) => [number, number];
  snapAim: (piece: Run) => [number, number];
};

type Check = (condition: boolean, message: () => string) => void;

/**
 * Checks `piece` (the run where it doesn't fit: pushed into its wall, or made longer than its face) nudged 10 mm along, snapped
 * and dragged 0.2 m along, against the rule above. Returns how many of the three were refused.
 */
export function checkMovesFromStuck(run: Run, piece: Run, moves: StuckMoves, check: Check, what: () => string): number {
  const along = { x: Math.cos(run.rotationY), z: -Math.sin(run.rotationY) }, out = { x: Math.sin(run.rotationY), z: Math.cos(run.rotationY) };
  const onLine = (t: number): Run => ({ ...piece, x: run.x + along.x * t, z: run.z + along.z * t });
  const alongOf = (x: number, z: number) => (x - run.x) * along.x + (z - run.z) * along.z;
  let refused = 0;
  const [nudge, snap, drag] = [[piece.x + along.x * 0.01, piece.z + along.z * 0.01], moves.snapAim(piece), [piece.x + along.x * 0.2, piece.z + along.z * 0.2]];
  const tries: Array<[string, number, number, [number, number]]> = [
    ["a 10 mm nudge along", nudge[0], nudge[1], moves.move(piece, nudge[0], nudge[1])],
    ["Snap to wall", snap[0], snap[1], moves.move(piece, snap[0], snap[1])],
    ["a 0.2 m drag along", drag[0], drag[1], moves.drag(piece, drag[0], drag[1])],
  ];
  for (const [move, aimX, aimZ, [x, z]] of tries) {
    const aim = alongOf(aimX, aimZ), at = alongOf(x, z), across = (x - run.x) * out.x + (z - run.z) * out.z;
    if (!moves.contained({ ...piece, x, z })) {
      refused += 1;
      // Its fitted place, where in reach, fits: refusing it then is wrong.
      check(!(Math.abs(aim) <= piece.width && piece.width === run.width && moves.clearlyFits(onLine(0))), () => `${what()}: stuck, ${move} is refused, though its fitted place ${(Math.abs(aim) * 1000).toFixed(0)} mm along its wall fits`);
      continue;
    }
    check(moves.fits({ ...piece, x, z }), () => `${what()}: stuck, ${move} left it where it doesn't fit`);
    // On its face (to a millimetre: Snap to wall may take it to another face's line a hair off this one's, where it fits).
    check(Math.abs(across) < 0.001, () => `${what()}: stuck, ${move} took it ${(across * 1000).toFixed(1)} mm off its wall`);
    check(Math.abs(at - aim) <= piece.width + 1e-6, () => `${what()}: stuck, ${move} slid it ${(Math.abs(at - aim) * 1000).toFixed(0)} mm, further than its own width`);
    for (let step = 0.005; step < Math.abs(at - aim) - 0.005; step += 0.005) {
      const nearer = [aim - step, aim + step].find((t) => moves.clearlyFits(onLine(t)));
      if (nearer === undefined) continue;
      check(false, () => `${what()}: stuck, ${move} slid it ${(Math.abs(at - aim) * 1000).toFixed(0)} mm, past a place ${(step * 1000).toFixed(0)} mm from its aim that fits`);
      break;
    }
  }
  return refused;
}
