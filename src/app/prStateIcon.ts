import type { PrStateTone } from "./viewModel";

const iconPaths: Record<PrStateTone, string> = {
  draft: `
    <circle cx="8" cy="8" r="5.75" fill="none" stroke="currentColor" stroke-dasharray="2 2" stroke-linecap="round" stroke-width="1.5"/>
    <path d="m6 9.75 3.8-3.8 1.25 1.25-3.8 3.8H6z" fill="currentColor"/>
  `,
  ready: `
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M5.25 8.25 7.1 10.1l3.65-4.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75"/>
  `,
  merged: `
    <circle cx="4.75" cy="3.75" r="1.6" fill="none" stroke="currentColor" stroke-width="1.45"/>
    <circle cx="11.25" cy="12.25" r="1.6" fill="none" stroke="currentColor" stroke-width="1.45"/>
    <path d="M4.75 5.35v2.15a3.75 3.75 0 0 0 3.75 3.75h1.15" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.55"/>
    <path d="M9.1 8.95 11.4 11.25 9.1 13.55" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.55"/>
  `,
  closed: `
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="m5.75 5.75 4.5 4.5m0-4.5-4.5 4.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.75"/>
  `,
};

export function getPrStateIconSvg(tone: PrStateTone): string {
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      ${iconPaths[tone]}
    </svg>
  `;
}
