type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export default function CatalogSearchInput({
  value,
  onChange,
  placeholder = "Search title, brand, style, finish, SKU...",
}: Props) {
  return (
    <input
      data-testid="catalog-search-input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400"
      placeholder={placeholder}
    />
  );
}
