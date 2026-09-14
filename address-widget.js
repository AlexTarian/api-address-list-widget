const addresses = [];

let editingIndex = null;
let initialized = false;
let prefillLoaded = false;
let initialAddresses = [];
let housingType = "Employer-owned";
let addressSearchTimer = null;
let activeSearchController = null;
let activeSuggestionIndex = -1;
let selectedLookup = null;
let selectedMapCenter = null;

const MODES = {
  housing: {
    title: "Housing Locations",
    singular: "Housing Location",
    plural: "Housing Locations",
    addLabel: "+ Add Housing",
    listLabel: "Housing Locations",
    emptyLabel: "No housing locations added yet.",
    addModalTitle: "Add Housing Location",
    editModalTitle: "Edit Housing Location"
  },

  worksite: {
    title: "Worksites",
    singular: "Worksite",
    plural: "Worksites",
    addLabel: "+ Add Worksite",
    listLabel: "Worksites",
    emptyLabel: "No worksites added yet.",
    addModalTitle: "Add Worksite",
    editModalTitle: "Edit Worksite"
  }
};

const fields = {
  widgetRoot: document.getElementById("widgetRoot"),
  widgetTitle: document.getElementById("widgetTitle"),

  startSection: document.getElementById("startSection"),
  reuseAddressesBtn: document.getElementById("reuseAddressesBtn"),
  newAddressListBtn: document.getElementById("newAddressListBtn"),
  startError: document.getElementById("startError"),

  listSection: document.getElementById("addressListSection"),
  listHeading: document.getElementById("listHeading"),
  addressCount: document.getElementById("addressCount"),
  addressList: document.getElementById("addressList"),
  addAddressBtn: document.getElementById("addAddressBtn"),

  addressModal: document.getElementById("addressModal"),
  modalCard: document.querySelector("#addressModal .modal-card"),
  modalTitle: document.getElementById("modalTitle"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  cancelModalBtn: document.getElementById("cancelModalBtn"),
  saveAddressBtn: document.getElementById("saveAddressBtn"),
  saveAnotherBtn: document.getElementById("saveAnotherBtn"),

  addressSearch: document.getElementById("addressSearch"),
  addressSuggestions: document.getElementById("addressSuggestions"),
  addressSearchRow: document.getElementById("addressSearchRow"),

  dropPinBtn: document.getElementById("dropPinBtn"),
  pinHelpText: document.getElementById("pinHelpText"),

  nickname: document.getElementById("nickname"),
  street1: document.getElementById("street1"),
  street2: document.getElementById("street2"),
  street2Wrap: document.getElementById("street2Wrap"),
  city: document.getElementById("city"),
  state: document.getElementById("state"),
  zip: document.getElementById("zip"),
  county: document.getElementById("county"),

  housingFields: document.getElementById("housingFields"),
  housingTypeSelect: document.getElementById("housingType"),
  units: document.getElementById("units"),
  occupancy: document.getElementById("occupancy"),

  worksiteFields: document.getElementById("worksiteFields"),
  ownedByEmployer: document.getElementById("ownedByEmployer"),
  ownedByWrap: document.getElementById("ownedByWrap"),
  ownedBy: document.getElementById("ownedBy"),
  startDate: document.getElementById("startDate"),
  endDate: document.getElementById("endDate"),
  workers: document.getElementById("workers"),

  formError: document.getElementById("formError"),
  globalError: document.getElementById("globalError")
};

function clean_(value) {
  return String(value ?? "").trim();
}

function getSetting_(name) {
  try {
    return clean_(JFCustomWidget.getWidgetSetting(name));
  } catch (err) {
    console.warn(`Could not read setting ${name}:`, err);
    return "";
  }
}

function getMode() {
  return getSetting_("addressType").toLowerCase() === "housing" ? "housing" : "worksite";
}

function hideAddressSuggestions() {
  fields.addressSuggestions.hidden = true;
  fields.addressSuggestions.innerHTML = "";
  fields.addressSearch.setAttribute("aria-expanded", "false");
  activeSuggestionIndex = -1;
}

async function searchAddresses(query) {
  const apiKey = getSetting_("geoapifyApiKey");

  if (!apiKey || query.length < 5) {
    hideAddressSuggestions();
    return;
  }

  if (activeSearchController) {
    activeSearchController.abort();
  }

  activeSearchController = new AbortController();

  try {
    const params = new URLSearchParams({
      text: query,
      format: "json",
      filter: "countrycode:us",
      lang: "en",
      limit: "6",
      apiKey
    });

    const response = await fetch(
      `https://api.geoapify.com/v1/geocode/autocomplete?${params.toString()}`,
      {
        method: "GET",
        signal: activeSearchController.signal
      }
    );

    if (!response.ok) {
      throw new Error(`Address lookup returned HTTP ${response.status}`);
    }

    const data = await response.json();

    renderAddressSuggestions(
      Array.isArray(data.results)
        ? data.results
        : []
    );
  } catch (err) {
    if (err.name === "AbortError") {
      return;
    }

    console.warn("Address lookup failed:", err);
    hideAddressSuggestions();
  }
}

function renderAddressSuggestions(results) {
  fields.addressSuggestions.innerHTML = "";
  activeSuggestionIndex = -1;

  if (!results.length) {
    hideAddressSuggestions();
    return;
  }

  results.forEach((result, index) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "address-suggestion";
    button.setAttribute("role", "option");
    button.dataset.index = String(index);

    const primary =
      result.address_line1 ||
      result.formatted ||
      "Address";

    const secondary = [
      result.city || result.town || result.village || "",
      result.state_code || "",
      result.postcode || ""
    ]
      .filter(Boolean)
      .join(", ");

    button.innerHTML = `
      <span class="address-suggestion-primary">
        ${escapeHtml(primary)}
      </span>

      ${
        secondary
          ? `<span class="address-suggestion-secondary">${escapeHtml(secondary)}</span>`
          : ""
      }
    `;

    button.addEventListener("click", () => {
      applyAddressResult(result);
    });

    fields.addressSuggestions.appendChild(button);
  });

  fields.addressSuggestions.hidden = false;
  fields.addressSearch.setAttribute("aria-expanded", "true");
}

