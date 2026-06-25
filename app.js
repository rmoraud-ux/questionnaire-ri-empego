const API_URL = "https://script.google.com/macros/s/AKfycbxJJY9T2gi2CoAqPNvwgLE3Z6DaP9V9HSis1vU0N7pz-xh-7vNBY7sY8U1s2eg2H4TA/exec";

let saveTimer = null;
let isSubmitting = false;

function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

function hasValidDeal() {
  return /^\d+$/.test(getUrlParam("deal"));
}

function value(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function checkedValues(name) {
  return Array.from(document.querySelectorAll(`[data-name="${name}"] input:checked`))
    .map(cb => cb.value);
}

function setStatus(message, type = "") {
  const box = document.getElementById("statusBox");
  if (!box) return;

  box.className = "status-box";
  if (type) box.classList.add(type);
  box.textContent = message;
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null && !el.value) el.value = val;
}

function prefillFromUrl() {
  setValue("pharmacie_nom", getUrlParam("pharmacie"));
  setValue("responsable", getUrlParam("contact"));
  setValue("courriel", getUrlParam("email"));
  setValue("telephone", getUrlParam("phone"));

  const deal = getUrlParam("deal");
  const org = getUrlParam("org");

  if (deal || org) {
    document.getElementById("pipedriveInfo").textContent =
      `Questionnaire relié à Pipedrive — Deal ID : ${deal || "-"} | Organisation ID : ${org || "-"}`;
  }
}

function buildPayload(status = "IN_PROGRESS") {
  return {
    questionnaireId: getUrlParam("questionnaireId"),
    dealId: getUrlParam("deal"),
    orgId: getUrlParam("org"),
    token: getUrlParam("token"),
    status,
    submittedAt: status === "COMPLETED" ? new Date().toISOString() : "",

    pharmacie: {
      nom: value("pharmacie_nom"),
      responsable: value("responsable"),
      courriel: value("courriel"),
      telephone: value("telephone")
    },

    ri: {
      roulement: value("roulement"),
      clientele: checkedValues("clientele"),
      expertise: checkedValues("expertise"),
      saas: checkedValues("saas"),
      pharmaciens: checkedValues("pharmaciens"),
      atps: checkedValues("atps"),
      notes_equipe: value("notes_equipe"),
      nombre_consultations: value("nombre_consultations"),
      consultations_frequentes: checkedValues("consultations_frequentes"),
      notes_consultation: value("notes_consultation"),
      nombre_suivis: value("nombre_suivis"),
      suivis_frequents: checkedValues("suivis_frequents"),
      notes_suivi: value("notes_suivi"),
      motivations: checkedValues("motivations"),
      notes_roulement: value("notes_roulement")
    },

    meta: {
      source: "questionnaire_preparatoire_ri",
      version: "4.0",
      status
    }
  };
}

function updateJsonBox(status = "IN_PROGRESS") {
  const box = document.getElementById("jsonOutput");
  if (box) box.value = JSON.stringify(buildPayload(status), null, 2);
}

function updateProgress() {
  const fields = [
    value("pharmacie_nom"),
    value("responsable"),
    value("courriel"),
    value("telephone"),
    value("roulement"),
    checkedValues("clientele"),
    checkedValues("expertise"),
    checkedValues("saas"),
    checkedValues("pharmaciens"),
    checkedValues("atps"),
    value("notes_equipe"),
    value("nombre_consultations"),
    checkedValues("consultations_frequentes"),
    value("notes_consultation"),
    value("nombre_suivis"),
    checkedValues("suivis_frequents"),
    value("notes_suivi"),
    checkedValues("motivations"),
    value("notes_roulement")
  ];

  let filled = 0;

  fields.forEach(item => {
    if (Array.isArray(item) && item.length > 0) filled++;
    else if (!Array.isArray(item) && String(item || "").trim()) filled++;
  });

  const percent = Math.round((filled / fields.length) * 100);

  const text = document.getElementById("progressText");
  const fill = document.getElementById("progressFill");

  if (text) text.textContent = percent + "%";
  if (fill) fill.style.width = percent + "%";

  return percent;
}

function localKey() {
  return "empego_ri_" + (getUrlParam("deal") || "local");
}

function saveLocal() {
  localStorage.setItem(localKey(), JSON.stringify(buildPayload("IN_PROGRESS")));
}

function restoreLocal() {
  const saved = localStorage.getItem(localKey());
  if (!saved) return;

  try {
    const payload = JSON.parse(saved);

    if (payload.pharmacie) {
      setValue("pharmacie_nom", payload.pharmacie.nom);
      setValue("responsable", payload.pharmacie.responsable);
      setValue("courriel", payload.pharmacie.courriel);
      setValue("telephone", payload.pharmacie.telephone);
    }
  } catch {}
}

async function sendToApi(action, status) {
  if (!hasValidDeal()) {
    setStatus("Erreur : ce questionnaire n'est pas relié à un Deal Pipedrive valide.", "error");
    return;
  }

  const payload = buildPayload(status);

  await fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      dealId: payload.dealId,
      orgId: payload.orgId,
      token: payload.token,
      questionnaireId: payload.questionnaireId,
      status,
      payload
    })
  });
}

function scheduleSave() {
  updateProgress();
  updateJsonBox("IN_PROGRESS");
  saveLocal();

  clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    if (!hasValidDeal()) return;

    try {
      setStatus("Sauvegarde en cours...", "");
      await sendToApi("save", "IN_PROGRESS");
      setStatus("Sauvegarde automatique effectuée.", "success");
    } catch {
      setStatus("Brouillon sauvegardé localement. Envoi non confirmé.", "error");
    }
  }, 5000);
}

async function submitQuestionnaire() {
  if (isSubmitting) return;

  if (!hasValidDeal()) {
    setStatus("Impossible de soumettre : lien non relié à un Deal Pipedrive.", "error");
    return;
  }

  isSubmitting = true;

  const btn = document.getElementById("submitBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Transmission en cours...";
  }

  try {
    updateProgress();
    updateJsonBox("COMPLETED");

    await sendToApi("submit", "COMPLETED");
    localStorage.removeItem(localKey());

    setStatus("Questionnaire transmis avec succès à Empego.", "success");
    if (btn) btn.textContent = "Questionnaire transmis";
  } catch {
    setStatus("Erreur lors de la transmission. Les réponses restent disponibles.", "error");

    if (btn) {
      btn.disabled = false;
      btn.textContent = "Réessayer";
    }

    isSubmitting = false;
  }
}

function attachEvents() {
  document.querySelectorAll("input, select, textarea").forEach(el => {
    if (el.id === "jsonOutput") return;
    el.addEventListener("input", scheduleSave);
    el.addEventListener("change", scheduleSave);
  });

  const btn = document.getElementById("submitBtn");
  if (btn) btn.addEventListener("click", submitQuestionnaire);
}

window.addEventListener("DOMContentLoaded", () => {
  prefillFromUrl();
  restoreLocal();
  attachEvents();
  updateProgress();
  updateJsonBox("IN_PROGRESS");

  if (!hasValidDeal()) {
    setStatus("Lien de test non relié à Pipedrive. Utilise le lien généré depuis Pipedrive.", "error");
  } else {
    setStatus("Questionnaire prêt. Vos réponses seront sauvegardées automatiquement.", "success");
  }
});