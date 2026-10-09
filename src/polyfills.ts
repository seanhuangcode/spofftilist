// Safari on iOS 15.0–15.3 is missing a few newer built-ins that libraries sometimes use.

/* eslint-disable no-extend-native */
function at(this: any, i: number) {
  const n = Math.trunc(i) || 0;
  const k = n < 0 ? this.length + n : n;
  return k >= 0 && k < this.length ? this[k] : undefined;
}

for (const proto of [Array.prototype, String.prototype] as any[]) {
  if (!proto.at) Object.defineProperty(proto, 'at', { value: at, writable: true, configurable: true });
}

// React Navigation calls findLastIndex when you go back a screen.
if (!(Array.prototype as any).findLastIndex) {
  Object.defineProperty(Array.prototype, 'findLastIndex', {
    value(this: any[], fn: (v: any, i: number, a: any[]) => boolean) {
      for (let i = this.length - 1; i >= 0; i--) if (fn(this[i], i, this)) return i;
      return -1;
    },
    writable: true,
    configurable: true,
  });
}

if (!(Array.prototype as any).findLast) {
  Object.defineProperty(Array.prototype, 'findLast', {
    value(this: any[], fn: (v: any, i: number, a: any[]) => boolean) {
      const i = (this as any).findLastIndex(fn);
      return i === -1 ? undefined : this[i];
    },
    writable: true,
    configurable: true,
  });
}

if (!(Object as any).hasOwn) {
  Object.defineProperty(Object, 'hasOwn', {
    value: (o: object, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k),
    writable: true,
    configurable: true,
  });
}