function applyAddressResult(result) {
  const lat = Number.isFinite(Number(result.lat))
    ? Number(result.lat)
    : null;

  const lon = Number.isFinite(Number(result.lon))
    ? Number(result.lon)
    : null;

  selectedLookup = lat !== null && lon !== null
    ? { lat, lon }
    : null;

  selectedMapCenter = lat !== null && lon !== null
    ? {
        lat,
        lon,
        label:
          result.formatted ||
          result.city ||
          result.town ||
          result.village ||
          ""
      }
    : null;

  fields.street1.value =
    result.address_line1 ||
    "";

  fields.city.value =
    result.city ||
    result.town ||
    result.village ||
    result.hamlet ||
    "";

  fields.state.value =
    clean_(result.state_code).toUpperCase();

  fields.zip.value =
    result.postcode ||
    "";

  fields.county.value =
    normalizeLookupCounty(result);

  fields.addressSearch.value =
    result.formatted ||
    result.address_line1 ||
    "";

  updateDropPinState();
  hideAddressSuggestions();
  fields.formError.textContent = "";
}

function normalizeLookupCounty(result) {
  let county = clean_(result.county);

  if (!county) {
    return "";
  }

  county = county.toUpperCase();

  if (
    county.endsWith(" COUNTY") ||
    county.endsWith(" PARISH") ||
    county.endsWith(" BOROUGH") ||
    county.endsWith(" CENSUS AREA") ||
    county.endsWith(" MUNICIPALITY") ||
    county.endsWith(" PLANNING REGION")
  ) {
    return county;
  }

  return `${county} COUNTY`;
}

function handleAddressSearchInput() {
  clearTimeout(addressSearchTimer);

  selectedMapCenter = null;
  updateDropPinState();

  const query = clean_(fields.addressSearch.value);

  if (query.length < 5) {
    hideAddressSuggestions();
    return;
  }

  addressSearchTimer = setTimeout(() => {
    searchAddresses(query);
  }, 400);
}

function updateWidgetHeight() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!fields.addressModal.hidden) {
        updateModalHeight();
        return;
      }

      try {
        const widgetHeight = fields.widgetRoot.getBoundingClientRect().height;

        const bodyStyle = getComputedStyle(document.body);
        const paddingTop = parseFloat(bodyStyle.paddingTop) || 0;
        const paddingBottom = parseFloat(bodyStyle.paddingBottom) || 0;

        JFCustomWidget.requestFrameResize({
          height: Math.ceil(widgetHeight + paddingTop + paddingBottom)
        });
      } catch (err) {
        console.warn("Could not resize widget:", err);
      }
    });
  });
}

