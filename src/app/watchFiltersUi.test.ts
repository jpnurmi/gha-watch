import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("watch filter UI", () => {
  it("renders accessible native search, status, and repository controls", () => {
    expect(mainSource).toContain('name="watch-filter-query"');
    expect(mainSource).toContain('aria-controls="watch-list"');
    expect(mainSource).toContain('role="group" aria-label="Filter by status"');
    expect(mainSource).toContain('aria-pressed="${selected ? "true" : "false"}"');
    expect(mainSource).toContain('aria-label="Filter by repository"');
    expect(mainSource).toContain('repositories.length > 1 ? renderWatchRepositoryFilter(repositories) : ""');
  });

  it("escapes query and repository values before placing them in markup", () => {
    expect(mainSource).toContain('value="${escapeHtml(filters.query)}"');
    expect(mainSource).toContain('<option value="${escapeHtml(repository)}"');
    expect(mainSource).toContain('>${escapeHtml(repository)}</option>');
  });

  it("distinguishes filtered results from a truly empty view", () => {
    expect(mainSource).toContain('viewModel.filtering ? "No matching watches" : emptyState.label');
    expect(mainSource).toContain('data-action="clear-watch-filters">Clear filters');
    expect(mainSource).toContain('${String(viewModel.rows.length)} of ${String(viewModel.totalRowCount)}');
    expect(mainSource).toContain('inbox: { label: "Inbox is clear", showAdd: true }');
  });

  it("keeps filters per view and applies them before building the popup model", () => {
    expect(mainSource).toContain("const watchFiltersByView = createWatchFiltersByView()");
    expect(mainSource).toContain("const filters = watchFiltersByView[currentWatchView]");
    expect(mainSource).toMatch(/createPopupViewModel\([\s\S]*?showRepositoryTools \? repoCiStatuses : \{\},\s*filters,/);
  });

  it("keeps the search input outside the Add form and prevents slash from stealing text input", () => {
    expect(mainSource.indexOf("function renderWatchFilters")).toBeLessThan(
      mainSource.indexOf("function renderAddForm"),
    );
    expect(mainSource).toContain("textControlActive: isTextControl(event.target)");
    expect(mainSource).toContain("filterKeyboardAction === \"focus-search\"");
  });

  it("reveals facets only while focused or active and keeps them compact", () => {
    expect(styles).toMatch(/\.watch-filter-facets\s*\{[^}]*display:\s*none;/s);
    expect(styles).toMatch(/\.watch-filters:focus-within \.watch-filter-facets,[^{]*\.watch-filters\.is-active \.watch-filter-facets\s*\{[^}]*display:\s*flex;/s);
    expect(styles).toMatch(/\.watch-filter-statuses\s*\{[^}]*flex-wrap:\s*wrap;/s);
  });

  it("includes the filter controls in dynamic popup sizing", () => {
    expect(mainSource).toContain('const watchFilters = app.querySelector<HTMLElement>(".watch-filters")');
    expect(mainSource).toContain('(watchFilters?.offsetHeight ?? 0)');
  });
});
