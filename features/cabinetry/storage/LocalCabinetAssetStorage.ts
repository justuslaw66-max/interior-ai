import type {
  CabinetAssetStorage,
  DeleteGeneratedGlbInput,
  SaveGeneratedGlbInput,
  SaveGeneratedGlbResult,
} from "./CabinetAssetStorage";

export class LocalCabinetAssetStorage implements CabinetAssetStorage {
  private readonly ownedUrls = new Set<string>();
  private readonly urlByCabinetId = new Map<string, string>();

  async saveGeneratedGlb({
    cabinetId,
    blob,
  }: SaveGeneratedGlbInput): Promise<SaveGeneratedGlbResult> {
    const previousUrl = this.urlByCabinetId.get(cabinetId);
    if (previousUrl) {
      this.deleteGeneratedGlb({ glbAssetUrl: previousUrl });
    }

    const glbAssetUrl = URL.createObjectURL(blob);
    this.ownedUrls.add(glbAssetUrl);
    this.urlByCabinetId.set(cabinetId, glbAssetUrl);

    return { glbAssetUrl };
  }

  deleteGeneratedGlb({ glbAssetUrl }: DeleteGeneratedGlbInput): void {
    if (!glbAssetUrl || !this.ownedUrls.has(glbAssetUrl)) return;

    URL.revokeObjectURL(glbAssetUrl);
    this.ownedUrls.delete(glbAssetUrl);

    for (const [cabinetId, url] of this.urlByCabinetId.entries()) {
      if (url === glbAssetUrl) {
        this.urlByCabinetId.delete(cabinetId);
      }
    }
  }

  ownsGeneratedGlb(glbAssetUrl?: string | null): boolean {
    return Boolean(glbAssetUrl && this.ownedUrls.has(glbAssetUrl));
  }

  dispose(): void {
    for (const glbAssetUrl of this.ownedUrls) {
      URL.revokeObjectURL(glbAssetUrl);
    }
    this.ownedUrls.clear();
    this.urlByCabinetId.clear();
  }
}