function updateModalHeight() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        const modalHeight = fields.modalCard.getBoundingClientRect().height;

        const bodyStyle = getComputedStyle(document.body);
        const paddingTop = parseFloat(bodyStyle.paddingTop) || 0;
        const paddingBottom = parseFloat(bodyStyle.paddingBottom) || 0;

        const requiredHeight = Math.ceil(
          modalHeight +
          paddingTop +
          paddingBottom +
          24
        );

        const currentHeight = Math.ceil(window.innerHeight);

        JFCustomWidget.requestFrameResize({
          height: Math.max(currentHeight, requiredHeight)
        });
      } catch (err) {
        console.warn("Could not resize widget modal:", err);
      }
    });
  });
}

async function getFieldValueById_(fieldId) {
  const cleanFieldId = String(fieldId || "").replace(/\D/g, "");

  if (!cleanFieldId || typeof JFCustomWidget.getFieldsValueById !== "function") {
    return "";
  }

  return await new Promise(resolve => {
    try {
      JFCustomWidget.getFieldsValueById([cleanFieldId], response => {
        const data = Array.isArray(response?.data) ? response.data : [];

        const match = data.find(item =>
          String(item?.selector) === cleanFieldId ||
          String(item?.selector) === `input_${cleanFieldId}` ||
          String(item?.selector).includes(cleanFieldId)
        );

        resolve(String(match?.value ?? data[0]?.value ?? ""));
      });
    } catch (err) {
      console.warn("Could not read field by ID:", err);
      resolve("");
    }
  });
}

function populateStates() {
  fields.state.innerHTML = '<option value="">State *</option>';

  US_STATES.forEach(state => {
    const option = document.createElement("option");
    option.value = state.code;
    option.textContent = `${state.name} (${state.code})`;
    fields.state.appendChild(option);
  });
}

function configureMode() {
  const mode = getMode();
  const config = MODES[mode];
  const isWorksite = mode === "worksite";

  fields.widgetTitle.textContent = config.title;
  fields.listHeading.textContent = config.listLabel;
  fields.addAddressBtn.textContent = config.addLabel;

  fields.housingFields.hidden = mode !== "housing";
  fields.worksiteFields.hidden = mode !== "worksite";
  fields.street2Wrap.hidden = mode !== "housing";

  fields.dropPinBtn.hidden = !isWorksite;

  if (fields.pinHelpText) {
    fields.pinHelpText.hidden = !isWorksite;
  }
}

function setHousingType(value) {
  housingType = value === "Rented" ? "Rented" : "Employer-owned";
  fields.housingTypeSelect.value = housingType;
}

function toggleOwnedBy() {
  fields.ownedByWrap.hidden = fields.ownedByEmployer.checked;

  if (fields.ownedByEmployer.checked) {
    fields.ownedBy.value = "";
  }

  if (!fields.addressModal.hidden) {
    updateModalHeight();
  }
}

function showStartSection() {
  fields.startSection.hidden = false;
  fields.listSection.hidden = true;
  fields.addressModal.hidden = true;
  updateWidgetHeight();
}

function showAddressList() {
  fields.startSection.hidden = true;
  fields.listSection.hidden = false;
  updateWidgetHeight();
}

async function reusePreviousAddresses() {
  fields.startError.textContent = "";
  fields.globalError.textContent = "";

  const imported = await loadPrefilledAddresses();

  addresses.length = 0;
  addresses.push(...imported);

  initialAddresses = structuredClone(imported);

  showAddressList();
  renderAddresses();

  if (!addresses.length) {
    openAddressModal();
  }
}

function startNewAddressList() {
  addresses.length = 0;
  initialAddresses = [];
  prefillLoaded = true;

  fields.startError.textContent = "";
  fields.globalError.textContent = "";

  showAddressList();
  renderAddresses();
  openAddressModal();
}

function invalidateLookupOnManualEdit() {
  selectedLookup = null;
}

