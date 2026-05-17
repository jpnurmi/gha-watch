import type { PrStateTone } from "./viewModel";

const iconPaths: Record<PrStateTone, string> = {
  draft: `
    <circle cx="5" cy="3.75" r="1.6" fill="none" stroke="currentColor" stroke-width="1.45"/>
    <circle cx="5" cy="12.25" r="1.6" fill="none" stroke="currentColor" stroke-width="1.45"/>
    <circle cx="11.25" cy="6.75" r="1.6" fill="none" stroke="currentColor" stroke-width="1.45"/>
    <path d="M5 5.35v5.3M6.4 4.55l3.45 1.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.55"/>
  `,
  ready: `
    <circle cx="5" cy="3.75" r="1.6" fill="none" stroke="currentColor" stroke-width="1.45"/>
    <circle cx="5" cy="12.25" r="1.6" fill="none" stroke="currentColor" stroke-width="1.45"/>
    <circle cx="11.25" cy="6.75" r="1.6" fill="none" stroke="currentColor" stroke-width="1.45"/>
    <path d="M5 5.35v5.3M6.4 4.55l3.45 1.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.55"/>
  `,
  merged: `
    <circle cx="4.75" cy="3.75" r="1.6" fill="none" stroke="currentColor" stroke-width="1.45"/>
    <circle cx="11.25" cy="12.25" r="1.6" fill="none" stroke="currentColor" stroke-width="1.45"/>
    <path d="M4.75 5.35v2.15a3.75 3.75 0 0 0 3.75 3.75h1.15" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.55"/>
    <path d="M9.1 8.95 11.4 11.25 9.1 13.55" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.55"/>
  `,
  closed: `
    <circle cx="5" cy="3.75" r="1.6" fill="none" stroke="currentColor" stroke-width="1.45"/>
    <circle cx="5" cy="12.25" r="1.6" fill="none" stroke="currentColor" stroke-width="1.45"/>
    <path d="M5 5.35v5.3M8.75 5.75l4.25 4.25m0-4.25L8.75 10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.55"/>
  `,
};

export function getPrStateIconSvg(tone: PrStateTone): string {
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      ${iconPaths[tone]}
    </svg>
  `;
}
