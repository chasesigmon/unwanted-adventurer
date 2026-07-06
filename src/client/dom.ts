// The markup in index.html is static, so every id looked up here is
// guaranteed to exist — this centralizes that assumption in one place
// instead of non-null-asserting `document.getElementById(...)` everywhere.
export function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Expected #${id} to exist in the DOM.`);
  }
  return el as T;
}
