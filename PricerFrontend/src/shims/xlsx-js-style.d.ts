export {};

declare global {
  interface Window {
    XLSX: typeof import('xlsx-js-style');
  }
}