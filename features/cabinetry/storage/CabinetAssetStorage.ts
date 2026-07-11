export type SaveGeneratedGlbInput = {
  cabinetId: string;
  blob: Blob;
};

export type SaveGeneratedGlbResult = {
  glbAssetUrl: string;
};

export type DeleteGeneratedGlbInput = {
  glbAssetUrl?: string | null;
};

export interface CabinetAssetStorage {
  saveGeneratedGlb(input: SaveGeneratedGlbInput): Promise<SaveGeneratedGlbResult>;
  deleteGeneratedGlb(input: DeleteGeneratedGlbInput): void | Promise<void>;
  ownsGeneratedGlb?(glbAssetUrl?: string | null): boolean;
  dispose?(): void;
}
