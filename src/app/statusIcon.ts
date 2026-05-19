import type { RowTone } from "./viewModel";

const maskedIconPaths: Partial<Record<RowTone, string>> = {
  success:
    '<path d="M4.75 8.25 7 10.5l4.25-5" fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>',
  failure:
    '<path d="m5.25 5.25 5.5 5.5m0-5.5-5.5 5.5" fill="none" stroke="#000" stroke-linecap="round" stroke-width="1.8"/>',
  error:
    '<path d="m5.25 5.25 5.5 5.5m0-5.5-5.5 5.5" fill="none" stroke="#000" stroke-linecap="round" stroke-width="1.8"/>',
  cancelled:
    '<path d="m4.75 11.25 6.5-6.5" fill="none" stroke="#000" stroke-linecap="round" stroke-width="1.8"/>',
  skipped:
    '<path d="M4.75 8h6.5" fill="none" stroke="#000" stroke-linecap="round" stroke-width="1.8"/>',
};

export function getStatusIconSvg(tone: RowTone, idSuffix = "default"): string {
  const maskedPath = maskedIconPaths[tone];

  if (maskedPath) {
    const maskId = `status-icon-mask-${tone}-${sanitizeIdSuffix(idSuffix)}`;

    return `
      <svg viewBox="0 0 16 16">
        <mask id="${maskId}" maskUnits="userSpaceOnUse">
          <rect width="16" height="16" fill="#fff"/>
          ${maskedPath}
        </mask>
        <circle cx="8" cy="8" r="8" fill="currentColor" mask="url(#${maskId})"/>
      </svg>
    `;
  }

  if (tone === "queued") {
    return `
      <svg viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="4.25" fill="currentColor"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.25" opacity="0.45"/>
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.25"/>
    </svg>
  `;
}

function sanitizeIdSuffix(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
