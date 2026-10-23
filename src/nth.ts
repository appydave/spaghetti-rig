/** The item at an index that the caller knows is in range; throws saying which list and index when it is not. */
export function nth<T>(list: readonly T[], index: number, what: string): T {
  const item = list[index];
  if (item === undefined) {
    throw new RangeError(
      `${what}[${index}] is out of range (${list.length} items)`,
    );
  }
  return item;
}