async function loadPrefilledAddresses() {
  if (prefillLoaded) {
    return [];
  }

  prefillLoaded = true;

  const fieldId = getSetting_("prefillFieldId");

  if (!fieldId) {
    return [];
  }

  const raw = await getFieldValueById_(fieldId);
  const cleaned = clean_(raw);

  if (!cleaned) {
    return [];
  }

  try {
    return parsePrefill(cleaned);
  } catch (err) {
    console.warn("Could not parse prefilled addresses:", err);

    fields.globalError.textContent =
      "Some previous addresses could not be loaded. Please create the address list manually.";

    return [];
  }
}

function normalizeCounty(value) {
  return clean_(value);
}

function buildBaseAddress() {
  const existing = editingIndex !== null
    ? addresses[editingIndex]
    : null;

  return {
    nickname: clean_(fields.nickname.value),
    street1: clean_(fields.street1.value),
    street2: clean_(fields.street2.value),
    city: clean_(fields.city.value),
    state: clean_(fields.state.value).toUpperCase(),
    zip: clean_(fields.zip.value),
    county: normalizeCounty(fields.county.value),

    latitude: selectedLookup?.lat ?? existing?.latitude ?? null,
    longitude: selectedLookup?.lon ?? existing?.longitude ?? null,
    source: selectedLookup ? "lookup" : (existing?.source || "manual"),
    isPrimary: existing?.isPrimary ?? false
  };
}

function buildAddressObject() {
  const mode = getMode();
  const base = buildBaseAddress();

  if (mode === "housing") {
    return {
      type: "housing",
      ...base,
      housingType,
      units: fields.units.value === "" ? null : Number(fields.units.value),
      occupancy: fields.occupancy.value === "" ? null : Number(fields.occupancy.value)
    };
  }

  const existing = editingIndex !== null ? addresses[editingIndex] : null;
  const enteredStart = clean_(fields.startDate.value);
  const enteredEnd = clean_(fields.endDate.value);

  return {
    type: "worksite",
    ...base,
    street2: "",
    ownedByEmployer: fields.ownedByEmployer.checked,
    ownedBy: fields.ownedByEmployer.checked ? "" : clean_(fields.ownedBy.value),

    startDate: enteredStart || existing?.startDate || "",
    endDate: enteredEnd || existing?.endDate || "",

    workers: fields.workers.value === "" ? null : Number(fields.workers.value)
  };
}

function validateBase(item) {
  if (!item.street1 || !item.city || !item.state || !item.zip || !item.county) {
    return "Please complete all required address fields.";
  }

  if (!/^\d{5}(?:-\d{4})?$/.test(item.zip)) {
    return "Please enter a valid 5-digit ZIP code or ZIP+4.";
  }

  return "";
}

function validateHousing(item) {
  const baseError = validateBase(item);
  if (baseError) return baseError;

  if (!Number.isInteger(item.units) || item.units < 1) {
    return "Units must be a whole number of at least 1.";
  }

  if (!Number.isInteger(item.occupancy) || item.occupancy < 1) {
    return "Occupancy must be a whole number of at least 1.";
  }

  return "";
}

function validateWorksite(item) {
  const baseError = validateBase(item);
  if (baseError) return baseError;

  if (!item.ownedByEmployer && !item.ownedBy) {
    return "Please enter who owns the worksite.";
  }

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(item.startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.endDate) &&
    item.endDate < item.startDate
  ) {
    return "End date cannot be before start date.";
  }

  if (item.workers !== null && (!Number.isInteger(item.workers) || item.workers < 0)) {
    return "Workers must be a whole number of 0 or more.";
  }

  return "";
}

function validateAddress(item) {
  return item.type === "housing" ? validateHousing(item) : validateWorksite(item);
}

function openAddressModal(index = null) {
  editingIndex = index;
  fields.formError.textContent = "";

  const config = MODES[getMode()];
  const isEdit = index !== null;

  fields.addressSearchRow.hidden = isEdit;
  fields.pinHelpText.hidden = isEdit || getMode() !== "worksite";

  if (!isEdit) {
    clearForm();

    fields.modalTitle.textContent = config.addModalTitle;
    fields.saveAddressBtn.textContent = "Save Address";
    fields.saveAnotherBtn.hidden = false;
  } else {
    hideAddressSuggestions();
    fields.addressSearch.value = "";

    populateAddressForm(addresses[index]);

    fields.modalTitle.textContent = config.editModalTitle;
    fields.saveAddressBtn.textContent = "Save Changes";
    fields.saveAnotherBtn.hidden = true;
  }

  fields.addressModal.hidden = false;
  updateModalHeight();

  requestAnimationFrame(() => {
    fields.street1.focus();
  });
}

