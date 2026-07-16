export type DesignPageItemCartEntry = {
  id: string;
  productId: string;
  title: string;
  qty: number;
  thumbUrl?: string;
};

export function removeDesignPageItemCartProduct(
  items: DesignPageItemCartEntry[],
  productId: string
): DesignPageItemCartEntry[] {
  return items.filter((item) => item.productId !== productId);
}

export function updateDesignPageItemCartQuantity(
  items: DesignPageItemCartEntry[],
  productId: string,
  qty: number
): DesignPageItemCartEntry[] {
  return items.map((item) =>
    item.productId === productId ? { ...item, qty } : item
  );
}

export function getDesignPageItemCartQuantity(
  items: DesignPageItemCartEntry[]
): number {
  return items.reduce((sum, item) => sum + item.qty, 0);
}
