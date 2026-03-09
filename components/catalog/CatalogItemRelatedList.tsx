import { CATALOG_ITEMS } from "@/lib/catalog";

type RelatedSection = {
  title: string;
  ids: string[];
};

type Props = {
  sections: RelatedSection[];
  onPreviewRelated: (id: string) => void;
};

export default function CatalogItemRelatedList({ sections, onPreviewRelated }: Props) {
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.title}>
          <div className="text-xs font-semibold text-neutral-800">{section.title}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {section.ids.slice(0, 4).map((id) => {
              const item = CATALOG_ITEMS[id];
              if (!item) return null;
              return (
                <button
                  key={id}
                  onClick={() => onPreviewRelated(id)}
                  className="rounded-full border border-neutral-200 px-2 py-1 text-[11px] text-neutral-700"
                >
                  {item.title}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
