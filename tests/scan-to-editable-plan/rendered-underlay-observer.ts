import type { Page } from "@playwright/test";
import type { Object3D, BufferGeometry } from "three";
import type { RootState } from "@react-three/fiber";

type Fiber = { stateNode?: unknown; child?: Fiber | null; sibling?: Fiber | null };
type SceneMesh = Object3D & { geometry?: BufferGeometry; material?: { map?: { image?: { src?: string } } };
  __r3f?: { root: { getState: () => RootState } } };

/** Reads actual loaded image mesh vertices and UVs through the test-only DevTools observer. */
export async function renderedUnderlay(page: Page, assetUrl: string) {
  return page.evaluate((assetUrl) => {
    const host = window as typeof window & { __scanPlanReactRoots?: Set<{ current: Fiber }> };
    const pending = [...(host.__scanPlanReactRoots ?? [])].map(({ current }) => current), visited = new Set<Fiber>();
    while (pending.length && visited.size < 30_000) {
      const node = pending.pop()!;
      if (!node || visited.has(node)) continue;
      visited.add(node); if (node.child) pending.push(node.child); if (node.sibling) pending.push(node.sibling);
      const instance = node.stateNode;
      const value = instance && typeof instance === "object" && "object" in instance ? instance.object : instance;
      if (!value || typeof value !== "object" || !("isObject3D" in value) || value.isObject3D !== true) continue;
      const mesh = value as SceneMesh;
      if (!mesh.material?.map?.image?.src?.endsWith(assetUrl) || !mesh.__r3f) continue;
      const state = mesh.__r3f.root.getState();
      if (state.scene.getObjectById(mesh.id) !== mesh) continue;
      const position = mesh.geometry?.getAttribute("position"), uv = mesh.geometry?.getAttribute("uv");
      if (!position || !uv) continue;
      const bounds = state.gl.domElement.getBoundingClientRect(), point = mesh.position.clone();
      return Array.from({ length: position.count }, (_, index) => {
        point.set(position.getX(index), position.getY(index), position.getZ(index)).applyMatrix4(mesh.matrixWorld);
        const world = point.toArray(), projected = point.project(state.camera);
        return { u: uv.getX(index), v: uv.getY(index), world,
          screen: { x: bounds.left + (projected.x + 1) * bounds.width / 2, y: bounds.top + (1 - projected.y) * bounds.height / 2 } };
      });
    }
    return null;
  }, assetUrl);
}
