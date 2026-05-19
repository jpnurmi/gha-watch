export function renderDragGripIcon(): string {
  return `
    <svg viewBox="0 0 16 16">
      <circle cx="6" cy="4" r="1.1" fill="currentColor"/>
      <circle cx="10" cy="4" r="1.1" fill="currentColor"/>
      <circle cx="6" cy="8" r="1.1" fill="currentColor"/>
      <circle cx="10" cy="8" r="1.1" fill="currentColor"/>
      <circle cx="6" cy="12" r="1.1" fill="currentColor"/>
      <circle cx="10" cy="12" r="1.1" fill="currentColor"/>
    </svg>
  `;
}

export function renderWatchLeadingSlot(iconHtml: string, overlayHtml = ""): string {
  return renderLeadingSlot("watch-leading-slot", iconHtml, overlayHtml);
}

export function renderWatchTreeLeadingSlot(iconHtml: string, overlayHtml = ""): string {
  return renderLeadingSlot("watch-tree-leading-slot", iconHtml, overlayHtml);
}

function renderLeadingSlot(slotClassName: string, iconHtml: string, overlayHtml = ""): string {
  return `
    <span class="${slotClassName}">
      ${iconHtml}
      ${overlayHtml}
      <span class="watch-drag-glyph" aria-hidden="true">
        ${renderDragGripIcon()}
      </span>
    </span>
  `;
}
