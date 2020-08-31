export function isPresent<T>(list: T[]): list is [T, ...T[]] {
  return list.length > 0;
}

export function assertPresent<T>(list: T[]): [T, ...T[]] {
  if (isPresent(list)) {
    return list;
  } else {
    throw new Error(`unexpected empty list`);
  }
}
