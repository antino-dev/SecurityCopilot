/* =========================================================================
   Project Atlas file-sharing vignette
   -------------------------------------------------------------------------
   File sections (search for these headers):
     1. CONFIG            — researcher-editable settings
     2. SCENARIOS          — all wording for the 8 experimental conditions
     3. URL PARAMS         — reads ambiguity / warrant / share / debug
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
     One entry per condition key "ambiguity+warrant+share", e.g. "101".
     Facts / warrant text / claim wording are taken directly from the
     scenario library provided by the research team. Edit freely — nothing
     else in this file needs to change to update wording.
     ======================================================================= */
  // Every scenario's `facts` array uses the SAME field schema, in the SAME
  // order, at both ambiguity levels: Project, Classification, Recipient,
  // Recipient status, Project membership, Nondisclosure agreement, Policy,
  // Exception. Low-ambiguity scenarios have no NDA and no exception, so
  // those two rows are explicitly "None" rather than omitted — ambiguity
  // should come from how the values relate, not from which fields appear.
  // The file name is deliberately not repeated here; it is already shown in
  // the dialog title ("Share \"<fileName>\"").
  const scenarios = {
    // ---- LOW AMBIGUITY, CANNOT SHARE (Scenario 1 / 3) ----------------
    "000": {
      fileName: "Project Atlas – Q3 Pricing.xlsx",
      modifiedLabel: "Just now",
      representation: "facts",
      shareAllowed: false,
      facts: [
        ["Project", "Project Atlas"],
        ["Classification", "Internal"],
        ["Recipient", "Jordan Lee"],
        ["Recipient status", "External collaborator"],
        ["Project membership", "Not a member"],
        ["Nondisclosure agreement", "None"],
        ["Policy", "Project files may be shared only with project members"],
        ["Exception", "None"]
      ],
      warrantText:
        "Jordan Lee is an external collaborator and is not a member of Project Atlas. This file is marked Internal and may be shared only with project members.",
      claim: "Do not share this file with Jordan Lee."
    },
    "010": {
      fileName: "Project Atlas – Q3 Pricing.xlsx",
      modifiedLabel: "Just now",
      representation: "warrant",
      shareAllowed: false,
      facts: [
        ["Project", "Project Atlas"],
        ["Classification", "Internal"],
        ["Recipient", "Jordan Lee"],
        ["Recipient status", "External collaborator"],
        ["Project membership", "Not a member"],
        ["Nondisclosure agreement", "None"],
        ["Policy", "Project files may be shared only with project members"],
        ["Exception", "None"]
      ],
      warrantText:
        "Jordan Lee is an external collaborator and is not a member of Project Atlas. This file is marked Internal and may be shared only with project members.",
      claim: "Do not share this file with Jordan Lee."
    },

    // ---- LOW AMBIGUITY, CAN SHARE (Scenario 2 / 4) -------------------
    "001": {
      fileName: "Project Atlas – Q3 Pricing.xlsx",
      modifiedLabel: "Just now",
      representation: "facts",
      shareAllowed: true,
      facts: [
        ["Project", "Project Atlas"],
        ["Classification", "Internal"],
        ["Recipient", "Jordan Lee"],
        ["Recipient status", "External collaborator"],
        ["Project membership", "Member"],
        ["Nondisclosure agreement", "None"],
        ["Policy", "Project files may be shared with project members"],
        ["Exception", "None"]
      ],
      warrantText:
        "Jordan Lee is an external collaborator and is a member of Project Atlas. This file is marked Internal and may be shared with project members.",
      claim: "Share this file with Jordan Lee."
    },
    "011": {
      fileName: "Project Atlas – Q3 Pricing.xlsx",
      modifiedLabel: "Just now",
      representation: "warrant",
      shareAllowed: true,
      facts: [
        ["Project", "Project Atlas"],
        ["Classification", "Internal"],
        ["Recipient", "Jordan Lee"],
        ["Recipient status", "External collaborator"],
        ["Project membership", "Member"],
        ["Nondisclosure agreement", "None"],
        ["Policy", "Project files may be shared with project members"],
        ["Exception", "None"]
      ],
      warrantText:
        "Jordan Lee is an external collaborator and is a member of Project Atlas. This file is marked Internal and may be shared with project members.",
      claim: "Share this file with Jordan Lee."
    },

    // ---- HIGH AMBIGUITY, CANNOT SHARE (Scenario 5 / 7) ---------------
    "100": {
      fileName: "Project Atlas – Q3 Pricing.xlsx",
      modifiedLabel: "Just now",
      representation: "facts",
      shareAllowed: false,
      facts: [
        ["Project", "Project Atlas"],
        ["Classification", "Confidential"],
        ["Recipient", "Jordan Lee"],
        ["Recipient status", "External collaborator"],
        ["Project membership", "Member"],
        ["Nondisclosure agreement", "Active"],
        ["Policy", "External collaborators may not access project files"],
        ["Exception", "Members with an active nondisclosure agreement may access Internal files as an exception to this policy"]
      ],
      warrantText:
        "Jordan Lee is an external collaborator, and external collaborators may not access project files unless they are a member of Project Atlas with an active nondisclosure agreement, in which case Internal files are an exception. However, this file is marked Confidential, so the exception does not apply.",
      claim: "Do not share this file with Jordan Lee."
    },
    "110": {
      fileName: "Project Atlas – Q3 Pricing.xlsx",
      modifiedLabel: "Just now",
      representation: "warrant",
      shareAllowed: false,
      facts: [
        ["Project", "Project Atlas"],
        ["Classification", "Confidential"],
        ["Recipient", "Jordan Lee"],
        ["Recipient status", "External collaborator"],
        ["Project membership", "Member"],
        ["Nondisclosure agreement", "Active"],
        ["Policy", "External collaborators may not access project files"],
        ["Exception", "Members with an active nondisclosure agreement may access Internal files as an exception to this policy"]
      ],
      warrantText:
        "Jordan Lee is an external collaborator, and external collaborators may not access project files unless they are a member of Project Atlas with an active nondisclosure agreement, in which case Internal files are an exception. However, this file is marked Confidential, so the exception does not apply.",
      claim: "Do not share this file with Jordan Lee."
    },

    // ---- HIGH AMBIGUITY, CAN SHARE (Scenario 6 / 8) ------------------
    "101": {
      fileName: "Project Atlas – Q3 Pricing.xlsx",
      modifiedLabel: "Just now",
      representation: "facts",
      shareAllowed: true,
      facts: [
        ["Project", "Project Atlas"],
        ["Classification", "Internal"],
        ["Recipient", "Jordan Lee"],
        ["Recipient status", "External collaborator"],
        ["Project membership", "Member"],
        ["Nondisclosure agreement", "Active"],
        ["Policy", "External collaborators may not access project files"],
        ["Exception", "Members with an active nondisclosure agreement may access Internal files as an exception to this policy"]
      ],
      warrantText:
        "Jordan Lee is an external collaborator, and external collaborators may not access project files unless they are a member of Project Atlas with an active nondisclosure agreement, in which case Internal files are an exception. This file is marked Internal, so the exception applies.",
      claim: "Share this file with Jordan Lee."
    },
    "111": {
      fileName: "Project Atlas – Q3 Pricing.xlsx",
      modifiedLabel: "Just now",
      representation: "warrant",
      shareAllowed: true,
      facts: [
        ["Project", "Project Atlas"],
        ["Classification", "Internal"],
        ["Recipient", "Jordan Lee"],
        ["Recipient status", "External collaborator"],
        ["Project membership", "Member"],
        ["Nondisclosure agreement", "Active"],
        ["Policy", "External collaborators may not access project files"],
        ["Exception", "Members with an active nondisclosure agreement may access Internal files as an exception to this policy"]
      ],
      warrantText:
        "Jordan Lee is an external collaborator, and external collaborators may not access project files unless they are a member of Project Atlas with an active nondisclosure agreement, in which case Internal files are an exception. This file is marked Internal, so the exception applies.",
      claim: "Share this file with Jordan Lee."
    }
  };

  /* =======================================================================
     3. URL PARAMS — determine the active condition
     ======================================================================= */
  function readBit(params, key) {
    const raw = params.get(key);
    if (raw === "0" || raw === "1") return raw;
    console.warn(`[vignette] URL parameter "${key}" missing or invalid ("${raw}"); defaulting to "0".`);
    return "0";
  }

  const urlParams = new URLSearchParams(window.location.search);
  const ambiguity = readBit(urlParams, "ambiguity");
  const warrant = readBit(urlParams, "warrant");
  const share = readBit(urlParams, "share");
  const debugMode = urlParams.get("debug") === "1";

  const conditionKey = `${ambiguity}${warrant}${share}`;
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
      warrant,
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
    dbgWarrant: document.getElementById("dbgWarrant"),
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

  function buildSecurityPanelContent() {
    el.securityPanelBody.innerHTML = "";

    if (scenario.representation === "facts") {
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
    } else {
      const p = document.createElement("p");
      p.className = "warrant-text";
      p.textContent = scenario.warrantText;
      el.securityPanelBody.appendChild(p);
    }
    // The recommendation/claim is intentionally not rendered — the panel
    // only presents the facts or narrative; `scenario.claim` and
    // `scenario.shareAllowed` remain as ground-truth data for logging
    // (see `overridden` in handleSend/handleDontShare) even though no
    // recommendation is shown to the participant.
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
    logEvent("message_displayed", { representation: scenario.representation, shareAllowed: scenario.shareAllowed });

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
    el.dbgWarrant.textContent = warrant;
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
