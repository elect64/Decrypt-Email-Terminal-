// Your deployed Google Apps Script Web App URL
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyxmQTZXXAnZj22he76o02R4DYK44sgZFPGQK0j0SaScauSu9rs7_xrCxOKyMoTfz8zZQ/exec";

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

let campaignChartInstance = null; // Track chart instance to prevent duplication bugs

async function loadHistory() {
  historyBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px; color:var(--text-tertiary);">Fetching logs from database...</td></tr>';
  
  try {
    const response = await fetch(`${SCRIPT_URL}?action=get_campaigns`);
    const data = await response.json();
    
    if (!data.campaigns || data.campaigns.length === 0) {
      historyBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px; color:var(--text-tertiary);">No campaigns sent yet.</td></tr>';
      return;
    }

    // 1. Populate Table Rows (Existing logic)
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
          <span class="stat-badge highlight">${camp.opens} (${camp.openRate})</span>
        </td>
        <td title="Clicked by:\n${camp.clickedBy || 'None yet'}">
          <span class="stat-badge" style="background: rgba(51, 227, 156, 0.2); color: var(--accent);">${camp.clicks}</span>
        </td>
        <td class="rate-text">${camp.ctr}</td>
      </tr>
    `).join('');

    // 2. Render Graphical Chart (New logic)
    renderCampaignChart(data.campaigns.reverse()); // Reverse to show chronological order left-to-right

  } catch (err) {
    historyBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px; color:var(--danger);">Failed to load history. Ensure your Google Script is deployed properly.</td></tr>';
  }
}

function renderCampaignChart(campaigns) {
  const ctx = document.getElementById('campaignChart').getContext('2d');
  
  // Extract labels (Subjects or IDs) and metrics datasets
  const labels = campaigns.map(c => c.subject.length > 20 ? c.subject.substring(0, 20) + '...' : c.subject);
  const sentData = campaigns.map(c => c.sent);
  const opensData = campaigns.map(c => c.opens);
  const clicksData = campaigns.map(c => c.clicks);

  // Destroy previous instance if it exists to prevent overlapping redraws
  if (campaignChartInstance) {
    campaignChartInstance.destroy();
  }

  // Detect current theme colors for chart text styling
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#8CA398' : '#5C6E63';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(6, 15, 10, 0.05)';

  campaignChartInstance = new Chart(ctx, {
    type: 'bar', // Can be changed to 'line' for trend lines
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Sent',
          data: sentData,
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(6, 15, 10, 0.1)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(6, 15, 10, 0.2)',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Opens',
          data: opensData,
          backgroundColor: '#33E39C',
          borderRadius: 4
        },
        {
          label: 'Clicks',
          data: clicksData,
          backgroundColor: '#38BDF8', // Sky blue accent for clicks
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: textColor, font: { family: 'JetBrains Mono', size: 11 } }
        },
        tooltip: {
          backgroundColor: isDark ? '#0D1712' : '#FFFFFF',
          titleColor: isDark ? '#F2F7F4' : '#0B140F',
          bodyColor: textColor,
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 10 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 10 }, precision: 0 }
        }
      }
    }
  });
}

/* -----------------------------------------------------------
   Aside Tabs (Preview vs Status)
----------------------------------------------------------- */
const asideTabs = document.querySelectorAll(".aside-tabs .segment");
const asidePanes = document.querySelectorAll(".aside-pane");

asideTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    asideTabs.forEach(t => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    asidePanes.forEach(pane => {
      pane.style.display = pane.id === tab.dataset.pane ? "flex" : "none";
    });
  });
});

/* -----------------------------------------------------------
   Live Preview Engine
----------------------------------------------------------- */
const previewFrame = document.getElementById("email-preview-frame");
const inputBanner = document.getElementById("banner-url");
const inputBody = document.getElementById("email-body");
const inputImage = document.getElementById("image-url");

function updatePreview() {
  const rawText = inputBody.value || "Hey [Name],\n\nStart typing to preview your email...";
  
  // Format paragraphs
  const formattedParagraphs = rawText.split('\n')
    .map(p => p.trim() ? `<p style="margin-bottom:16px;">${p}</p>` : '')
    .join('');

  // Format Dynamic Tags for preview purposes
  const previewContent = formattedParagraphs
    .replace(/{{Name}}/g, "<span style='color:#3ED97A;'>Alex</span>")
    .replace(/{{AccessCode}}/g, "<span style='color:#3ED97A;'>DEC2.O-X8B9Q</span>");

  const bannerUrl = inputBanner.value;
  const bannerHtml = bannerUrl 
    ? `<img src="${bannerUrl}" style="width:100%; display:block; border-bottom:1px solid #1A4D23;" />`
    : `<div style="background-color:#1A4D23; padding:2px;"></div>`;

  const imageUrl = inputImage.value;
  const imageHtml = imageUrl 
    ? `<div style="margin:25px 0; text-align:center;"><img src="${imageUrl}" style="max-width:100%; border-radius:8px; border:1px solid #1A4D23;" /></div>`
    : ``;

  const html = `
    <html><body style="margin:0; padding:0; background-color:#050D08;">
      <div style="background-color:#050D08; padding:20px 10px; font-family:'Courier New', Courier, monospace; color:#E8F5EC;">
        <div style="max-width:560px; margin:0 auto; background-color:#0A1C10; border:1px solid #1A4D23; border-radius:12px; overflow:hidden;">
          ${bannerHtml}
          <div style="padding:32px 36px;">
            <p style="margin:0 0 20px 0; color:#3ED97A; font-size:11px; letter-spacing:3px; font-weight:700; text-transform:uppercase;">DECRYPT 2.0 UPDATE</p>
            <div style="font-size:14px; line-height:1.7; color:#E8F5EC;">
              ${previewContent}
            </div>
            ${imageHtml}
            <hr style="border:0; border-top:1px dashed #1A4D23; margin:30px 0 20px 0;" />
            <p style="font-size:11px; color:#6B7D71; margin:0; text-align:center; letter-spacing:1px;">
              Knowledge should not stay locked.<br><br>DECRYPT 2.0 • OCTOBER 2026
            </p>
          </div>
        </div>
      </div>
    </body></html>
  `;
  
  const doc = previewFrame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
}

// Attach event listeners to update the preview on typing
[inputBanner, inputBody, inputImage].forEach(el => {
  el.addEventListener('input', updatePreview);
});

// Initial render
updatePreview();

/* -----------------------------------------------------------
   Updated Payload Builder (Inside modalConfirm.addEventListener)
----------------------------------------------------------- */
// Find your payload object inside the modalConfirm click listener and update it to this:
  const payload = {
    action: "bulk_email",
    targetFilter: targetFilter.value,
    subject: document.getElementById("email-subject").value,
    htmlBody: emailBody.value,
    bannerUrl: inputBanner.value,  // NEW
    imageUrl: inputImage.value     // NEW
  };