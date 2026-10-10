function shallowEqual(first: object, second: object | undefined) {
  if (!second) return false;
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  return (
    firstKeys.length === secondKeys.length &&
    firstKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(second, key) &&
        (first as Record<string, unknown>)[key] === (second as Record<string, unknown>)[key]
    )
  );
}

/**
 * `next`, with each room shallowly equal to the room at the same place in
 * `previous` replaced by that previous object, and `previous` itself when every
 * room is. Migrating a snapshot copies every room; an edit that changes no room
 * (selecting one) then keeps the room objects, and everything memoized on them.
 */
export function keepUnchangedRooms<Room extends object>(previous: readonly Room[] | undefined, next: Room[]): Room[] {
  if (!Array.isArray(previous)) return next;
  const kept = next.map((room, index) => (shallowEqual(room, previous[index]) ? previous[index] : room));
  const unchanged = kept.length === previous.length && kept.every((room, index) => room === previous[index]);
  return unchanged ? (previous as Room[]) : kept;
}
