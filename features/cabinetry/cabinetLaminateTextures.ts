import * as THREE from "three";

/**
 * Laminate pictures, shared by every cabinet drawn on the page.
 *
 * Every edit rebuilds a cabinet's meshes and materials. Each rebuild used to load its pictures
 * again, and a loaded picture arrives after at least one frame, so the doors flashed plain colour
 * after every edit. Here a picture is loaded once and leased: a rebuilt cabinet gets a picture
 * that is already loaded straight away, before its first frame. A picture no cabinet uses is
 * kept for a while, so picking a design again is instant too; the least recently used ones are
 * disposed once there are more than `maximumEntries`.
 *
 * Each 3D view (each WebGL renderer, the `owner`) gets its own copy of a picture, made from the
 * image already loaded. A renderer that uploads a texture keeps a listener on it until the texture
 * is disposed, so one texture shared by every view would keep each closed Studio preview's
 * renderer in memory for as long as the picture lived. A closed view's copies are disposed like
 * any other unused picture.
 */
export type CabinetTextureLoader = (
  url: string,
  onLoad: (texture: THREE.Texture) => void,
  onError: () => void
) => void;

type CabinetTextureLease = { attach: (texture: THREE.Texture) => void };

type CabinetTextureEntry = {
  url: string;
  texture: THREE.Texture | null;
  users: number;
  lastUsed: number;
  waiting: Set<CabinetTextureLease>;
};

export class CabinetTextureCache {
  private readonly entries = new Map<string, CabinetTextureEntry>();
  private usageClock = 0;
  private pruneQueued = false;

  constructor(
    private readonly load: CabinetTextureLoader,
    private readonly maximumEntries: number
  ) {}

  /**
   * Calls `attach` with the picture at `url` for the view `owner`: at once when it is loaded, or
   * when it arrives. Returns the release; after it, `attach` is never called.
   */
  acquire(url: string, owner: number, attach: (texture: THREE.Texture) => void): () => void {
    const key = `${owner} ${url}`;
    const entry = this.entries.get(key) ?? this.startLoad(key, url);
    const lease: CabinetTextureLease = { attach };
    entry.users += 1;
    entry.lastUsed = ++this.usageClock;
    if (entry.texture) attach(entry.texture);
    else entry.waiting.add(lease);
    this.queuePrune();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry.waiting.delete(lease);
      entry.users = Math.max(0, entry.users - 1);
      entry.lastUsed = ++this.usageClock;
      this.queuePrune();
    };
  }

  /** Disposes every picture, in use or not (the page is going away). */
  clear(): void {
    for (const [key, entry] of [...this.entries]) this.evict(key, entry);
  }

  size(): number {
    return this.entries.size;
  }

  private startLoad(key: string, url: string): CabinetTextureEntry {
    const entry: CabinetTextureEntry = { url, texture: null, users: 0, lastUsed: 0, waiting: new Set() };
    // Another view's copy shares its loaded image: no second download or decode, and no wait.
    const loaded = this.loadedTexture(url);
    this.entries.set(key, entry);
    if (loaded) {
      entry.texture = loaded.clone();
      return entry;
    }
    this.load(
      url,
      (texture) => {
        // A picture that arrives after its entry was disposed is disposed too.
        if (this.entries.get(key) !== entry) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        entry.texture = texture;
        const waiting = [...entry.waiting];
        entry.waiting.clear();
        waiting.forEach((lease) => lease.attach(texture));
      },
      () => {
        // The plain colour stays usable; the next cabinet to ask tries again.
        if (this.entries.get(key) === entry) this.entries.delete(key);
        entry.waiting.clear();
      }
    );
    return entry;
  }

  private loadedTexture(url: string): THREE.Texture | null {
    for (const entry of this.entries.values()) {
      if (entry.url === url && entry.texture) return entry.texture;
    }
    return null;
  }

  // Pruning waits for the end of the current task: a rebuild releases the old cabinet's pictures
  // and leases them again for the new one in the same commit, and must find them still there.
  private queuePrune(): void {
    if (this.pruneQueued) return;
    this.pruneQueued = true;
    queueMicrotask(() => {
      this.pruneQueued = false;
      this.prune();
    });
  }

  private prune(): void {
    while (this.entries.size > this.maximumEntries) {
      const unused = [...this.entries]
        .filter(([, entry]) => entry.users === 0)
        .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
      if (!unused) return;
      this.evict(unused[0], unused[1]);
    }
  }

  private evict(key: string, entry: CabinetTextureEntry): void {
    if (this.entries.get(key) !== entry) return;
    this.entries.delete(key);
    entry.waiting.clear();
    entry.texture?.dispose();
  }
}

/** About the pictures of two or three designs in use and a few just browsed past. */
const CABINET_TEXTURE_CACHE_ENTRIES = 8;

const sharedCabinetTextures = new CabinetTextureCache(
  (url, onLoad, onError) => new THREE.TextureLoader().load(url, onLoad, undefined, onError),
  CABINET_TEXTURE_CACHE_ENTRIES
);
const ownerIds = new WeakMap<object, number>();
let nextOwnerId = 1;
let pageHideListening = false;

function cabinetTextureOwnerId(owner: object): number {
  let id = ownerIds.get(owner);
  if (id === undefined) {
    id = nextOwnerId++;
    ownerIds.set(owner, id);
  }
  return id;
}

/**
 * Leases a laminate picture for the 3D view drawn by `renderer` from the page's shared cache; see
 * `CabinetTextureCache.acquire`.
 */
export function acquireCabinetLaminateTexture(
  url: string,
  renderer: object,
  attach: (texture: THREE.Texture) => void
): () => void {
  if (!pageHideListening && typeof window !== "undefined") {
    pageHideListening = true;
    // As the GLB caches do: a page leaving for good frees its pictures; one kept for back and
    // forward navigation keeps them.
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) sharedCabinetTextures.clear();
    });
  }
  return sharedCabinetTextures.acquire(url, cabinetTextureOwnerId(renderer), attach);
}