function closeAddressModal() {
  fields.addressModal.hidden = true;
  editingIndex = null;
  fields.formError.textContent = "";

  clearForm();
  updateWidgetHeight();
}

function populateAddressForm(item) {
  if (!item) return;

  fields.nickname.value = item.nickname || "";
  fields.street1.value = item.street1 || "";
  fields.street2.value = item.street2 || "";
  fields.city.value = item.city || "";
  fields.state.value = item.state || "";
  fields.zip.value = item.zip || "";
  fields.county.value = item.county || "";

  if (item.type === "housing") {
    setHousingType(item.housingType || "Employer-owned");
    fields.units.value = item.units ?? "";
    fields.occupancy.value = item.occupancy ?? "";
  } else {
    fields.ownedByEmployer.checked = item.ownedByEmployer !== false;
    fields.ownedBy.value = item.ownedBy || "";

    fields.startDate.value =
      /^\d{4}-\d{2}-\d{2}$/.test(item.startDate || "") ? item.startDate : "";

    fields.endDate.value =
      /^\d{4}-\d{2}-\d{2}$/.test(item.endDate || "") ? item.endDate : "";

    fields.workers.value = item.workers ?? "";
    toggleOwnedBy();
  }
}

function clearForm() {
  fields.nickname.value = "";
  fields.street1.value = "";
  fields.street2.value = "";
  fields.city.value = "";
  fields.state.value = "";
  fields.zip.value = "";
  fields.county.value = "";

  fields.units.value = "";
  fields.occupancy.value = "";

  setHousingType("Employer-owned");

  fields.ownedByEmployer.checked = true;
  fields.ownedBy.value = "";
  fields.startDate.value = "";
  fields.endDate.value = "";
  fields.workers.value = "";

  toggleOwnedBy();

  fields.formError.textContent = "";

  fields.addressSearch.value = "";
  hideAddressSuggestions();
  
  selectedLookup = null;
  selectedMapCenter = null;
  updateDropPinState();
}

function saveAddress({ addAnother = false } = {}) {
  const item = buildAddressObject();
  const error = validateAddress(item);

  if (error) {
    fields.formError.textContent = error;
    updateModalHeight();
    return;
  }

  if (editingIndex === null) {
    addresses.push(item);
  } else {
    addresses[editingIndex] = item;
  }

  fields.formError.textContent = "";
  fields.globalError.textContent = "";

  renderAddresses();

  if (addAnother) {
    editingIndex = null;
    clearForm();

    fields.modalTitle.textContent = MODES[getMode()].addModalTitle;
    fields.saveAddressBtn.textContent = "Save Address";
    fields.saveAnotherBtn.hidden = false;

    updateModalHeight();

    requestAnimationFrame(() => {
      fields.street1.focus();
    });

    return;
  }

  closeAddressModal();
}

function editAddress(index) {
  if (!addresses[index]) return;
  openAddressModal(index);
}

