// Your deployed Google Apps Script Web App URL
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw1RW7uYFfPhUhbJ1RhZlohJBpZJkusVt5kG6jvX8knyZUUWj9-dqc7DvI_gZQmsDvcPw/exec";

/* -----------------------------------------------------------
   Theme
----------------------------------------------------------- */
const THEME_KEY = "decrypt-theme";
const themeToggle = document.getElementById("theme-toggle");

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  themeToggle.setAttribute("aria-pressed", theme === "light");
  themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) { applyTheme(saved); return; }
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  applyTheme(prefersLight ? "light" : "dark");
}

themeToggle.addEventListener("click", () => {
  const next = document.body.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

initTheme();

/* -----------------------------------------------------------
   Main Navigation Tabs (Compose vs History)
----------------------------------------------------------- */
const navTabs = document.querySelectorAll(".nav-tabs .segment");
const views = document.querySelectorAll(".app-view");

navTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    // Update active tab styles
    navTabs.forEach(t => {
      t.classList.remove("is-active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("is-active");
    tab.setAttribute("aria-selected", "true");

    // Show correct view
    const targetId = tab.dataset.view;
    views.forEach(view => {
      if (view.id === targetId) {
        view.style.display = view.id === "history-view" ? "block" : "grid";
        // Force reflow for animation
        void view.offsetWidth; 
        view.classList.add("is-active");
      } else {
        view.style.display = "none";
        view.classList.remove("is-active");
      }
    });

    // Fetch history if opening history tab
    if (targetId === "history-view") {
      loadHistory();
    }
  });
});

/* -----------------------------------------------------------
   Segmented control (audience)
----------------------------------------------------------- */
const audienceSegments = document.querySelectorAll(".audience-tabs .segment");
const targetFilter = document.getElementById("target-filter");

audienceSegments.forEach(segment => {
  segment.addEventListener("click", () => {
    audienceSegments.forEach(s => {
      s.classList.remove("is-active");
      s.setAttribute("aria-checked", "false");
    });
    segment.classList.add("is-active");
    segment.setAttribute("aria-checked", "true");
    targetFilter.value = segment.dataset.value;
  });
});

/* -----------------------------------------------------------
   Token chips — insert at cursor position
----------------------------------------------------------- */
const emailBody = document.getElementById("email-body");

document.querySelectorAll(".token-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const token = chip.dataset.token;
    const start = emailBody.selectionStart ?? emailBody.value.length;
    const end = emailBody.selectionEnd ?? emailBody.value.length;
    const before = emailBody.value.slice(0, start);
    const after = emailBody.value.slice(end);

    emailBody.value = before + token + after;
    const cursor = start + token.length;
    emailBody.focus();
    emailBody.setSelectionRange(cursor, cursor);
  });
});

/* -----------------------------------------------------------
   Confirm modal
----------------------------------------------------------- */
const modal = document.getElementById("confirm-modal");
const modalBackdrop = document.getElementById("modal-backdrop");
const modalCancel = document.getElementById("modal-cancel");
const modalConfirm = document.getElementById("modal-confirm");

function openModal() {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  modalBackdrop.classList.add("is-visible");
  modalBackdrop.setAttribute("aria-hidden", "false");
  modalConfirm.focus();
}

function closeModal() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  modalBackdrop.classList.remove("is-visible");
  modalBackdrop.setAttribute("aria-hidden", "true");
}

modalCancel.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
});

/* -----------------------------------------------------------
   Stepper
----------------------------------------------------------- */
const steps = {
  queued: document.querySelector('.step[data-step="queued"]'),
  sending: document.querySelector('.step[data-step="sending"]'),
  done: document.querySelector('.step[data-step="done"]')
};
const statusSummary = document.getElementById("status-summary");
const statusNote = document.getElementById("status-note");

function setStep(name, summary, note) {
  Object.entries(steps).forEach(([key, el]) => {
    el.classList.remove("is-active", "is-done");
  });

  const order = ["queued", "sending", "done"];
  const idx = order.indexOf(name);
  order.forEach((key, i) => {
    if (i < idx) steps[key].classList.add("is-done");
    if (i === idx) steps[key].classList.add("is-active");
  });

  if (summary) statusSummary.textContent = summary;
  if (note) statusNote.textContent = note;
}

/* -----------------------------------------------------------
   Dispatch flow
----------------------------------------------------------- */
const form = document.getElementById("bulk-form");
const dispatchBtn = document.getElementById("dispatch-btn");
const btnLabel = dispatchBtn.querySelector(".btn-label");

form.addEventListener("submit", e => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  openModal();
});

modalConfirm.addEventListener("click", async () => {
  closeModal();

  dispatchBtn.disabled = true;
  btnLabel.textContent = "Dispatching…";
  setStep("sending", "Sending in progress.", "Looping through sheet rows — this may take a minute depending on list size.");

  const payload = {
    action: "bulk_email",
    targetFilter: targetFilter.value,
    subject: document.getElementById("email-subject").value,
    htmlBody: emailBody.value
  };

  try {
    // Note: Leaving mode as 'no-cors' means the browser can't read the return value, 
    // but Apps Script will still execute the loop and save to the Campaigns sheet.
    await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    setStep("done", "Dispatch complete.", "Emails have been processed and logged to the Campaigns sheet.");
    btnLabel.textContent = "Dispatch complete";
    form.reset();

    setTimeout(() => {
      dispatchBtn.disabled = false;
      btnLabel.textContent = "Dispatch to audience";
      setStep("queued", "Ready for next broadcast.", "Draft your message on the left.");
    }, 4000);

  } catch (err) {
    setStep("queued", "Dispatch failed.", "An error occurred during transmission. Check Apps Script execution logs.");
    dispatchBtn.disabled = false;
    btnLabel.textContent = "Retry dispatch";
  }
});

/* -----------------------------------------------------------
   History Fetching Logic
----------------------------------------------------------- */
const refreshBtn = document.getElementById('refresh-history-btn');
const historyBody = document.getElementById('history-body');

refreshBtn.addEventListener("click", loadHistory);

async function loadHistory() {
  historyBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; color:var(--text-tertiary);">Fetching logs from database...</td></tr>';
  
  try {
    const response = await fetch(`${SCRIPT_URL}?action=get_campaigns`);
    const data = await response.json();
    
    if (!data.campaigns || data.campaigns.length === 0) {
      historyBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; color:var(--text-tertiary);">No campaigns sent yet.</td></tr>';
      return;
    }

    historyBody.innerHTML = data.campaigns.map(camp => `
      <tr>
        <td>
          <span class="strong">${camp.date.split(' ')[0]}</span>
          <span class="sub">${camp.date.split(' ')[1]}</span>
        </td>
        <td title="Sent to filter: ${camp.target}">
          <span class="strong">${camp.subject}</span>
          <span class="sub">ID: ${camp.id}</span>
        </td>
        <td><span class="stat-badge">${camp.sent}</span></td>
        <td title="Opened by:\n${camp.openedBy || 'None yet'}">
          <span class="stat-badge highlight">${camp.opens}</span>
        </td>
        <td class="rate-text">${camp.openRate}</td>
      </tr>
    `).join('');
  } catch (err) {
    historyBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; color:var(--danger);">Failed to load history. Ensure your Google Script is deployed with the get_campaigns action.</td></tr>';
  }
}