// react-dom ships with Expo for web without its type package; declare the one API used.
declare module 'react-dom' {
  export function flushSync<R>(fn: () => R): R;
}