function deleteAddress(index) {
  addresses.splice(index, 1);

  if (editingIndex === index) {
    editingIndex = null;
  } else if (editingIndex !== null && index < editingIndex) {
    editingIndex--;
  }

  renderAddresses();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatDateForCard(value) {
  if (!value) return "";

  if (/^\d{1,2}\/\d{1,2}$/.test(value)) {
    return value;
  }

  const [year, month, day] = value.split("-");

  return year && month && day ? `${month}/${day}/${year}` : value;
}

function buildCardDetails(item) {
  if (item.isPrimary) {
    return "Primary Address";
  }

  if (item.type === "housing") {
    return `${item.housingType || ""}${
      item.units != null ? ` • Units: ${item.units}` : ""
    }${
      item.occupancy != null ? ` • Occupancy: ${item.occupancy}` : ""
    }`;
  }

  const owner = item.ownedByEmployer
    ? "Employer-owned"
    : item.ownedBy
      ? `Owned by: ${item.ownedBy}`
      : "";

  const dates = item.startDate || item.endDate
    ? `${formatDateForCard(item.startDate) || "?"} – ${formatDateForCard(item.endDate) || "?"}`
    : "";

  const workers = item.workers != null
    ? `${item.workers} worker${item.workers === 1 ? "" : "s"}`
    : "";

  return [owner, dates, workers]
    .filter(Boolean)
    .join(" • ");
}

function renderAddresses() {
  fields.addressList.innerHTML = "";
  fields.addressCount.textContent = addresses.length;

  if (!addresses.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = MODES[getMode()].emptyLabel;
    fields.addressList.appendChild(empty);

    syncPdfField();
    updateWidgetHeight();
    return;
  }

  addresses.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "address-card";

    const street = [item.street1, item.street2].filter(Boolean).join(", ");

    const fullAddress = [
      street,
      item.city,
      `${item.state} ${item.zip}`.trim()
    ].filter(Boolean).join(", ");

    const details = buildCardDetails(item);

    card.innerHTML = `
      <div class="address-main">
        <div class="address-primary" title="${escapeHtml(fullAddress)}">${escapeHtml(fullAddress)}</div>
        <div class="address-details">${escapeHtml(details)}</div>
      </div>

      <div class="card-actions">
        <button class="edit-btn" type="button">Edit</button>
        <button class="delete-btn" type="button" aria-label="Delete address">✕</button>
      </div>
    `;

    card.querySelector(".edit-btn").addEventListener("click", () => editAddress(index));
    card.querySelector(".delete-btn").addEventListener("click", () => deleteAddress(index));

    fields.addressList.appendChild(card);
  });

  syncPdfField();
  updateWidgetHeight();
}

function parseUSAddress(value) {
  const raw = clean_(value);

  if (!raw) {
    return {
      street1: "",
      street2: "",
      city: "",
      state: "",
      zip: "",
      county: ""
    };
  }

  if (raw.includes("¦")) {
    const parts = raw.split("¦").map(part => part.trim()).filter(Boolean);

    if (parts.length >= 5) {
      return {
        street1: parts[0] || "",
        street2: "",
        city: parts[1] || "",
        state: (parts[2] || "").toUpperCase(),
        zip: parts[3] || "",
        county: parts.slice(4).join(" ").trim()
      };
    }
  }

  const normalized = raw.replace(/,\s*,+/g, ", ");
  const parts = normalized.split(",").map(part => part.trim()).filter(Boolean);

  const stateZipIndex = parts.findIndex(part =>
    /^[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i.test(part)
  );

  if (stateZipIndex >= 1) {
    const stateZipMatch = parts[stateZipIndex].match(
      /^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i
    );

    const city = parts[stateZipIndex - 1] || "";
    const streetParts = parts.slice(0, stateZipIndex - 1);
    const county = parts.slice(stateZipIndex + 1).join(", ");

    return {
      street1: streetParts.join(", "),
      street2: "",
      city,
      state: stateZipMatch?.[1]?.toUpperCase() || "",
      zip: stateZipMatch?.[2] || "",
      county
    };
  }

  return {
    street1: raw,
    street2: "",
    city: "",
    state: "",
    zip: "",
    county: ""
  };
}

function parseHousingLine(line) {
  const metaMatch = line.match(/\((.*?)\)\s*$/);
  const meta = metaMatch?.[1] || "";

  const addressPart = metaMatch
    ? line.slice(0, metaMatch.index).trim()
    : line.trim();

  const unitsMatch = meta.match(/Units:\s*(\d+)/i);
  const occupancyMatch = meta.match(/Occupancy:\s*(\d+)/i);

  const typeText =
    meta.split("|")[0]?.trim() ||
    "Employer-owned";

  return {
    type: "housing",
    nickname: "",

    ...parseUSAddress(addressPart),

    latitude: null,
    longitude: null,
    source: "prefill",

    housingType: /rented/i.test(typeText) ? "Rented" : "Employer-owned",
    units: unitsMatch ? Number(unitsMatch[1]) : null,
    occupancy: occupancyMatch ? Number(occupancyMatch[1]) : null
  };
}

function parseWorksiteLine(line) {
  const workersMatch = line.match(/\((\d+)\s+workers?\)\s*$/i);
  const workers = workersMatch ? Number(workersMatch[1]) : null;

  const withoutWorkers = line
    .replace(/\s*\(\d+\s+workers?\)\s*$/i, "")
    .trim();

  const dateMatch = withoutWorkers.match(
    /:\s*(\d{1,2}\/\d{1,2})-(\d{1,2}\/\d{1,2})\s*$/
  );

  const startDate = dateMatch?.[1] || "";
  const endDate = dateMatch?.[2] || "";

  const withoutDates = dateMatch
    ? withoutWorkers.slice(0, dateMatch.index).trim()
    : withoutWorkers;

  const firstColon = withoutDates.indexOf(":");

  const ownedBy = firstColon >= 0
    ? withoutDates.slice(0, firstColon).trim()
    : "";

  const addressPart = firstColon >= 0
    ? withoutDates.slice(firstColon + 1).trim()
    : withoutDates;

  return {
    type: "worksite",
    nickname: "",

    ...parseUSAddress(addressPart),

    latitude: null,
    longitude: null,
    source: "prefill",

    ownedByEmployer: !ownedBy,
    ownedBy,
    startDate,
    endDate,
    workers
  };
}

function parsePrefill(raw) {
  const mode = getMode();

  return String(raw || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const item = mode === "housing"
        ? parseHousingLine(line)
        : parseWorksiteLine(line);

      return {
        ...item,
        isPrimary: index === 0,
        baselineId: `prefill-${index}`
      };
    })
    .filter(Boolean);
}

