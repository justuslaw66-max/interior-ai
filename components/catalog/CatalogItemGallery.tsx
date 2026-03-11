type Props = {
  imageUrl?: string;
  title: string;
};

export default function CatalogItemGallery({ imageUrl, title }: Props) {
  return (
    <div className="aspect-[4/3] overflow-hidden rounded-lg bg-neutral-100">
      {imageUrl ? (
        <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-neutral-400">No image</div>
      )}
    </div>
  );
}
