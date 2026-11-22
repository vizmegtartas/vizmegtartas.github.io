/**
 * Dual-mode data loader: reads Flask live endpoints (/api/*) or Phase 3 static files (./data/*).
 */

async function fetchJson(url) {
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) {
    throw new Error(`Adatbetöltési hiba (${resp.status}): ${url}`);
  }
  return resp.json();
}

export class DataClient {
  constructor(mode = "api") {
    this.mode = mode === "static" ? "static" : "api";
    this._refCache = null;
  }

  _path(apiPath, staticPath) {
    return this.mode === "static" ? staticPath : apiPath;
  }

  async loadInitialBundle() {
    const [stats, vizig, rivers, eventsPoints, eventsPolygons, regionalNews] = await Promise.all([
      fetchJson(this._path("/api/stats", "./data/stats.json")),
      fetchJson(this._path("/api/vizig.geojson", "./data/vizig.geojson")),
      fetchJson(this._path("/api/rivers.geojson", "./data/rivers.geojson")),
      fetchJson(this._path("/api/events/points.geojson", "./data/events_points.geojson")),
      fetchJson(this._path("/api/events/polygons.geojson", "./data/events_polygons.geojson")),
      fetchJson(this._path("/api/regional-news", "./data/regional_news.json")),
    ]);
    return { stats, vizig, rivers, eventsPoints, eventsPolygons, regionalNews };
  }

  async loadReferenceFacilities() {
    if (!this._refCache) {
      this._refCache = await fetchJson(
        this._path("/api/facilities/reference.geojson", "./data/facilities_ref.geojson"),
      );
    }
    return this._refCache;
  }
}