function buildHumanReadableValue() {
  const status = getListChangeStatus();

  const statusLine =
    status === "new"
      ? "CHANGE STATUS: New address list"
      : status === "changed"
        ? "CHANGE STATUS: ⚠ Changes made"
        : "CHANGE STATUS: No changes";

  const currentLines = addresses.map(item => {
    const changeType = getAddressChangeType(item);

    const prefix =
      changeType === "added"
        ? "➕ "
        : changeType === "changed"
          ? "⚠ "
          : "";

    const value =
      item.type === "housing"
        ? formatHousingForPdf(item)
        : formatWorksiteForPdf(item);

    return `${prefix}${value}`;
  });

  const deletedLines = getDeletedAddresses().map(item => {
    const value =
      item.type === "housing"
        ? formatHousingForPdf(item)
        : formatWorksiteForPdf(item);

    return `❌ DELETE: ${value}`;
  });

  return [
    statusLine,
    "",
    ...currentLines,
    ...(deletedLines.length ? ["", "Deleted Addresses:", ...deletedLines] : [])
  ].join("\n");
}

function formatHousingForPdf(item) {
  const street = [item.street1, item.street2].filter(Boolean).join(", ");

  const base = `${street}, ${item.city}, ${item.state} ${item.zip}, ${item.county}`;

  if (item.isPrimary) {
    return `${base} (Primary Address)`;
  }

  return `${base} (${item.housingType} | Units: ${item.units} | Occupancy: ${item.occupancy})`;
}

function formatWorksiteForPdf(item) {
  const base = `${item.street1}, ${item.city}, ${item.state} ${item.zip}, ${item.county}`;

  if (item.isPrimary) {
    return `${base} (Primary Address)`;
  }

  const owner = item.ownedByEmployer
    ? "Employer-owned"
    : `Owned by ${item.ownedBy}`;

  const dates =
    item.startDate || item.endDate
      ? `${formatDateForCard(item.startDate) || "?"}-${formatDateForCard(item.endDate) || "?"}`
      : "";

  const workers =
    item.workers != null
      ? `${item.workers} worker${item.workers === 1 ? "" : "s"}`
      : "";

  const details = [owner, dates, workers].filter(Boolean).join(" | ");

  return `${base}${details ? ` (${details})` : ""}`;
}

function syncPdfField() {
  const mode = getMode();
  const pdfValue = buildHumanReadableValue();

  try {
    JFCustomWidget.setFieldsValueByLabel([
      {
        label: `New ${mode==='worksite' ? 'Worksite' : 'Housing'} List`,
        value: pdfValue
      }
    ]);
  } catch (err) {
    console.warn("Could not update PDF summary field:", err);
  }
}

