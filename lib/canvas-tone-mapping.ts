import * as THREE from "three";

/**
 * On a dark page the 2D plan draws its colours as chosen (dark mode PR 4). The renderer keeps the
 * ACES tone mapping the 3D view's lighting sets, which crushes dark colours: a Pro room meant as
 * #2C2C2E drew near black, darker than the paper. So the plan turns tone mapping off while it shows
 * on a dark page and puts it back when it goes; the 3D view's lighting sets its own again. Light
 * keeps today's look. Returns the clean-up for a React effect.
 */
export function drawPlanColoursAsChosen(renderer: THREE.WebGLRenderer, dark: boolean): (() => void) | undefined {
  if (!dark) return undefined;
  const previous = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  return () => {
    renderer.toneMapping = previous;
  };
}
