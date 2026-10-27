"use client";

import { track } from "@/lib/analytics";

export default function ShopLink({
  url,
  retailer,
  itemId,
  type,
  children,
}: {
  url: string;
  retailer: string;
  itemId: string;
  type: "shopify" | "affiliate";
  children: React.ReactNode;
}) {
  const handleClick = () => {
    track("shop_clicked", {
      item_id: itemId,
      retailer,
      type,
    });
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className="text-link hover:underline"
    >
      {children}
    </a>
  );
}