function normalizeAddressForComparison(item) {
  const base = {
    type: item.type,
    street1: clean_(item.street1),
    street2: clean_(item.street2),
    city: clean_(item.city),
    state: clean_(item.state),
    zip: clean_(item.zip),
    county: clean_(item.county)
  };

  if (item.type === "housing") {
    return {
      ...base,
      housingType: item.housingType || "",
      units: item.units ?? null,
      occupancy: item.occupancy ?? null
    };
  }

  return {
    ...base,
    ownedByEmployer: item.ownedByEmployer !== false,
    ownedBy: clean_(item.ownedBy),
    startDate: item.startDate || "",
    endDate: item.endDate || "",
    workers: item.workers ?? null
  };
}

function addressesEqual(a, b) {
  return JSON.stringify(normalizeAddressForComparison(a)) ===
         JSON.stringify(normalizeAddressForComparison(b));
}

function updateDropPinState() {
  const canDropPin =
    getMode() === "worksite" &&
    selectedMapCenter !== null;

  fields.dropPinBtn.disabled = !canDropPin;
}

function getAddressChangeType(item) {
  if (!initialAddresses.length) {
    return "new";
  }

  if (!item.baselineId) {
    return "added";
  }

  const original = initialAddresses.find(
    original => original.baselineId === item.baselineId
  );

  if (!original) {
    return "added";
  }

  return addressesEqual(item, original)
    ? "unchanged"
    : "changed";
}

function getListChangeStatus() {
  if (!initialAddresses.length) {
    return "new";
  }

  if (addresses.length !== initialAddresses.length) {
    return "changed";
  }

  const changed = addresses.some(item =>
    getAddressChangeType(item) !== "unchanged"
  );

  return changed ? "changed" : "unchanged";
}

function getDeletedAddresses() {
  return initialAddresses.filter(original =>
    !addresses.some(item => item.baselineId === original.baselineId)
  );
}

function wireEvents() {
  fields.reuseAddressesBtn.addEventListener("click", reusePreviousAddresses);
  fields.newAddressListBtn.addEventListener("click", startNewAddressList);

  fields.addAddressBtn.addEventListener("click", () => openAddressModal());

  fields.closeModalBtn.addEventListener("click", closeAddressModal);
  fields.cancelModalBtn.addEventListener("click", closeAddressModal);

  fields.saveAddressBtn.addEventListener("click", () => {
    saveAddress({ addAnother: false });
  });

  fields.saveAnotherBtn.addEventListener("click", () => {
    saveAddress({ addAnother: true });
  });

  fields.housingTypeSelect.addEventListener("change", () => {
    setHousingType(fields.housingTypeSelect.value);
  });

  fields.ownedByEmployer.addEventListener("change", toggleOwnedBy);

  fields.addressSearch.addEventListener("input", handleAddressSearchInput);

  fields.addressSearch.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      hideAddressSuggestions();
    }
  });

  document.addEventListener("click", event => {
    if (
      !fields.addressSearch.contains(event.target) &&
      !fields.addressSuggestions.contains(event.target)
    ) {
      hideAddressSuggestions();
    }
  });

  [
    fields.street1,
    fields.street2,
    fields.city,
    fields.state,
    fields.zip,
    fields.county
  ].forEach(field => {
    field.addEventListener(
      "input",
      invalidateLookupOnManualEdit
    );

    field.addEventListener(
      "change",
      invalidateLookupOnManualEdit
    );
  });
  
}

async function initializeWidget() {
  if (initialized) return;
  initialized = true;

  populateStates();
  configureMode();
  setHousingType("Employer-owned");
  toggleOwnedBy();
  wireEvents();
  updateDropPinState();
  showStartSection();
  renderAddresses();
}

JFCustomWidget.subscribe("ready", async function () {
  await initializeWidget();

  JFCustomWidget.subscribe("submit", function () {
    const config = MODES[getMode()];

    if (!addresses.length) {
      fields.globalError.textContent =
        `Please add at least one ${config.singular.toLowerCase()}.`;

      JFCustomWidget.sendSubmit({
        valid: false,
        value: ""
      });

      return;
    }

    fields.globalError.textContent = "";

    const jsonValue = JSON.stringify(
      addresses.map(({ baselineId, ...item }) => item)
    );

    JFCustomWidget.sendSubmit({
      valid: true,
      value: jsonValue
    });
  });
});
