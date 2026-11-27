/**
 * Main client orchestrator for Phase 2 Leaflet web map, floating map-first UI,
 * accessible tabs, View Transitions, URL deep-linking, and XSS-safe DOM rendering.
 */

import { DataClient } from "./dataClient.js";
import { MapView } from "./mapView.js";
import {
  EVENT_TYPE_LABELS,
  NEWS_CATEGORY_LABELS,
  SOURCE_TYPE_LABELS,
  STATUS_LABELS,
  TRUST_LABELS,
  el,
  formatAreaHa,
  formatDateHu,
  formatVolumeM3,
  normalizeSearch,
  safeHttpUrl,
  setupDialogEnhancements,
} from "./uiHelpers.js";

const TYPE_COLOR_VARS = {
  emergency_opening: "var(--c-emergency)",
  reservoir_filling: "var(--c-reservoir)",
  landscape_inundation: "var(--c-landscape)",
  oxbow_channel_filling: "var(--c-oxbow)",
  sluice_retention: "var(--c-sluice)",
};

const state = {
  bundle: null,
  vizigMetaByCode: new Map(),
  eventsById: new Map(),
  filters: {
    vizig: "ALL",
    type: "all",
    trust: "all",
    period: "all",
    newsCat: "all",
    q: "",
  },
  activeTab: "events",
  selectedEventId: null,
};

const dom = {
  searchInput: document.getElementById("search-input"),
  resetBtn: document.getElementById("reset-filters-btn"),
  typeFilterBtn: document.getElementById("type-filter-btn"),
  typeFilterDot: document.getElementById("type-filter-dot"),
  typeFilterLabel: document.getElementById("type-filter-label"),
  typePopover: document.getElementById("type-popover"),
  typeChips: [...document.querySelectorAll(".chip[data-type]")],
  filtersActiveCount: document.getElementById("filters-active-count"),
  filtersPopover: document.getElementById("filters-popover"),
  filterVizig: document.getElementById("filter-vizig"),
  filterTrust: document.getElementById("filter-trust"),
  filterPeriod: document.getElementById("filter-period"),
  filterNewsCat: document.getElementById("filter-news-cat"),
  sidePanel: document.getElementById("side-panel"),
  panelToggle: document.getElementById("panel-toggle"),
  sheetHandle: document.getElementById("sheet-handle"),
  panelScroll: document.getElementById("panel-scroll"),
  panelHeader: document.getElementById("panel-header"),
  vizigBanner: document.getElementById("vizig-banner"),
  vizigBannerCode: document.getElementById("vizig-banner-code"),
  vizigBannerName: document.getElementById("vizig-banner-name"),
  vizigBannerMeta: document.getElementById("vizig-banner-meta"),
  vizigBannerCounts: document.getElementById("vizig-banner-counts"),
  vizigBannerSite: document.getElementById("vizig-banner-site"),
  vizigClearBtn: document.getElementById("vizig-clear-btn"),
  listTabsView: document.getElementById("list-tabs-view"),
  tabEvents: document.getElementById("tab-events"),
  tabNews: document.getElementById("tab-news"),
  tabEventsCount: document.getElementById("tab-events-count"),
  tabNewsCount: document.getElementById("tab-news-count"),
  panelEvents: document.getElementById("panel-events"),
  panelNews: document.getElementById("panel-news"),
  eventsList: document.getElementById("events-list"),
  newsList: document.getElementById("news-list"),
  dossierView: document.getElementById("dossier-view"),
  dossierBackBtn: document.getElementById("dossier-back-btn"),
  dossierContent: document.getElementById("dossier-content"),
  ovfDialog: document.getElementById("ovf-dialog"),
  ovfCatFilter: document.getElementById("ovf-cat-filter"),
  ovfNewsList: document.getElementById("ovf-news-list"),
  liveStatus: document.getElementById("live-status"),
  toggleVizig: document.getElementById("toggle-vizig"),
  toggleRivers: document.getElementById("toggle-rivers"),
  toggleRef: document.getElementById("toggle-ref"),
  basemapBtns: [...document.querySelectorAll(".basemap-btn")],
  mobileListCount: document.getElementById("mobile-list-count"),
  metaLastUpdated: document.getElementById("meta-last-updated"),
  authorProfileLink: document.getElementById("author-profile-link"),
  contactReportLink: document.getElementById("contact-report-link"),
  layersToggle: document.getElementById("layers-toggle"),
  layersPopover: document.getElementById("layers-popover"),
  layersCloseBtn: document.getElementById("layers-close-btn"),
};

