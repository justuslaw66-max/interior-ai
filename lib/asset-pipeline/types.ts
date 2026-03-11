export type AssetPipelineCheck = {
  severity: "error" | "warning";
  code: string;
  message: string;
  details?: string;
};

export type ModelInspectStats = {
  materialCount: number | null;
  triangleCount: number | null;
  textureCount: number | null;
  maxTextureResolution: number | null;
  hasBaseColorTexture: boolean | null;
};

export type PipelineStepResult = {
  step: string;
  success: boolean;
  details: string;
  toolUnavailable?: boolean;
};

export type AssetQaStatus = "approved" | "needs_fix" | "blocked";

export type AssetQaReport = {
  score: number;
  status: AssetQaStatus;
  blockers: string[];
  warnings: string[];
  metrics: {
    fileSizeBytes: number;
    triangleCount: number;
    textureCount: number;
    maxTextureSize: number;
  };
};
