// DOM overlays (card draft, port shop, death screen).
// DOM sits above the canvas, so buttons stay clickable while the scene is paused.

export function showOverlay(innerHtml: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = innerHtml;
  document.body.appendChild(el);
  return el;
}

export function closeAllOverlays(): void {
  document.querySelectorAll('.overlay').forEach((el) => el.remove());
}
