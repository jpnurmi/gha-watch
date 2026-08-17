function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderTitleMarkup(value: string): string {
  const codeSpanPattern = /`([^`\r\n]+)`/g;
  let rendered = "";
  let lastIndex = 0;

  for (const match of value.matchAll(codeSpanPattern)) {
    const index = match.index;
    rendered += escapeHtml(value.slice(lastIndex, index));
    rendered += `<code>${escapeHtml(match[1])}</code>`;
    lastIndex = index + match[0].length;
  }

  return rendered + escapeHtml(value.slice(lastIndex));
}
