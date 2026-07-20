export interface SceneRendererMetrics {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export const EMPTY_SCENE_RENDERER_METRICS: SceneRendererMetrics = {
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
};
