/**
 * Safe DOM builders, Hungarian formatting labels, and progressive enhancement fallbacks
 * guided by modern-web-guidance (dialog, validate-input-after-interaction, sanitize-untrusted-html).
 */

export const EVENT_TYPE_LABELS = {
  emergency_opening: "Árapasztó tározó nyitása",
  reservoir_filling: "Tározó / tó feltöltése",
  landscape_inundation: "Táji elárasztás",
  oxbow_channel_filling: "Holtág / csatorna pótlása",
  sluice_retention: "Medertározás / zsilip",
};

export const STATUS_LABELS = {
  ongoing: "Folyamatban",
  completed: "Befejeződött",
  planned: "Tervezett",
};

export const TRUST_LABELS = {
  official_ovf: "Hivatalos (OVF)",
  official_vizig: "Hivatalos (VIZIG)",
  press: "Sajtóforrás",
  social_media: "Közösségi / videó",
};

export const SOURCE_TYPE_LABELS = {
  official_ovf: "OVF közlemény",
  official_vizig: "VIZIG közlemény",
  press: "Sajtó",
  social_media: "Közösségi média",
  video: "Videó",
};

export const NEWS_CATEGORY_LABELS = {
  regional_update: "Igazgatósági helyzetkép",
  explainer: "Szakmai háttérmagyarázó",
  program_forum: "Programok és projektek",
};

const huIntFmt = new Intl.NumberFormat("hu-HU");
const huAreaFmt = new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 1 });

export function formatVolumeM3(val) {
  if (val === null || val === undefined || val === "") {
    return "Nincs számszerűsítve";
  }
  return `${huIntFmt.format(Number(val))} m³`;
}

export function formatAreaHa(val) {
  if (val === null || val === undefined || val === "") {
    return "Pontszerű helyszín";
  }
  return `${huAreaFmt.format(Number(val))} ha`;
}

export function formatDateHu(isoDate) {
  if (!isoDate) return "";
  return String(isoDate).replaceAll("-", ".") + ".";
}

/**
 * Strip diacritics and lowercase text for accent-insensitive Hungarian search.
 */
export function normalizeSearch(val) {
  return String(val ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Copy text to clipboard with execCommand fallback for non-HTTPS local contexts.
 */
export async function copyTextSafe(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below when Clipboard API permission is denied or unavailable.
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.append(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/**
 * Strictly validate external URLs so only http(s) destinations become clickable links.
 */
export function safeHttpUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(String(rawUrl).trim(), window.location.href);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

/**
 * Progressive-enhancement setup for native <dialog>:
 * - Conditional fallback when Invoker Commands (command/commandfor) are unavailable.
 * - Conditional pointerdown/pointerup backdrop dismiss when closedby="any" is unavailable.
 * - Mandatory returnValue reset on dialog close.
 */
export function setupDialogEnhancements() {
  if (!("commandForElement" in HTMLButtonElement.prototype)) {
    document.querySelectorAll("button[command='show-modal'][commandfor]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = document.getElementById(btn.getAttribute("commandfor"));
        if (target && typeof target.showModal === "function" && !target.open) {
          target.showModal();
        }
      });
    });
  }

  if (!("closedBy" in HTMLDialogElement.prototype)) {
    const outside = (e, dialog) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
      let pressedOutside = false;
      dialog.addEventListener("pointerdown", (e) => {
        pressedOutside = outside(e, dialog);
      });
      dialog.addEventListener("pointerup", (e) => {
        if (pressedOutside && outside(e, dialog)) dialog.close();
      });
    }
  }

  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.addEventListener("close", () => {
      dialog.returnValue = "";
    });
  }
}
