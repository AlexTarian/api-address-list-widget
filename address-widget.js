const addresses = [];
let editingIndex = null;
let initialized = false;
let prefillLoaded = false;
let housingType = "Employer-owned";

const MODES = {
  housing: {
    title: "Housing Locations",
    subtitle: "Add each housing location that will be used for this job order.",
    singular: "Housing Location",
    addLabel: "+ Add Housing",
    listLabel: "Added Housing",
    emptyLabel: "No housing locations added yet."
  },
  worksite: {
    title: "Worksites",
    subtitle: "Add each worksite where H-2A workers may perform work.",
    singular: "Worksite",
    addLabel: "+ Add Worksite",
    listLabel: "Added Worksites",
    emptyLabel: "No worksites added yet."
  }
};

const fields = {
  widgetRoot: document.getElementById("widgetRoot"),
  widgetTitle: document.getElementById("widgetTitle"),
  widgetSubtitle: document.getElementById("widgetSubtitle"),
  editorSection: document.getElementById("editorSection"),
  nickname: document.getElementById("nickname"),
  street1: document.getElementById("street1"),
  street1Label: document.getElementById("street1Label"),
  street2: document.getElementById("street2"),
  street2Wrap: document.getElementById("street2Wrap"),
  city: document.getElementById("city"),
  state: document.getElementById("state"),
  zip: document.getElementById("zip"),
  county: document.getElementById("county"),
  housingFields: document.getElementById("housingFields"),
  housingEmployerOwnedBtn: document.getElementById("housingEmployerOwnedBtn"),
  housingRentedBtn: document.getElementById("housingRentedBtn"),
  units: document.getElementById("units"),
  occupancy: document.getElementById("occupancy"),
  worksiteFields: document.getElementById("worksiteFields"),
  ownedByEmployer: document.getElementById("ownedByEmployer"),
  ownedByWrap: document.getElementById("ownedByWrap"),
  ownedBy: document.getElementById("ownedBy"),
  startDate: document.getElementById("startDate"),
  endDate: document.getElementById("endDate"),
  workers: document.getElementById("workers"),
  saveBtn: document.getElementById("saveBtn"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  formError: document.getElementById("formError"),
  globalError: document.getElementById("globalError"),
  listHeading: document.getElementById("listHeading"),
  addressCount: document.getElementById("addressCount"),
  addressList: document.getElementById("addressList")
};

function clean_(value) { return String(value ?? "").trim(); }

function getSetting_(name) {
  try {
    return clean_(JFCustomWidget.getWidgetSetting(name));
  } catch (err) {
    console.warn(`Could not read setting ${name}:`, err);
    return "";
  }
}

function getMode() {
  const raw = getSetting_("addressType").toLowerCase();
  return raw === "housing" ? "housing" : "worksite";
}

async function getFieldValueById_(fieldId) {
  const cleanFieldId = String(fieldId || "").replace(/\D/g, "");
  if (!cleanFieldId || typeof JFCustomWidget.getFieldsValueById !== "function") return "";

  return await new Promise(resolve => {
    try {
      JFCustomWidget.getFieldsValueById([cleanFieldId], response => {
        const data = Array.isArray(response?.data) ? response.data : [];
        const match = data.find(item => String(item?.selector) === cleanFieldId || String(item?.selector) === `input_${cleanFieldId}` || String(item?.selector).includes(cleanFieldId));
        resolve(String(match?.value ?? data[0]?.value ?? ""));
      });
    } catch (err) {
      console.warn("Could not read field by ID:", err);
      resolve("");
    }
  });
}

function populateStates() {
  fields.state.innerHTML = '<option value="">Select state</option>';
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

  fields.widgetTitle.textContent = config.title;
  fields.widgetSubtitle.textContent = config.subtitle;
  fields.listHeading.textContent = config.listLabel;
  fields.saveBtn.textContent = config.addLabel;

  fields.housingFields.hidden = mode !== "housing";
  fields.worksiteFields.hidden = mode !== "worksite";
  fields.street2Wrap.hidden = mode !== "housing";
  fields.street1Label.innerHTML = mode === "housing" ? 'Street 1<span class="required">*</span>' : 'Street<span class="required">*</span>';
}

function setHousingType(value) {
  housingType = value === "Rented" ? "Rented" : "Employer-owned";
  fields.housingEmployerOwnedBtn.classList.toggle("active", housingType === "Employer-owned");
  fields.housingRentedBtn.classList.toggle("active", housingType === "Rented");
}

function toggleOwnedBy() {
  fields.ownedByWrap.hidden = fields.ownedByEmployer.checked;
  if (fields.ownedByEmployer.checked) fields.ownedBy.value = "";
}

function normalizeCounty(value) {
  return clean_(value);
}

function buildBaseAddress() {
  return {
    nickname: clean_(fields.nickname.value),
    street1: clean_(fields.street1.value),
    street2: clean_(fields.street2.value),
    city: clean_(fields.city.value),
    state: clean_(fields.state.value).toUpperCase(),
    zip: clean_(fields.zip.value),
    county: normalizeCounty(fields.county.value),
    latitude: null,
    longitude: null,
    source: "manual"
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

  return {
    type: "worksite",
    ...base,
    street2: "",
    ownedByEmployer: fields.ownedByEmployer.checked,
    ownedBy: fields.ownedByEmployer.checked ? "" : clean_(fields.ownedBy.value),
    startDate: clean_(fields.startDate.value),
    endDate: clean_(fields.endDate.value),
    workers: fields.workers.value === "" ? null : Number(fields.workers.value)
  };
}

function validateBase(item) {
  if (!item.street1 || !item.city || !item.state || !item.zip || !item.county) return "Please complete all required address fields.";
  if (!/^\d{5}(?:-\d{4})?$/.test(item.zip)) return "Please enter a valid 5-digit ZIP code or ZIP+4.";
  return "";
}

function validateHousing(item) {
  const baseError = validateBase(item);
  if (baseError) return baseError;
  if (!Number.isInteger(item.units) || item.units < 1) return "Units must be a whole number of at least 1.";
  if (!Number.isInteger(item.occupancy) || item.occupancy < 1) return "Occupancy must be a whole number of at least 1.";
  return "";
}

function validateWorksite(item) {
  const baseError = validateBase(item);
  if (baseError) return baseError;
  if (!item.ownedByEmployer && !item.ownedBy) return "Please enter who owns the worksite.";
  if (item.startDate && item.endDate && item.endDate < item.startDate) return "End date cannot be before start date.";
  if (item.workers !== null && (!Number.isInteger(item.workers) || item.workers < 0)) return "Workers must be a whole number of 0 or more.";
  return "";
}

function validateAddress(item) {
  return item.type === "housing" ? validateHousing(item) : validateWorksite(item);
}

function saveAddress() {
  const item = buildAddressObject();
  const error = validateAddress(item);
  if (error) {
    fields.formError.textContent = error;
    return;
  }

  if (editingIndex === null) addresses.push(item);
  else addresses[editingIndex] = item;

  fields.formError.textContent = "";
  exitEditMode();
  clearForm();
  renderAddresses();
}

function editAddress(index) {
  const item = addresses[index];
  if (!item) return;

  editingIndex = index;
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
    fields.startDate.value = item.startDate || "";
    fields.endDate.value = item.endDate || "";
    fields.workers.value = item.workers ?? "";
    toggleOwnedBy();
  }

  fields.saveBtn.textContent = "Save Changes";
  fields.cancelEditBtn.hidden = false;
  fields.formError.textContent = "";
  fields.editorSection.scrollIntoView({ behavior: "smooth", block: "start" });
  fields.nickname.focus();
}

function deleteAddress(index) {
  addresses.splice(index, 1);
  if (editingIndex === index) {
    exitEditMode();
    clearForm();
  } else if (editingIndex !== null && index < editingIndex) {
    editingIndex--;
  }
  renderAddresses();
}

function exitEditMode() {
  editingIndex = null;
  fields.cancelEditBtn.hidden = true;
  fields.saveBtn.textContent = MODES[getMode()].addLabel;
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
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function formatDateForCard(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${month}/${day}/${year}` : value;
}

function buildCardTitle(item, index) {
  if (item.nickname) return item.nickname;
  return item.type === "housing" ? `Housing ${index + 1}` : `Worksite ${index + 1}`;
}

function buildCardDetails(item) {
  if (item.type === "housing") {
    return `${item.housingType || ""}${item.units != null ? ` • Units: ${item.units}` : ""}${item.occupancy != null ? ` • Occupancy: ${item.occupancy}` : ""}`;
  }

  const owner = item.ownedByEmployer ? "Employer-owned" : item.ownedBy ? `Owned by: ${item.ownedBy}` : "";
  const dates = item.startDate || item.endDate ? `${formatDateForCard(item.startDate) || "?"} – ${formatDateForCard(item.endDate) || "?"}` : "";
  const workers = item.workers != null ? `${item.workers} worker${item.workers === 1 ? "" : "s"}` : "";
  return [owner, dates, workers].filter(Boolean).join(" • ");
}

function renderAddresses() {
  fields.addressList.innerHTML = "";
  fields.addressCount.textContent = addresses.length;

  if (!addresses.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = MODES[getMode()].emptyLabel;
    fields.addressList.appendChild(empty);
    return;
  }

  addresses.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "address-card";
    const street = [item.street1, item.street2].filter(Boolean).join(", ");
    const cityStateZip = `${item.city}, ${item.state} ${item.zip}`.trim();

    card.innerHTML = `
      <div class="address-main">
        <div class="address-title">${escapeHtml(buildCardTitle(item, index))}</div>
        <div class="address-line">${escapeHtml(street)}</div>
        <div class="address-line">${escapeHtml(cityStateZip)}</div>
        <div class="address-details">${escapeHtml(item.county)}${buildCardDetails(item) ? " • " + escapeHtml(buildCardDetails(item)) : ""}</div>
      </div>
      <div class="card-actions">
        <button class="edit-btn" type="button">Edit</button>
        <button class="delete-btn" type="button" aria-label="Delete address">✕</button>
      </div>`;

    card.querySelector(".edit-btn").addEventListener("click", () => editAddress(index));
    card.querySelector(".delete-btn").addEventListener("click", () => deleteAddress(index));
    fields.addressList.appendChild(card);
  });
}

function parseUSAddress(value) {
  const parts = String(value || "").split(",").map(part => part.trim());
  if (parts.length < 4) return { street1: clean_(value), street2: "", city: "", state: "", zip: "", county: "" };

  const street1 = parts[0] || "";
  const city = parts[1] || "";
  const stateZip = parts[2] || "";
  const county = parts.slice(3).join(", ").trim();
  const stateZipMatch = stateZip.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);

  return {
    street1,
    street2: "",
    city,
    state: stateZipMatch?.[1]?.toUpperCase() || "",
    zip: stateZipMatch?.[2] || "",
    county
  };
}

function parseHousingLine(line) {
  const metaMatch = line.match(/\((.*?)\)\s*$/);
  const meta = metaMatch?.[1] || "";
  const addressPart = metaMatch ? line.slice(0, metaMatch.index).trim() : line.trim();
  const unitsMatch = meta.match(/Units:\s*(\d+)/i);
  const occupancyMatch = meta.match(/Occupancy:\s*(\d+)/i);
  const typeText = meta.split("|")[0]?.trim() || "Employer-owned";

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
  const withoutWorkers = line.replace(/\s*\(\d+\s+workers?\)\s*$/i, "").trim();

  const dateMatch = withoutWorkers.match(/:\s*(\d{1,2}\/\d{1,2})-(\d{1,2}\/\d{1,2})\s*$/);
  const startDate = dateMatch?.[1] || "";
  const endDate = dateMatch?.[2] || "";
  const withoutDates = dateMatch ? withoutWorkers.slice(0, dateMatch.index).trim() : withoutWorkers;

  const firstColon = withoutDates.indexOf(":");
  const ownedBy = firstColon >= 0 ? withoutDates.slice(0, firstColon).trim() : "";
  const addressPart = firstColon >= 0 ? withoutDates.slice(firstColon + 1).trim() : withoutDates;

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
    .map(line => mode === "housing" ? parseHousingLine(line) : parseWorksiteLine(line))
    .filter(Boolean);
}

function parseDateParts(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [, month, day] = value.split("-");
    return `${month}/${day}`;
  }
  return value;
}

function serializeHousing(item) {
  const street = [item.street1, item.street2].filter(Boolean).join(", ");
  return `${street}, ${item.city}, ${item.state} ${item.zip}, ${item.county} (${item.housingType} | Units: ${item.units} | Occupancy: ${item.occupancy})`;
}

function serializeWorksite(item) {
  const owner = item.ownedByEmployer ? "" : `${item.ownedBy}: `;
  const dates = item.startDate || item.endDate ? `: ${parseDateParts(item.startDate)}-${parseDateParts(item.endDate)}` : "";
  const workers = item.workers != null ? ` (${item.workers} worker${item.workers === 1 ? "" : "s"})` : "";
  return `${owner}${item.street1}, ${item.city}, ${item.state} ${item.zip}, ${item.county}${dates}${workers}`;
}

function buildSubmissionValue() {
  return addresses.map(item => item.type === "housing" ? serializeHousing(item) : serializeWorksite(item)).join("\n");
}

async function loadPrefilledAddresses() {
  if (prefillLoaded) return true;

  const fieldId = getSetting_("prefillFieldId");
  if (!fieldId) {
    console.log("No prefillFieldId configured.");
    return false;
  }

  const raw = await getFieldValueById_(fieldId);

  if (!clean_(raw)) {
    console.log("Prefill field exists but is currently empty. Will retry.");
    return false;
  }

  try {
    const imported = parsePrefill(raw);

    if (!imported.length) {
      console.warn("Prefill data was found, but no addresses could be parsed.");
      return false;
    }

    addresses.length = 0;
    addresses.push(...imported);

    prefillLoaded = true;

    renderAddresses();

    console.log(`Loaded ${imported.length} prefilled address(es).`);
    return true;
  } catch (err) {
    console.warn("Could not parse prefilled addresses:", err);
    fields.globalError.textContent =
      "Some prefilled addresses could not be loaded. Please review the address list carefully.";

    return false;
  }
}

function wireEvents() {
  fields.housingEmployerOwnedBtn.addEventListener("click", () => setHousingType("Employer-owned"));
  fields.housingRentedBtn.addEventListener("click", () => setHousingType("Rented"));
  fields.ownedByEmployer.addEventListener("change", toggleOwnedBy);
  fields.saveBtn.addEventListener("click", saveAddress);
  fields.cancelEditBtn.addEventListener("click", () => {
    exitEditMode();
    clearForm();
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
  await loadPrefilledAddresses();
  renderAddresses();
}

JFCustomWidget.subscribe("ready", async function () {
  await initializeWidget();

  JFCustomWidget.subscribe("submit", function () {
    if (!addresses.length) {
      fields.globalError.textContent =
        `Please add at least one ${MODES[getMode()].singular.toLowerCase()}.`;

      JFCustomWidget.sendSubmit({
        valid: false,
        value: ""
      });

      return;
    }

    fields.globalError.textContent = "";

    JFCustomWidget.sendSubmit({
      valid: true,
      value: buildSubmissionValue()
    });
  });
});
