/* =========================================================================
   Project Atlas file-sharing vignette
   -------------------------------------------------------------------------
   File sections (search for these headers):
     1. CONFIG            — researcher-editable settings
     2. SCENARIOS          — all wording for the 12 experimental conditions
     3. URL PARAMS         — reads ambiguity / treatment / share / debug
     4. EVENT LOG + QUALTRICS COMMUNICATION
     5. DOM REFERENCES
     6. RENDER: apply the selected condition to the static file row
     7. UI STATE MACHINE   — modal open -> recipient select -> check -> decide
     8. DEBUG PANEL
     9. INIT
   ========================================================================= */

(function () {
  "use strict";

  /* =======================================================================
     1. CONFIG — edit these without touching the logic below
     ======================================================================= */
  const CONFIG = {
    recipient: {
      name: "Jordan Lee",
      org: "Apex Consulting",
      initials: "JL"
    },
    self: {
      initials: "YOU"
    },
    labels: {
      send: "Send",
      cancel: "Cancel",
      copyLink: "Copy link",
      sentToast: (name) => `Sent to ${name}`,
      declinedToast: "Not shared"
    },
    timing: {
      autocompleteDelayMs: 120,   // delay before the recipient suggestion appears
      checkDelayMs: 650,          // simulated "running sharing check" delay
      toastDurationMs: 2200,
      modalCloseAfterSendMs: 900
    },
    qualtrics: {
      // postMessage target origin. Use "*" for local testing; researchers
      // embedding in Qualtrics should restrict this if the survey domain
      // is known ahead of time.
      targetOrigin: "*",
      enabled: true
    }
  };

  /* =======================================================================
     2. SCENARIOS
     -----------------------------------------------------------------------
     The underlying case only depends on ambiguity x share — treatment never
     changes the ground truth, only how much of it is revealed:
       treatment 0  claim only                 ("What to do")
       treatment 1  claim + data                ("What to do" + the facts)
       treatment 2  claim + data + warrant       (...+ the reasoning that
                                                   connects the facts to the claim)
     Because data is shown on its own in treatment 1, the treatment-2 warrant
     is NOT required to restate every fact for information equivalence the
     way a standalone narrative would — it can draw on whichever subset of
     the already-visible data actually does the connecting work. Keep it
     that way; don't introduce facts into warrantText that aren't already in
     `facts`.
     The file name is deliberately not repeated here; it is already shown in
     the dialog title ("Share \"<fileName>\"").
     ======================================================================= */
  // One case per ambiguity+share combination, keyed "<ambiguity><share>".
  // Low-ambiguity cases turn on project membership alone (no classification
  // involved). High-ambiguity cases turn on the Confidential/Internal
  // distinction interacting with the NDA exception — participants have
  // struggled to tell Confidential and Internal apart, so each value now
  // carries a short, generic sensitivity clarification (which is more
  // restrictive than which) without hinting at how this policy's exception
  // actually resolves.
  const CLASSIFICATION = {
    internal: "Internal (lower sensitivity — standard company use)",
    confidential: "Confidential (higher sensitivity — more restricted than Internal)"
  };

  const caseData = {
    // ---- LOW AMBIGUITY, CANNOT SHARE ----------------------------------
    "00": {
      fileName: "Project Atlas – Q3 Pricing.xlsx",
      modifiedLabel: "Just now",
      shareAllowed: false,
      facts: [
        ["Project", "Project Atlas"],
        ["Recipient", "Jordan Lee"],
        ["Project membership", "Not a member"],
        ["Policy", "Project files may be shared only with project members"]
      ],
      warrantText:
        "The file may be shared only with Project Atlas members. Jordan Lee is not a Project Atlas member.",
      claim: "Do not share this file with Jordan Lee."
    },

    // ---- LOW AMBIGUITY, CAN SHARE --------------------------------------
    "01": {
      fileName: "Project Atlas – Q3 Pricing.xlsx",
      modifiedLabel: "Just now",
      shareAllowed: true,
      facts: [
        ["Project", "Project Atlas"],
        ["Recipient", "Jordan Lee"],
        ["Project membership", "Member"],
        ["Policy", "Project files may be shared with project members"]
      ],
      warrantText:
        "The file may be shared with Project Atlas members. Jordan Lee is a Project Atlas member.",
      claim: "You may share the file with Jordan Lee."
    },

    // ---- HIGH AMBIGUITY, CANNOT SHARE (Confidential blocks the exception) --
    "10": {
      fileName: "Project Atlas – Q3 Pricing.xlsx",
      modifiedLabel: "Just now",
      shareAllowed: false,
      facts: [
        ["Project", "Project Atlas"],
        ["Classification", CLASSIFICATION.confidential],
        ["Recipient", "Jordan Lee"],
        ["Recipient status", "External collaborator"],
        ["Project membership", "Member"],
        ["Nondisclosure agreement", "Active"],
        ["Policy", "External collaborators may not access project files"],
        ["Exception", "Members with an active nondisclosure agreement may access Internal files as an exception to this policy"]
      ],
      warrantText:
        "Jordan Lee's active nondisclosure agreement would normally create an exception allowing a Project Atlas member to access Internal files despite being an external collaborator. But this file is classified as Confidential, not Internal, so the exception does not apply.",
      claim: "Do not share this file with Jordan Lee."
    },

    // ---- HIGH AMBIGUITY, CAN SHARE (Internal lets the exception apply) -----
    "11": {
      fileName: "Project Atlas – Q3 Pricing.xlsx",
      modifiedLabel: "Just now",
      shareAllowed: true,
      facts: [
        ["Project", "Project Atlas"],
        ["Classification", CLASSIFICATION.internal],
        ["Recipient", "Jordan Lee"],
        ["Recipient status", "External collaborator"],
        ["Project membership", "Member"],
        ["Nondisclosure agreement", "Active"],
        ["Policy", "External collaborators may not access project files"],
        ["Exception", "Members with an active nondisclosure agreement may access Internal files as an exception to this policy"]
      ],
      warrantText:
        "Jordan Lee's active nondisclosure agreement creates an exception allowing a Project Atlas member to access Internal files despite being an external collaborator, and this file is classified as Internal, so the exception applies.",
      claim: "You may share the file with Jordan Lee."
    }
  };

  // Expand the 4 cases into the 12 condition keys "<ambiguity><treatment><share>".
  // Every treatment level at a given ambiguity+share shares the exact same
  // case object — treatment only changes what buildSecurityPanelContent()
  // reveals from it, never the underlying facts.
  const scenarios = {};
  ["0", "1"].forEach((ambiguity) => {
    ["0", "1"].forEach((share) => {
      const data = caseData[`${ambiguity}${share}`];
      ["0", "1", "2"].forEach((treatment) => {
        scenarios[`${ambiguity}${treatment}${share}`] = data;
      });
    });
  });

  /* =======================================================================
     3. URL PARAMS — determine the active condition
     ======================================================================= */
  function readBit(params, key) {
    const raw = params.get(key);
    if (raw === "0" || raw === "1") return raw;
    console.warn(`[vignette] URL parameter "${key}" missing or invalid ("${raw}"); defaulting to "0".`);
    return "0";
  }

  // treatment: 0 = claim only, 1 = claim + data, 2 = claim + data + warrant.
  function readTreatment(params) {
    const raw = params.get("treatment");
    if (raw === "0" || raw === "1" || raw === "2") return raw;
    console.warn(`[vignette] URL parameter "treatment" missing or invalid ("${raw}"); defaulting to "0".`);
    return "0";
  }

  const urlParams = new URLSearchParams(window.location.search);
  const ambiguity = readBit(urlParams, "ambiguity");
  const treatment = readTreatment(urlParams);
  const share = readBit(urlParams, "share");
  const debugMode = urlParams.get("debug") === "1";

  const conditionKey = `${ambiguity}${treatment}${share}`;
  const scenario = scenarios[conditionKey];

  /* =======================================================================
     4. EVENT LOG + QUALTRICS COMMUNICATION
     ======================================================================= */
  const eventLog = [];
  const sessionStart = performance.now();

  function logEvent(eventName, data) {
    const entry = {
      event: eventName,
      condition: conditionKey,
      ambiguity,
      treatment,
      share,
      tSinceLoadMs: Math.round(performance.now() - sessionStart),
      timestamp: new Date().toISOString(),
      data: data || {}
    };
    eventLog.push(entry);

    // Send to parent window (Qualtrics) if embedded in an iframe.
    if (CONFIG.qualtrics.enabled && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          { source: "securitycopilot-vignette", ...entry },
          CONFIG.qualtrics.targetOrigin
        );
      } catch (e) {
        console.warn("[vignette] postMessage to parent failed:", e);
      }
    }

    if (debugMode) appendDebugLogRow(entry);
    return entry;
  }

  // Exposed for local inspection / automated testing.
  window.__vignetteLog = eventLog;
  window.__vignetteCondition = conditionKey;

  /* =======================================================================
     5. DOM REFERENCES
     ======================================================================= */
  const el = {
    fileNameLabel: document.getElementById("fileNameLabel"),
    modifiedLabel: document.getElementById("modifiedLabel"),
    shareTrigger: document.getElementById("shareTrigger"),
    modalOverlay: document.getElementById("modalOverlay"),
    modalCloseBtn: document.getElementById("modalCloseBtn"),
    shareFileName: document.getElementById("shareFileName"),
    recipientInput: document.getElementById("recipientInput"),
    recipientInputWrap: document.getElementById("recipientInputWrap"),
    chipArea: document.getElementById("chipArea"),
    autocompleteList: document.getElementById("autocompleteList"),
    messageArea: document.getElementById("messageArea"),
    messageBox: document.getElementById("messageBox"),
    securityPanel: document.getElementById("securityPanel"),
    securityPanelBody: document.getElementById("securityPanelBody"),
    sendBtn: document.getElementById("sendBtn"),
    sendLabel: document.getElementById("sendLabel"),
    dontShareBtn: document.getElementById("dontShareBtn"),
    cancelLabel: document.getElementById("cancelLabel"),
    copyLinkBtn: document.getElementById("copyLinkBtn"),
    copyLinkLabel: document.getElementById("copyLinkLabel"),
    toast: document.getElementById("toast"),
    debugPanel: document.getElementById("debugPanel"),
    dbgCondition: document.getElementById("dbgCondition"),
    dbgAmbiguity: document.getElementById("dbgAmbiguity"),
    dbgTreatment: document.getElementById("dbgTreatment"),
    dbgShare: document.getElementById("dbgShare"),
    dbgState: document.getElementById("dbgState"),
    dbgLog: document.getElementById("dbgLog")
  };

  /* =======================================================================
     6. RENDER — apply the selected condition to the static file row
     ======================================================================= */
  function renderFileRow() {
    el.fileNameLabel.textContent = scenario.fileName;
    el.modifiedLabel.textContent = scenario.modifiedLabel;
    el.shareFileName.textContent = scenario.fileName;
  }

  function addSectionLabel(text) {
    const label = document.createElement("div");
    label.className = "section-label";
    label.textContent = text;
    el.securityPanelBody.appendChild(label);
  }

  function buildSecurityPanelContent() {
    el.securityPanelBody.innerHTML = "";

    // Build-up order: Details, then Why, then the Recommendation (claim)
    // last — participants see the evidence and reasoning before the
    // directive, instead of the directive first.
    if (treatment === "1" || treatment === "2") {
      addSectionLabel("Details");
      const list = document.createElement("ul");
      list.className = "fact-list";
      scenario.facts.forEach(([label, value]) => {
        const li = document.createElement("li");
        const l = document.createElement("span");
        l.className = "fact-label";
        l.textContent = label + ":";
        const v = document.createElement("span");
        v.className = "fact-value";
        v.textContent = value;
        li.appendChild(l);
        li.appendChild(v);
        list.appendChild(li);
      });
      el.securityPanelBody.appendChild(list);
    }

    if (treatment === "2") {
      addSectionLabel("Why");
      const p = document.createElement("p");
      p.className = "warrant-text";
      p.textContent = scenario.warrantText;
      el.securityPanelBody.appendChild(p);
    }

    // Every treatment level shows the claim — treatment only controls how
    // much supporting material precedes it.
    addSectionLabel("Recommendation");
    const claimValue = document.createElement("p");
    claimValue.className = "claim-text";
    claimValue.textContent = scenario.claim;
    el.securityPanelBody.appendChild(claimValue);
  }

  /* =======================================================================
     7. UI STATE MACHINE
     ======================================================================= */
  let uiState = "idle";
  let checkShownAt = null;
  let autocompleteTimer = null;

  function setState(next) {
    uiState = next;
    if (debugMode) el.dbgState.textContent = uiState;
  }

  function openModal() {
    setState("modal_open");
    el.modalOverlay.hidden = false;
    logEvent("share_initiated");
    setTimeout(() => el.recipientInput.focus(), 30);
  }

  function closeModal() {
    el.modalOverlay.hidden = true;
    resetModal();
  }

  function resetModal() {
    clearTimeout(autocompleteTimer);
    el.chipArea.innerHTML = "";
    el.recipientInput.value = "";
    el.recipientInput.disabled = false;
    el.autocompleteList.hidden = true;
    el.messageArea.classList.remove("hidden");
    el.securityPanel.hidden = true;
    el.sendBtn.disabled = true;
    el.dontShareBtn.hidden = true;
    checkShownAt = null;
    setState("idle");
  }

  function showAutocomplete() {
    // Once a recipient chip exists (or the field is disabled), the
    // suggestion list must stay closed even if a stale keystroke timer fires.
    if (el.recipientInput.disabled) return;

    const query = el.recipientInput.value.trim().toLowerCase();
    const name = CONFIG.recipient.name.toLowerCase();
    // Single plausible recipient; matches on any substring of the name.
    const matches = query === "" || name.includes(query);
    if (!matches) {
      el.autocompleteList.hidden = true;
      return;
    }
    el.autocompleteList.innerHTML = "";
    const item = document.createElement("div");
    item.className = "ac-item";
    item.innerHTML = `
      <div class="ac-avatar">${CONFIG.recipient.initials}</div>
      <div class="ac-text">
        <div class="ac-name">${CONFIG.recipient.name}</div>
        <div class="ac-sub">${CONFIG.recipient.org}</div>
      </div>`;
    item.addEventListener("click", selectRecipient);
    el.autocompleteList.appendChild(item);
    el.autocompleteList.hidden = false;
  }

  function selectRecipient() {
    clearTimeout(autocompleteTimer);
    el.autocompleteList.hidden = true;
    el.recipientInput.value = "";
    el.recipientInput.disabled = true;

    const chip = document.createElement("span");
    chip.className = "recipient-chip";
    chip.innerHTML = `<span class="chip-avatar">${CONFIG.recipient.initials}</span>${CONFIG.recipient.name}`;
    el.chipArea.appendChild(chip);

    setState("recipient_selected");
    logEvent("recipient_selected", { recipient: CONFIG.recipient.name });

    // Occupy the "Add a message" area with the sharing check, in place.
    setTimeout(runSharingCheck, CONFIG.timing.checkDelayMs);
  }

  function runSharingCheck() {
    setState("checking");
    el.messageArea.classList.add("hidden");
    buildSecurityPanelContent();
    el.securityPanel.hidden = false;
    checkShownAt = performance.now();
    setState("check_shown");
    const representation = treatment === "0" ? "claim" : treatment === "1" ? "claim_data" : "claim_data_warrant";
    logEvent("message_displayed", { treatment, representation, shareAllowed: scenario.shareAllowed });

    el.sendBtn.disabled = false;
    el.dontShareBtn.hidden = false;
  }

  function decisionTimeMs() {
    return checkShownAt ? Math.round(performance.now() - checkShownAt) : null;
  }

  function handleSend() {
    if (el.sendBtn.disabled) return;
    const overridden = !scenario.shareAllowed;
    logEvent("send_clicked", { overridden, decisionTimeMs: decisionTimeMs() });
    logEvent("final_action", { action: "sent", overridden, decisionTimeMs: decisionTimeMs() });
    showToast(CONFIG.labels.sentToast(CONFIG.recipient.name));
    el.sendBtn.disabled = true;
    el.dontShareBtn.hidden = true;
    setTimeout(closeModal, CONFIG.timing.modalCloseAfterSendMs);
  }

  function handleDontShare() {
    if (el.dontShareBtn.hidden) return;
    logEvent("cancel_clicked", { decisionTimeMs: decisionTimeMs() });
    logEvent("final_action", { action: "not_sent", overridden: false, decisionTimeMs: decisionTimeMs() });
    showToast(CONFIG.labels.declinedToast);
    el.sendBtn.disabled = true;
    el.dontShareBtn.hidden = true;
    setTimeout(closeModal, CONFIG.timing.modalCloseAfterSendMs);
  }

  function handleModalDismiss() {
    if (uiState !== "closed") {
      logEvent("modal_dismissed", { atState: uiState });
    }
    closeModal();
  }

  let toastTimer = null;
  function showToast(message) {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.hidden = false;
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, CONFIG.timing.toastDurationMs);
  }

  /* =======================================================================
     8. DEBUG PANEL
     ======================================================================= */
  function appendDebugLogRow(entry) {
    const row = document.createElement("div");
    row.textContent = `${entry.tSinceLoadMs}ms  ${entry.event}`;
    el.dbgLog.appendChild(row);
    el.dbgLog.scrollTop = el.dbgLog.scrollHeight;
  }

  function initDebugPanel() {
    if (!debugMode) return;
    el.debugPanel.hidden = false;
    el.dbgCondition.textContent = conditionKey;
    el.dbgAmbiguity.textContent = ambiguity;
    el.dbgTreatment.textContent = treatment;
    el.dbgShare.textContent = share;
    el.dbgState.textContent = uiState;
  }

  /* =======================================================================
     9. INIT
     ======================================================================= */
  function bindEvents() {
    el.shareTrigger.addEventListener("click", openModal);
    el.modalCloseBtn.addEventListener("click", handleModalDismiss);
    el.modalOverlay.addEventListener("click", (e) => {
      if (e.target === el.modalOverlay) handleModalDismiss();
    });
    el.recipientInput.addEventListener("input", () => {
      clearTimeout(autocompleteTimer);
      autocompleteTimer = setTimeout(showAutocomplete, CONFIG.timing.autocompleteDelayMs);
    });
    el.recipientInput.addEventListener("focus", showAutocomplete);
    el.recipientInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !el.autocompleteList.hidden) {
        e.preventDefault();
        selectRecipient();
      }
    });
    document.addEventListener("click", (e) => {
      if (!el.recipientInputWrap.contains(e.target) && e.target !== el.autocompleteList) {
        el.autocompleteList.hidden = true;
      }
    });
    el.sendBtn.addEventListener("click", handleSend);
    el.dontShareBtn.addEventListener("click", handleDontShare);
    el.copyLinkBtn.addEventListener("click", () => logEvent("copy_link_clicked"));
  }

  function applyButtonLabels() {
    el.sendLabel.textContent = CONFIG.labels.send;
    el.cancelLabel.textContent = CONFIG.labels.cancel;
    el.copyLinkLabel.textContent = CONFIG.labels.copyLink;
  }

  function init() {
    if (!scenario) {
      console.error(`[vignette] Unknown condition "${conditionKey}". Falling back to "000".`);
    }
    renderFileRow();
    applyButtonLabels();
    bindEvents();
    initDebugPanel();
    logEvent("vignette_loaded", { conditionKey });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
