export function isObject(item: unknown): item is Record<string, unknown> {
  return Boolean(item) && typeof item === "object" && !Array.isArray(item);
}

export function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Record<string, any>
): T {
  const output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key as keyof T] = deepMerge(target[key] as any, source[key]);
        }
      } else if (Array.isArray(source[key])) {
        const targetArray = Array.isArray(target[key]) ? target[key] : [];
        output[key as keyof T] = Array.from(new Set([...targetArray, ...source[key]])) as any;
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}
