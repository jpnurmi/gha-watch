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

export function renderWatchLeadingSlot(iconHtml: string): string {
  return `
    <span class="watch-leading-slot">
      ${iconHtml}
      <span class="watch-drag-glyph" aria-hidden="true">
        ${renderDragGripIcon()}
      </span>
    </span>
  `;
}
