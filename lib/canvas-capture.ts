import * as THREE from "three";

/**
 * Exports stay light (plan decision, J 13 Oct), but on a dark device the 3D view's surroundings
 * are dark (dark mode PR 4). Objects whose colours are the canvas's own (the workspace ground and
 * its grid) carry their light colours in userData, and the scene its light background, so an
 * export's capture can draw them light for its one frame.
 */
const CAPTURE_LIGHT_BACKGROUND = "captureLightBackground";
const CAPTURE_LIGHT_COLOURS = "captureLightColours";

/** A material's colour slots ("color", or a shader uniform such as "cellColor") and their light values. */
type LightColours = Readonly<Record<string, string>>;
type ColouredMaterial = THREE.Material & { color?: unknown; uniforms?: Record<string, THREE.IUniform> };

/** Keeps the scene's light background for an export's capture. */
export function keepCaptureLightBackground(scene: THREE.Scene, light: string) {
  scene.userData[CAPTURE_LIGHT_BACKGROUND] = light;
}

/** userData for an object whose material swaps back to these light colours for an export. */
export function captureLightUserData(colours: LightColours) {
  return { [CAPTURE_LIGHT_COLOURS]: colours };
}

function colourSlot(material: ColouredMaterial, name: string): THREE.Color | null {
  const value = name === "color" ? material.color : material.uniforms?.[name]?.value;
  return value instanceof THREE.Color ? value : null;
}

function lightColoursOf(object: THREE.Object3D): LightColours | null {
  const colours: unknown = object.userData[CAPTURE_LIGHT_COLOURS];
  // Set only by captureLightUserData, so an object here is a LightColours.
  return colours && typeof colours === "object" ? (colours as LightColours) : null;
}

/** Sets the scene's tagged colours to light and returns how to put them back. */
function swapToLightColours(scene: THREE.Scene): () => void {
  const restore: Array<() => void> = [];
  const swap = (target: THREE.Color, light: string) => {
    const drawn = target.clone();
    target.set(light);
    restore.push(() => target.copy(drawn));
  };
  const background: unknown = scene.userData[CAPTURE_LIGHT_BACKGROUND];
  if (scene.background instanceof THREE.Color && typeof background === "string") {
    swap(scene.background, background);
  }
  scene.traverse((object) => {
    const colours = lightColoursOf(object);
    // Only meshes have a material; the tagged ones are meshes (the ground) and drei's Grid.
    const material = (object as THREE.Mesh).material as ColouredMaterial | ColouredMaterial[] | undefined;
    if (!colours || !material || Array.isArray(material)) return;
    for (const [name, light] of Object.entries(colours)) {
      const slot = colourSlot(material, name);
      if (slot) swap(slot, light);
    }
  });
  return () => restore.forEach((undo) => undo());
}

/**
 * Draws the scene once in its light colours, reads the canvas with `read`, then puts the colours
 * back and draws it again, in the same task, so the view on screen never shows the light frame.
 */
export function renderLightCapture<T>(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  read: (canvas: HTMLCanvasElement) => T
): T {
  const restore = swapToLightColours(scene);
  try {
    renderer.render(scene, camera);
    return read(renderer.domElement);
  } finally {
    restore();
    renderer.render(scene, camera);
  }
}