const client = new DataClient(document.body.dataset.mode || "api");
let mapView = null;

function announce(message) {
  dom.liveStatus.textContent = "";
  requestAnimationFrame(() => {
    dom.liveStatus.textContent = message;
  });
}

function trackAnalytics(path, title) {
  window.goatcounter?.count({
    path,
    title,
    event: true,
  });
}

function withTransition(fn, direction) {
  if (
    !document.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    fn();
    return;
  }
  document.startViewTransition({
    update: fn,
    types: [direction],
  });
}

function syncUrlParams() {
  const url = new URL(window.location.href);
  if (state.selectedEventId) {
    url.searchParams.set("event", state.selectedEventId);
  } else {
    url.searchParams.delete("event");
  }
  if (state.filters.vizig !== "ALL") {
    url.searchParams.set("vizig", state.filters.vizig);
  } else {
    url.searchParams.delete("vizig");
  }
  if (state.activeTab === "news") {
    url.searchParams.set("tab", "news");
  } else {
    url.searchParams.delete("tab");
  }
  history.replaceState(null, "", url);
}

function setBasemapUi(name) {
  for (const btn of dom.basemapBtns) {
    const active = btn.dataset.basemap === name;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function setMobileView(viewName) {
  const isFull = viewName === "list";
  if (dom.sidePanel) {
    dom.sidePanel.dataset.sheet = isFull ? "full" : "peek";
  }
  if (dom.sheetHandle) {
    dom.sheetHandle.setAttribute("aria-expanded", isFull ? "true" : "false");
  }
  if (mapView) {
    requestAnimationFrame(() => mapView.invalidateSize());
  }
}

function setDesktopPanelOpen(isOpen) {
  if (!dom.sidePanel || !dom.panelToggle) return;
  const label = isOpen ? "Lista elrejtése" : "Lista megjelenítése";
  dom.sidePanel.dataset.state = isOpen ? "open" : "closed";
  dom.panelToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  dom.panelToggle.setAttribute("aria-label", label);
  dom.panelToggle.title = label;
  if (mapView) {
    requestAnimationFrame(() => mapView.invalidateSize());
  }
}

function syncTypeChips() {
  const type = state.filters.type;
  for (const chip of dom.typeChips) {
    const active = chip.dataset.type === type;
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-pressed", active ? "true" : "false");
  }
  if (dom.typeFilterBtn && dom.typeFilterLabel && dom.typeFilterDot) {
    if (type === "all") {
      dom.typeFilterLabel.textContent = "Beavatkozás: Mind";
      dom.typeFilterDot.hidden = true;
      dom.typeFilterBtn.classList.remove("is-filtered");
    } else {
      dom.typeFilterLabel.textContent = EVENT_TYPE_LABELS[type] || type;
      dom.typeFilterDot.hidden = false;
      dom.typeFilterDot.style.background = TYPE_COLOR_VARS[type] || "var(--hydro-deep)";
      dom.typeFilterBtn.classList.add("is-filtered");
    }
  }
}

function switchTab(tabName) {
  state.activeTab = tabName === "news" ? "news" : "events";
  const isEvents = state.activeTab === "events";

  dom.tabEvents.setAttribute("aria-selected", isEvents ? "true" : "false");
  dom.tabNews.setAttribute("aria-selected", !isEvents ? "true" : "false");
  dom.tabEvents.toggleAttribute("focusgroupstart", isEvents);
  dom.tabNews.toggleAttribute("focusgroupstart", !isEvents);

  if (isEvents) {
    dom.panelEvents.removeAttribute("hidden");
    dom.panelNews.setAttribute("hidden", "until-found");
  } else {
    dom.panelNews.removeAttribute("hidden");
    dom.panelEvents.setAttribute("hidden", "until-found");
  }
  syncUrlParams();
}

function filterEvents() {
  const f = state.filters;
  const q = normalizeSearch(f.q.trim());
  return state.bundle.eventsPoints.features.filter((feat) => {
    const p = feat.properties;
    if (f.vizig !== "ALL" && p.vizig_code !== f.vizig) return false;
    if (f.type !== "all" && p.event_type !== f.type) return false;
    if (f.trust === "official" && !["official_ovf", "official_vizig"].includes(p.highest_trust_level)) {
      return false;
    }
    if (f.trust === "press" && !["press", "social_media"].includes(p.highest_trust_level)) {
      return false;
    }
    if (f.period === "2026" && !p.started_at.startsWith("2026-")) return false;
    if (f.period === "2025" && !p.started_at.startsWith("2025-")) return false;
    if (q) {
      const srcText = (p.sources || []).map((s) => `${s.source_name} ${s.excerpt || ""}`).join(" ");
      const hay = normalizeSearch(`${p.title} ${p.facility_name} ${p.summary} ${p.vizig_code} ${srcText}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function filterRegionalNews() {
  const f = state.filters;
  const q = normalizeSearch(f.q.trim());
  return state.bundle.regionalNews.items.filter((item) => {
    if (item.agency_code === "OVF") return false;
    if (f.vizig !== "ALL" && item.agency_code !== f.vizig) return false;
    if (f.newsCat !== "all" && item.category !== f.newsCat) return false;
    if (f.period === "2026" && !item.published_date.startsWith("2026-")) return false;
    if (f.period === "2025" && !item.published_date.startsWith("2025-")) return false;
    if (q) {
      const hay = normalizeSearch(`${item.title} ${item.snippet} ${item.agency_code}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderVizigBanner() {
  const code = state.filters.vizig;
  if (code === "ALL" || !state.vizigMetaByCode.has(code)) {
    dom.vizigBanner.hidden = true;
    if (dom.panelHeader) dom.panelHeader.hidden = false;
    return;
  }
  const meta = state.vizigMetaByCode.get(code);
  dom.vizigBannerCode.textContent = meta.vizig_code;
  dom.vizigBannerName.textContent = meta.name;
  dom.vizigBannerMeta.textContent = `Székhely: ${meta.headquarters}`;
  dom.vizigBannerCounts.textContent = `${meta.curated_event_count} beavatkozás · ${meta.regional_news_count} területi hír`;
  const portalUrl = safeHttpUrl(meta.website_url);
  if (portalUrl) {
    dom.vizigBannerSite.href = portalUrl;
    dom.vizigBannerSite.hidden = false;
  } else {
    dom.vizigBannerSite.hidden = true;
  }
  if (dom.panelHeader) dom.panelHeader.hidden = true;
  dom.vizigBanner.hidden = false;
}

function renderEventsList(features) {
  dom.eventsList.replaceChildren();
  dom.tabEventsCount.textContent = String(features.length);

  if (features.length === 0) {
    const msg =
      state.filters.vizig === "ADUVIZIG"
        ? "Az ADUVIZIG nyilvános portálján a 2025–2026-os időszakban nem szerepelt konkrét vízvisszatartási akció."
        : "A megadott szűrőkkel nincs megjeleníthető térképi beavatkozás.";
    dom.eventsList.append(el("div", "empty-state", msg));
    return;
  }

  const frag = document.createDocumentFragment();
  for (const feat of features) {
    const p = feat.properties;
    const card = el("button", "feed-card");
    card.type = "button";
    card.addEventListener("click", () => selectEvent(p.event_id, true));

    const overline = el("div", "card-overline", `${formatDateHu(p.started_at)} · ${p.vizig_code}`);
    const title = el("h3", "card-title", p.facility_name);

    const line = el("div", "card-line");
    const typeSpan = el("span", "card-type", EVENT_TYPE_LABELS[p.event_type] || p.event_type);
    const chipColor = TYPE_COLOR_VARS[p.event_type];
    if (chipColor) {
      typeSpan.style.setProperty("--chip-color", chipColor);
    }
    line.append(typeSpan);

    if (p.canonical_volume_m3 !== null && p.canonical_volume_m3 !== undefined) {
      line.append(el("span", "card-volume", formatVolumeM3(p.canonical_volume_m3)));
    }

    card.append(overline, title, line);
    frag.append(card);
  }
  dom.eventsList.append(frag);
}

function buildNewsCard(item) {
  const card = el("article", "news-card");

  const overline = el(
    "div",
    "card-overline",
    `${formatDateHu(item.published_date)} · ${item.agency_code} · ${NEWS_CATEGORY_LABELS[item.category] || item.category}`,
  );
  const title = el("h3", "card-title", item.title);
  card.append(overline, title);

  if (item.snippet) {
    card.append(el("p", "news-snippet", item.snippet));
  }

  const dest = safeHttpUrl(item.url);
  if (dest) {
    const link = el("a", "news-ext-link", "Eredeti közlemény");
    link.href = dest;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    card.append(link);
  }

  return card;
}

function renderRegionalNewsList(items) {
  dom.newsList.replaceChildren();
  dom.tabNewsCount.textContent = String(items.length);

  if (items.length === 0) {
    dom.newsList.append(
      el("div", "empty-state", "A választott szűrőkkel nem található területi háttérhír."),
    );
    return;
  }

  const frag = document.createDocumentFragment();
  for (const item of items) {
    frag.append(buildNewsCard(item));
  }
  dom.newsList.append(frag);
}

function renderOvfNewsModal() {
  const cat = dom.ovfCatFilter.value;
  const items = state.bundle.regionalNews.items.filter(
    (item) => item.agency_code === "OVF" && (cat === "all" || item.category === cat),
  );
  dom.ovfNewsList.replaceChildren();
  if (items.length === 0) {
    dom.ovfNewsList.append(el("div", "empty-state", "Nincs OVF hír ebben a kategóriában."));
    return;
  }
  const frag = document.createDocumentFragment();
  for (const item of items) {
    frag.append(buildNewsCard(item));
  }
  dom.ovfNewsList.append(frag);
}

function renderDossier(feature) {
  const p = feature.properties;
  dom.dossierContent.replaceChildren();

  const overline = el(
    "p",
    "dossier-overline",
    `${p.vizig_code} · ${EVENT_TYPE_LABELS[p.event_type] || p.event_type} · ${STATUS_LABELS[p.status] || p.status}`,
  );
  const title = el("h2", "dossier-title", p.facility_name);
  const subtitle = el("p", "dossier-sub", p.title);

  const metrics = el("div", "dossier-metrics");
  const addMetric = (label, value) => {
    const box = el("div", "metric");
    box.append(el("span", "metric-label", label), el("span", "metric-value", value));
    metrics.append(box);
  };
  const dateText = p.ended_at
    ? `${formatDateHu(p.started_at)} – ${formatDateHu(p.ended_at)}`
    : formatDateHu(p.started_at);
  addMetric("Időpont", dateText);
  addMetric("Közölt víztérfogat", formatVolumeM3(p.canonical_volume_m3));
  addMetric("Poligon kiterjedése", formatAreaHa(p.surface_area_ha));
  addMetric("Hitelességi szint", TRUST_LABELS[p.highest_trust_level] || p.highest_trust_level);

  const summary = el("p", "dossier-summary", p.summary);

  const srcHeading = el(
    "h3",
    "sources-heading",
    `Összegyűjtött források (${p.sources.length})`,
  );

  dom.dossierContent.append(overline, title, subtitle, metrics, summary, srcHeading);

  const listWrap = el("div", "card-stack");
  for (const src of p.sources) {
    const card = el("article", "source-card");
    const typeLabel = SOURCE_TYPE_LABELS[src.source_type] || "Forrás";
    card.append(
      el("div", "source-overline", `${typeLabel} · ${formatDateHu(src.published_at)}`),
      el("div", "source-name", src.source_name),
    );

    if (
      src.reported_volume_m3 !== null &&
      src.reported_volume_m3 !== undefined &&
      p.canonical_volume_m3 !== null &&
      Number(src.reported_volume_m3) !== Number(p.canonical_volume_m3)
    ) {
      card.append(
        el(
          "span",
          "source-diff-note",
          `Ebben a forrásban közölt rész/eltérő szám: ${formatVolumeM3(src.reported_volume_m3)}`,
        ),
      );
    }

    if (src.excerpt) {
      card.append(el("p", "source-excerpt", src.excerpt));
    }

    const safeUrl = safeHttpUrl(src.source_url);
    if (safeUrl) {
      const a = el("a", "source-link", "Forrás megnyitása");
      a.href = safeUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      card.append(a);
    }
    listWrap.append(card);
  }
  dom.dossierContent.append(listWrap);
}

function selectEvent(eventId, flyMap = true) {
  const feature = state.eventsById.get(eventId);
  if (!feature) return;
  if (dom.filtersPopover?.matches(":popover-open")) {
    dom.filtersPopover.hidePopover();
  }
  state.selectedEventId = eventId;
  setDesktopPanelOpen(true);
  withTransition(() => {
    dom.listTabsView.hidden = true;
    dom.dossierView.hidden = false;
    renderDossier(feature);
    if (dom.panelScroll) dom.panelScroll.scrollTop = 0;
  }, "forward");
  setMobileView("list");
  if (flyMap && mapView) {
    mapView.focusEvent(feature, false);
  }
  syncUrlParams();
  trackAnalytics(`event/${eventId}`, feature.properties.facility_name);
  announce(`Kiválasztott esemény: ${feature.properties.facility_name}`);
}

function closeDossier() {
  state.selectedEventId = null;
  withTransition(() => {
    dom.dossierView.hidden = true;
    dom.listTabsView.hidden = false;
    if (dom.panelScroll) dom.panelScroll.scrollTop = 0;
  }, "backward");
  if (mapView) mapView.clearSelection();
  syncUrlParams();
}

function selectVizig(vizigCode, zoomMap = true) {
  const normalized = vizigCode && vizigCode !== "ALL" ? vizigCode : "ALL";
  state.filters.vizig = normalized;
  dom.filterVizig.value = normalized;
  if (state.selectedEventId !== null) {
    closeDossier();
  }
  refreshFilteredViews();
  if (mapView) {
    mapView.highlightSelectedVizig(normalized, zoomMap);
  }
  if (normalized !== "ALL") {
    const eventsVisible = filterEvents().length;
    const newsVisible = filterRegionalNews().length;
    if (eventsVisible === 0 && newsVisible > 0) {
      switchTab("news");
    }
    trackAnalytics(`vizig/${normalized}`, normalized);
    announce(`${normalized} kiválasztva: ${eventsVisible} térképi beavatkozás és ${newsVisible} területi hír.`);
  }
}

function countActivePopoverFilters() {
  const f = state.filters;
  let count = 0;
  if (f.vizig !== "ALL") count += 1;
  if (f.trust !== "all") count += 1;
  if (f.period !== "all") count += 1;
  if (f.newsCat !== "all") count += 1;
  return count;
}

function hasActiveFilters() {
  const f = state.filters;
  return countActivePopoverFilters() > 0 || f.type !== "all" || f.q.trim() !== "";
}

function refreshFilteredViews() {
  const filteredEvents = filterEvents();
  const filteredNews = filterRegionalNews();
  const popoverFilterCount = countActivePopoverFilters();
  if (dom.filtersActiveCount) {
    dom.filtersActiveCount.textContent = String(popoverFilterCount);
    dom.filtersActiveCount.hidden = popoverFilterCount === 0;
  }
  dom.resetBtn.hidden = !hasActiveFilters();
  if (dom.mobileListCount) {
    dom.mobileListCount.textContent = String(filteredEvents.length + filteredNews.length);
  }
  renderVizigBanner();
  renderEventsList(filteredEvents);
  renderRegionalNewsList(filteredNews);
  if (mapView) {
    mapView.renderFilteredEvents(filteredEvents);
  }
  syncUrlParams();
}

function resetAllFilters() {
  state.filters = {
    vizig: "ALL",
    type: "all",
    trust: "all",
    period: "all",
    newsCat: "all",
    q: "",
  };
  dom.filterVizig.value = "ALL";
  syncTypeChips();
  dom.filterTrust.value = "all";
  dom.filterPeriod.value = "all";
  dom.filterNewsCat.value = "all";
  dom.searchInput.value = "";
  if (state.selectedEventId !== null) {
    closeDossier();
  }
  refreshFilteredViews();
  if (mapView) mapView.highlightSelectedVizig("ALL", true);
}

function setupTabsAccessibility() {
  const tabs = [dom.tabEvents, dom.tabNews];
  dom.tabEvents.addEventListener("click", () => switchTab("events"));
  dom.tabNews.addEventListener("click", () => switchTab("news"));

  // Progressive keyboard arrow fallback when focusgroup is unsupported (Firefox / Safari).
  if (!Object.hasOwn(HTMLElement.prototype, "focusGroup")) {
    for (const [idx, tab] of tabs.entries()) {
      tab.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const nextIdx = (idx + 1) % tabs.length;
          tabs[nextIdx].focus();
          switchTab(nextIdx === 0 ? "events" : "news");
        }
      });
    }
  }

  dom.panelEvents.addEventListener("beforematch", () => switchTab("events"));
  dom.panelNews.addEventListener("beforematch", () => switchTab("news"));
}

async function init() {
  setupDialogEnhancements();
  setupTabsAccessibility();

  const bundle = await client.loadInitialBundle();
  state.bundle = bundle;

  if (dom.metaLastUpdated && bundle.stats?.last_updated) {
    dom.metaLastUpdated.setAttribute("datetime", bundle.stats.last_updated);
    dom.metaLastUpdated.textContent = `${bundle.stats.last_updated.replaceAll("-", ".")}.`;
  }
  dom.authorProfileLink?.addEventListener("click", () => {
    trackAnalytics("author/linkedin", "Deák Tamás LinkedIn");
  });
  dom.contactReportLink?.addEventListener("click", () => {
    trackAnalytics("author/contact", "Hiányzó helyszín jelzése");
  });

  for (const feat of bundle.vizig.features) {
    state.vizigMetaByCode.set(feat.properties.vizig_code, feat.properties);
  }
  for (const feat of bundle.eventsPoints.features) {
    state.eventsById.set(feat.properties.event_id, feat);
  }

  mapView = new MapView("map", {
    onSelectEvent: (eventId) => selectEvent(eventId, true),
    onSelectVizig: (vizigCode) => selectVizig(vizigCode, true),
  });
  mapView.setVizigData(bundle.vizig);
  mapView.setRiversData(bundle.rivers, dom.toggleRivers.checked);
  mapView.setEventsPolygons(bundle.eventsPolygons);

  // Wire filters (changing a non-VIZIG filter exits an open dossier so the user sees results immediately)
  const applyNonVizigFilterChange = () => {
    if (state.selectedEventId !== null) {
      closeDossier();
    }
    refreshFilteredViews();
  };

  dom.searchInput.addEventListener("input", () => {
    state.filters.q = dom.searchInput.value;
    applyNonVizigFilterChange();
  });
  for (const chip of dom.typeChips) {
    chip.addEventListener("click", () => {
      state.filters.type = chip.dataset.type || "all";
      syncTypeChips();
      if (dom.typePopover?.matches(":popover-open")) {
        dom.typePopover.hidePopover();
      }
      applyNonVizigFilterChange();
    });
  }
  dom.filterVizig.addEventListener("change", () => selectVizig(dom.filterVizig.value, true));
  dom.filterTrust.addEventListener("change", () => {
    state.filters.trust = dom.filterTrust.value;
    applyNonVizigFilterChange();
  });
  dom.filterPeriod.addEventListener("change", () => {
    state.filters.period = dom.filterPeriod.value;
    applyNonVizigFilterChange();
  });
  dom.filterNewsCat.addEventListener("change", () => {
    state.filters.newsCat = dom.filterNewsCat.value;
    if (state.selectedEventId !== null) {
      closeDossier();
    }
    if (state.activeTab !== "news") {
      switchTab("news");
    }
    refreshFilteredViews();
  });
  dom.resetBtn.addEventListener("click", resetAllFilters);
  dom.vizigClearBtn.addEventListener("click", () => selectVizig("ALL", true));

  // Panel collapse (desktop) & bottom sheet handle (mobile)
  if (dom.panelToggle && dom.sidePanel) {
    dom.panelToggle.addEventListener("click", () => {
      const open = dom.sidePanel.dataset.state !== "open";
      setDesktopPanelOpen(open);
    });
    dom.sidePanel.addEventListener("transitionend", (e) => {
      if (e.target === dom.sidePanel && mapView) {
        mapView.invalidateSize();
      }
    });
  }
  if (dom.sheetHandle && dom.sidePanel) {
    dom.sheetHandle.addEventListener("click", () => {
      const isFull = dom.sidePanel.dataset.sheet === "full";
      setMobileView(isFull ? "map" : "list");
    });
  }

  // Dossier actions
  dom.dossierBackBtn.addEventListener("click", closeDossier);

  // Map overlay controls
  for (const btn of dom.basemapBtns) {
    btn.addEventListener("click", () => {
      setBasemapUi(btn.dataset.basemap);
      mapView.setBasemap(btn.dataset.basemap);
    });
  }
  dom.toggleVizig.addEventListener("change", () =>
    mapView.toggleOverlayLayer("vizig", dom.toggleVizig.checked),
  );
  dom.toggleRivers.addEventListener("change", () =>
    mapView.toggleOverlayLayer("rivers", dom.toggleRivers.checked),
  );
  dom.toggleRef.addEventListener("change", async () => {
    const checked = dom.toggleRef.checked;
    const refData = checked ? await client.loadReferenceFacilities() : null;
    mapView.setReferenceLayer(refData, checked);
  });

  if (dom.layersPopover && dom.layersToggle) {
    dom.layersPopover.addEventListener("toggle", (e) => {
      dom.layersToggle.setAttribute("aria-expanded", e.newState === "open" ? "true" : "false");
    });
    dom.layersCloseBtn?.addEventListener("click", () => {
      queueMicrotask(() => dom.layersToggle.focus());
    });
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        !dom.ovfDialog?.open &&
        dom.layersPopover.matches(":popover-open")
      ) {
        const focusInside = dom.layersPopover.contains(document.activeElement);
        dom.layersPopover.hidePopover();
        if (focusInside) {
          dom.layersToggle.focus();
        }
      }
    });
  }

  dom.ovfCatFilter.addEventListener("change", renderOvfNewsModal);
  dom.ovfDialog.addEventListener("close", () => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("ovf")) {
      url.searchParams.delete("ovf");
      history.replaceState(null, "", url);
    }
  });
  window.addEventListener("resize", () => {
    if (mapView) {
      requestAnimationFrame(() => mapView.invalidateSize());
    }
  });
  renderOvfNewsModal();

  // Apply initial URL deep-link params
  const params = new URLSearchParams(window.location.search);
  const initVizig = params.get("vizig");
  const initTab = params.get("tab");
  const initEvent = params.get("event");
  const initOvf = params.get("ovf");

  if (initVizig && state.vizigMetaByCode.has(initVizig.toUpperCase())) {
    state.filters.vizig = initVizig.toUpperCase();
    dom.filterVizig.value = state.filters.vizig;
    mapView.highlightSelectedVizig(state.filters.vizig, !initEvent);
  }
  refreshFilteredViews();

  if (initTab === "news") {
    switchTab("news");
  }
  if (initEvent && state.eventsById.has(initEvent)) {
    selectEvent(initEvent, true);
  } else if (!initVizig) {
    mapView.highlightSelectedVizig("ALL", true);
  }
  if (initOvf === "1" && !dom.ovfDialog.open) {
    dom.ovfDialog.showModal();
  }
}

init().catch((err) => {
  console.error(err);
  dom.eventsList.replaceChildren(
    el("div", "empty-state", `Hiba történt az adatok betöltésekor: ${err.message}`),
  );
});
