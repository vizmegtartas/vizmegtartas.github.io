/**
 * Leaflet interactive hydrographic map view with clickable VIZIG districts (UX Option A),
 * deterministic map panes, isolated filtered polygons, spiderfied clusters, and Esri satellite view.
 */

import { formatAreaHa, formatDateHu, formatVolumeM3 } from "./uiHelpers.js";
import { HUNGARY_BORDER_GEOJSON } from "./hungaryBorder.js";

export class MapView {
  constructor(containerId, handlers) {
    this.handlers = handlers;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.map = L.map(containerId, {
      center: [47.18, 19.45],
      zoom: 7,
      minZoom: 6,
      maxZoom: 17,
      zoomControl: false,
      attributionControl: false,
    });
    L.control
      .zoom({
        position: "bottomright",
        zoomInTitle: "Nagyítás",
        zoomOutTitle: "Kicsinyítés",
      })
      .addTo(this.map);

    const vizigPane = this.map.createPane("vizigPane");
    vizigPane.style.zIndex = "350";

    const riversPane = this.map.createPane("riversPane");
    riversPane.style.zIndex = "360";
    riversPane.style.pointerEvents = "none";

    const borderPane = this.map.createPane("borderPane");
    borderPane.style.zIndex = "365";
    borderPane.style.pointerEvents = "none";

    const refPane = this.map.createPane("refPane");
    refPane.style.zIndex = "370";

    const eventPolyPane = this.map.createPane("eventPolyPane");
    eventPolyPane.style.zIndex = "380";

    this.baseLayers = {
      map: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "basemap-osm-muted",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> közreműködők',
      }),
      satellite: L.layerGroup([
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 18,
            attribution: "Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics",
          },
        ),
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 18,
            opacity: 0.85,
          },
        ),
      ]),
    };
    this.activeBasemap = "map";
    this.baseLayers.map.addTo(this.map);

    this.vizigLayer = null;
    this.riversLayer = null;
    this.borderLayer = L.layerGroup([
      L.geoJSON(HUNGARY_BORDER_GEOJSON, {
        pane: "borderPane",
        interactive: false,
        style: {
          color: "#FFFFFF",
          weight: 6.5,
          opacity: 0.82,
          fill: false,
        },
      }),
      L.geoJSON(HUNGARY_BORDER_GEOJSON, {
        pane: "borderPane",
        interactive: false,
        style: {
          color: "#9F1239",
          weight: 3,
          opacity: 0.92,
          fill: false,
        },
      }),
    ]).addTo(this.map);
    this.refLayer = null;
    this.eventsPolyLayer = L.layerGroup().addTo(this.map);
    this.clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 34,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    this.map.addLayer(this.clusterGroup);

    this.markerByEventId = new Map();
    this.polyEntryByEventId = new Map();
    this.vizigLayerByCode = new Map();
    this.visibleEventIds = new Set();
    this.selectedEventId = null;
    this.selectedVizigCode = "ALL";

    this.clusterGroup.on("animationend spiderfied unspiderfied", () =>
      this._syncSelectedMarkerClass(),
    );
    this.map.on("zoomend moveend", () => this._syncSelectedMarkerClass());
  }

  setBasemap(name) {
    const next = name === "satellite" ? "satellite" : "map";
    if (next === this.activeBasemap) return;
    this.map.removeLayer(this.baseLayers[this.activeBasemap]);
    this.baseLayers[next].addTo(this.map);
    this.activeBasemap = next;
  }

  setVizigData(geojson) {
    if (this.vizigLayer) this.map.removeLayer(this.vizigLayer);
    this.vizigLayerByCode.clear();

    this.vizigLayer = L.geoJSON(geojson, {
      pane: "vizigPane",
      style: (feature) => this._vizigStyle(feature.properties.vizig_code, false),
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        this.vizigLayerByCode.set(p.vizig_code, layer);
        layer.bindTooltip(
          `${p.vizig_code} — ${p.curated_event_count} beavatkozás · ${p.regional_news_count} hír`,
          { sticky: true },
        );
        layer.on({
          mouseover: () => {
            if (p.vizig_code !== this.selectedVizigCode) {
              layer.setStyle(this._vizigStyle(p.vizig_code, true));
            }
          },
          mouseout: () => {
            layer.setStyle(this._vizigStyle(p.vizig_code, false));
            if (
              this.selectedVizigCode !== "ALL" &&
              this.vizigLayerByCode.has(this.selectedVizigCode)
            ) {
              this.vizigLayerByCode.get(this.selectedVizigCode).bringToFront();
            }
          },
          click: () => {
            this.handlers.onSelectVizig(p.vizig_code);
          },
        });
      },
    }).addTo(this.map);
  }

  _vizigStyle(code, hovered) {
    const isSelected = code === this.selectedVizigCode;
    return {
      color: isSelected ? "#D97706" : hovered ? "#0B5D7A" : "#64748B",
      weight: isSelected ? 3.8 : hovered ? 2.5 : 1.4,
      dashArray: isSelected || hovered ? null : "5 4",
      fillColor: isSelected ? "#F59E0B" : hovered ? "#0B5D7A" : "#94A3B8",
      fillOpacity: isSelected ? 0.14 : hovered ? 0.07 : 0.02,
    };
  }

  _viewPadding() {
    if (window.matchMedia("(min-width: 768px)").matches) {
      const panel = document.getElementById("side-panel");
      const isOpen = panel && panel.dataset.state !== "closed";
      const leftPad = isOpen ? Math.round(panel.getBoundingClientRect().right + 24) : 24;
      return { paddingTopLeft: [leftPad, 72], paddingBottomRight: [24, 24] };
    }
    return { paddingTopLeft: [16, 120], paddingBottomRight: [16, 80] };
  }

  _offsetLatLng(latlng, zoom) {
    if (window.matchMedia("(min-width: 768px)").matches) {
      const panel = document.getElementById("side-panel");
      const isOpen = panel && panel.dataset.state !== "closed";
      if (!isOpen) return latlng;
      const offsetX = panel.getBoundingClientRect().right / 2;
      return this.map.unproject(this.map.project(latlng, zoom).subtract([offsetX, 0]), zoom);
    }
    return this.map.unproject(this.map.project(latlng, zoom).add([0, 40]), zoom);
  }

  highlightSelectedVizig(vizigCode, zoomToDistrict = false) {
    this.selectedVizigCode = vizigCode || "ALL";
    for (const [code, layer] of this.vizigLayerByCode.entries()) {
      layer.setStyle(this._vizigStyle(code, false));
    }
    if (this.selectedVizigCode !== "ALL" && this.vizigLayerByCode.has(this.selectedVizigCode)) {
      this.vizigLayerByCode.get(this.selectedVizigCode).bringToFront();
    }
    if (zoomToDistrict) {
      this.map.stop();
      const pad = this._viewPadding();
      if (this.selectedVizigCode !== "ALL" && this.vizigLayerByCode.has(this.selectedVizigCode)) {
        const bounds = this.vizigLayerByCode.get(this.selectedVizigCode).getBounds();
        this.map.flyToBounds(bounds.pad(0.08), {
          ...pad,
          animate: !this.reducedMotion,
          duration: 0.65,
        });
      } else if (this.vizigLayer) {
        this.map.flyToBounds(this.vizigLayer.getBounds(), {
          ...pad,
          animate: !this.reducedMotion,
          duration: 0.6,
        });
      } else {
        this.map.flyTo([47.18, 19.45], 7, { animate: !this.reducedMotion, duration: 0.6 });
      }
    }
  }

  setRiversData(geojson) {
    if (this.riversLayer) this.map.removeLayer(this.riversLayer);
    this.riversLayer = L.geoJSON(geojson, {
      pane: "riversPane",
      interactive: false,
      style: {
        color: "#0284C7",
        weight: 2.0,
        opacity: 0.85,
      },
    }).addTo(this.map);
  }

  setEventsPolygons(geojson) {
    this.eventsPolyLayer.clearLayers();
    this.polyEntryByEventId.clear();

    for (const feature of geojson.features) {
      const p = feature.properties;
      const polyGroup = L.geoJSON(feature, {
        pane: "eventPolyPane",
        style: () => this._eventPolyStyle(p),
        onEachFeature: (_f, sublayer) => {
          sublayer.bindTooltip(
            `${p.facility_name} — ${formatDateHu(p.started_at)} (${formatAreaHa(p.surface_area_ha)})`,
          );
          sublayer.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            this.handlers.onSelectEvent(p.event_id);
          });
        },
      });
      this.polyEntryByEventId.set(p.event_id, { layer: polyGroup, props: p });
    }
  }

  _eventPolyStyle(props) {
    const isSel = props.event_id === this.selectedEventId;
    const isEmergency = props.event_type === "emergency_opening";
    return {
      color: isSel ? "#102430" : isEmergency ? "#C2410C" : "#0369A1",
      weight: isSel ? 3.8 : 2.4,
      fillColor: isEmergency ? "#F97316" : "#0284C7",
      fillOpacity: isSel ? 0.5 : 0.34,
    };
  }

  _syncSelectedMarkerClass() {
    for (const [id, marker] of this.markerByEventId.entries()) {
      const iconEl = marker.getElement()?.querySelector(".event-marker");
      if (iconEl) iconEl.classList.toggle("is-selected", id === this.selectedEventId);
    }
  }

  renderFilteredEvents(features) {
    this.clusterGroup.clearLayers();
    this.markerByEventId.clear();
    this.eventsPolyLayer.clearLayers();

    this.visibleEventIds = new Set(features.map((f) => f.properties.event_id));
    for (const evId of this.visibleEventIds) {
      const entry = this.polyEntryByEventId.get(evId);
      if (entry) {
        entry.layer.setStyle(this._eventPolyStyle(entry.props));
        this.eventsPolyLayer.addLayer(entry.layer);
      }
    }

    const markers = [];
    for (const feat of features) {
      const p = feat.properties;
      const [lon, lat] = feat.geometry.coordinates;
      const isSelected = p.event_id === this.selectedEventId;
      const icon = L.divIcon({
        className: "event-marker-wrapper",
        html: `<div class="event-marker event-marker-${p.event_type}${isSelected ? " is-selected" : ""}"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const marker = L.marker([lat, lon], { icon, title: p.title });
      marker.bindTooltip(
        `${p.facility_name} (${p.vizig_code}) — ${formatDateHu(p.started_at)} · ${formatVolumeM3(p.canonical_volume_m3)}`,
      );
      marker.on("click", () => this.handlers.onSelectEvent(p.event_id));
      this.markerByEventId.set(p.event_id, marker);
      markers.push(marker);
    }
    this.clusterGroup.addLayers(markers);
    this._syncSelectedMarkerClass();
  }

  setReferenceLayer(geojson, visible) {
    if (!this.refLayer && geojson) {
      this.refLayer = L.geoJSON(geojson, {
        pane: "refPane",
        style: {
          color: "#4E7969",
          weight: 1.2,
          dashArray: "3 3",
          fillColor: "#6B9F8B",
          fillOpacity: 0.14,
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          layer.bindPopup(
            `<strong>${this._escapeText(p.name)}</strong><br>` +
              `<span>${this._escapeText(p.vizig_code)} · ${this._escapeText(formatAreaHa(p.surface_area_ha))}</span><br>` +
              `<small>Referencia tározó/holtág — még rögzített beavatkozás nélkül</small>`,
          );
          layer.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
          });
        },
      });
    }
    if (!this.refLayer) return;
    if (visible && !this.map.hasLayer(this.refLayer)) {
      this.refLayer.addTo(this.map);
    } else if (!visible && this.map.hasLayer(this.refLayer)) {
      this.map.removeLayer(this.refLayer);
    }
  }

  _escapeText(val) {
    const d = document.createElement("div");
    d.textContent = String(val ?? "");
    return d.innerHTML;
  }

  toggleOverlayLayer(name, visible) {
    const layer = name === "vizig" ? this.vizigLayer : this.riversLayer;
    if (!layer) return;
    if (visible && !this.map.hasLayer(layer)) {
      layer.addTo(this.map);
    } else if (!visible && this.map.hasLayer(layer)) {
      this.map.removeLayer(layer);
    }
  }

  focusEvent(feature, useSatellite = false) {
    const evId = feature.properties.event_id;
    this.selectedEventId = evId;
    if (useSatellite) {
      this.setBasemap("satellite");
    }
    this.map.stop();

    for (const id of this.visibleEventIds) {
      const entry = this.polyEntryByEventId.get(id);
      if (entry) {
        entry.layer.setStyle(this._eventPolyStyle(entry.props));
        if (id === evId) entry.layer.bringToFront();
      }
    }
    this._syncSelectedMarkerClass();

    const polyEntry = this.visibleEventIds.has(evId) ? this.polyEntryByEventId.get(evId) : null;
    if (polyEntry) {
      this.map.flyToBounds(polyEntry.layer.getBounds(), {
        ...this._viewPadding(),
        maxZoom: 15,
        animate: !this.reducedMotion,
        duration: 0.65,
      });
      return;
    }

    const marker = this.markerByEventId.get(evId);
    const targetZoom = useSatellite ? 15 : 13;
    if (marker) {
      const parent = this.clusterGroup.getVisibleParent(marker);
      if (parent && parent !== marker) {
        this.clusterGroup.zoomToShowLayer(marker, () => {
          const z = Math.max(this.map.getZoom(), targetZoom);
          const center = this._offsetLatLng(marker.getLatLng(), z);
          this.map.setView(center, z, { animate: !this.reducedMotion });
          this._syncSelectedMarkerClass();
        });
        return;
      }
    }

    const [lon, lat] = feature.geometry.coordinates;
    const center = this._offsetLatLng(L.latLng(lat, lon), targetZoom);
    this.map.flyTo(center, targetZoom, {
      animate: !this.reducedMotion,
      duration: 0.65,
    });
  }

  clearSelection() {
    this.selectedEventId = null;
    for (const evId of this.visibleEventIds) {
      const entry = this.polyEntryByEventId.get(evId);
      if (entry) {
        entry.layer.setStyle(this._eventPolyStyle(entry.props));
      }
    }
    this._syncSelectedMarkerClass();
  }

  invalidateSize() {
    this.map.invalidateSize();
  }
}
