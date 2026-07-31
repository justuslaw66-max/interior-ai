export type CastleryConfigurationIconDescriptor = Readonly<{
  src: string;
  mirror?: boolean;
  crop?: Readonly<{
    scale?: number;
    objectPosition?: string;
  }>;
  fallback?: boolean;
}>;

const ASSET_ROOT = "/assets/configuration-icons/castlery";
const HAMILTON_ASSET_ROOT = `${ASSET_ROOT}/hamilton`;

const icon = (
  name: string,
  options: Omit<CastleryConfigurationIconDescriptor, "src"> = {},
): CastleryConfigurationIconDescriptor => ({
  src: `${ASSET_ROOT}/${name}.svg`,
  ...options,
});

const hamiltonIcon = (
  name: string,
  options: Omit<CastleryConfigurationIconDescriptor, "src"> = {},
): CastleryConfigurationIconDescriptor => ({
  src: `${HAMILTON_ASSET_ROOT}/${name}.avif`,
  ...options,
});

export const CASTLERY_CONFIGURATION_ICON_BY_PRODUCT_ID: Readonly<
  Record<string, CastleryConfigurationIconDescriptor>
> = {
  "sofa-real-castlery-hamilton-2-seater": hamiltonIcon("2-seater"),
  "sofa-real-castlery-hamilton-2-seater-with-storage-ottoman": hamiltonIcon(
    "2-seater-with-ottoman",
  ),
  "sofa-real-castlery-hamilton-3-seater": hamiltonIcon("3-seater"),
  "sofa-real-castlery-hamilton-3-seater-with-storage-ottoman": hamiltonIcon(
    "3-seater-with-ottoman",
  ),
  "sofa-real-castlery-hamilton-3-seater-sofa-bed":
    hamiltonIcon("3-seater-sofa-bed"),
  "sofa-real-castlery-hamilton-chaise-sectional-left":
    hamiltonIcon("chaise-left"),
  "sofa-real-castlery-hamilton-chaise-sectional-right": hamiltonIcon(
    "chaise-left",
    { mirror: true },
  ),
  "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-left":
    hamiltonIcon("chaise-with-ottoman-left"),
  "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-right":
    hamiltonIcon("chaise-with-ottoman-left", { mirror: true }),
  "sofa-real-castlery-hamilton-round-chaise-sectional-left": hamiltonIcon(
    "round-chaise-left",
  ),
  "sofa-real-castlery-hamilton-round-chaise-sectional-right": hamiltonIcon(
    "round-chaise-left",
    { mirror: true },
  ),
  "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-left":
    hamiltonIcon("chaise-sofa-bed-left"),
  "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-right":
    hamiltonIcon("chaise-sofa-bed-left", { mirror: true }),
  "armchair-real-castlery-hamilton-round-swivel-armchair": hamiltonIcon(
    "round-swivel-armchair",
  ),
  "armchair-real-castlery-hamilton-round-swivel-1-5-seater-armchair":
    hamiltonIcon("round-swivel-1-5-seater"),

  "sofa-real-castlery-dawson-3s": icon("sofa-3-seat"),
  "sofa-real-castlery-dawson-extended-sofa": icon("sofa-extended-4-seat"),
  "sofa-real-castlery-dawson-ottoman": icon("ottoman"),
  "sofa-real-castlery-dawson-storage-ottoman": icon("storage-ottoman"),
  "sofa-real-castlery-dawson-wide-chaise-sectional-left": icon(
    "wide-chaise-left",
  ),
  "sofa-real-castlery-dawson-wide-chaise-sectional": icon("wide-chaise-left", {
    mirror: true,
  }),
  "sofa-real-castlery-dawson-chaise-sectional-left": icon("chaise-left"),
  "sofa-real-castlery-dawson-chaise-sectional": icon("chaise-left", {
    mirror: true,
  }),
  "sofa-real-castlery-dawson-pit-sectional": icon("pit-sectional"),
  "sofa-real-castlery-dawson-swivel-armchair": icon("armchair-wide"),
};

export const CASTLERY_CONFIGURATION_ICON_FALLBACK = icon("sofa-3-seat", {
  fallback: true,
});

export function getCastleryConfigurationIconDescriptor(
  productId: string,
): CastleryConfigurationIconDescriptor {
  return (
    CASTLERY_CONFIGURATION_ICON_BY_PRODUCT_ID[productId] ??
    CASTLERY_CONFIGURATION_ICON_FALLBACK
  );
}
