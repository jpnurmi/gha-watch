export function reconcileHtml(root: HTMLElement, html: string): void {
  const template = root.ownerDocument.createElement("template");
  template.innerHTML = html;
  reconcileChildren(root, template.content);
}

function key(node: Node): string | undefined {
  if (!(node instanceof Element)) return undefined;
  const identity = node.getAttribute("data-draft-key") ?? node.getAttribute("data-id") ??
    (node.matches(".watch-group") ? node.getAttribute("data-repo") : null) ?? node.id;
  return identity ? `${node.tagName}/${node.getAttribute("data-action") ?? ""}/${identity}` : undefined;
}

function compatible(current: Node, next: Node): boolean {
  if (current.nodeType !== next.nodeType) return false;
  if (!(current instanceof Element) || !(next instanceof Element)) return true;
  return current.tagName === next.tagName && key(current) === key(next) &&
    current.getAttribute("data-action") === next.getAttribute("data-action") &&
    current.getAttribute("name") === next.getAttribute("name") &&
    current.classList.item(0) === next.classList.item(0);
}

function reconcileChildren(parent: Node, next: Node): void {
  const keyed = new Map<string, Node>();
  for (const child of parent.childNodes) {
    const id = key(child);
    if (id) keyed.set(id, child);
  }
  let cursor = parent.firstChild;
  for (const child of Array.from(next.childNodes)) {
    const id = key(child);
    let match = id ? keyed.get(id) : cursor;
    if (!id) {
      while (match && (key(match) || !compatible(match, child))) match = match.nextSibling;
    }
    if (match && compatible(match, child)) {
      if (match !== cursor) parent.insertBefore(match, cursor);
      updateNode(match, child);
      cursor = match.nextSibling;
      if (id) keyed.delete(id);
    } else {
      parent.insertBefore(child.cloneNode(true), cursor);
    }
  }
  while (cursor) {
    const remaining = cursor.nextSibling;
    parent.removeChild(cursor);
    cursor = remaining;
  }
}

function updateNode(current: Node, next: Node): void {
  if (!(current instanceof Element) || !(next instanceof Element)) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  for (const attribute of Array.from(current.attributes)) {
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of next.attributes) {
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value);
    }
  }
  reconcileChildren(current, next);
}
