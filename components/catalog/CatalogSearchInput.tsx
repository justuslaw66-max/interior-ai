import { Search } from "lucide-react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export default function CatalogSearchInput({
  value,
  onChange,
  placeholder = "Search products",
}: Props) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search
        className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
        aria-hidden="true"
      />
      <input
        data-testid="catalog-search-input"
        aria-label="Search catalogue products"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-neutral-300 bg-white pl-7 pr-1.5 text-base text-neutral-900 placeholder:text-neutral-500 md:text-[13px]"
        placeholder={placeholder}
      />
    </div>
  );
}
