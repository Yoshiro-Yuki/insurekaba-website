const claimsContainer = document.getElementById("claims-container");
const claimsCount = document.getElementById("claims-count");

// Hardcoded fallback claims
const hardcodedClaims = [
  
];

// Render a single claim
function renderClaim(claim) {
  const claimBox = document.createElement("div");
  claimBox.className = "claim";
  claimBox.id = `claim-${claim.id}`;

  const filesHtml = claim.files && claim.files.length
    ? `<ul>${claim.files.map(f => `<li><a href="../uploads/${f}" target="_blank">${f}</a></li>`).join("")}</ul>`
    : `<p>No attached files</p>`;

  claimBox.innerHTML = `
    <p><strong>Claim ID:</strong> ${claim.id}</p>
    <p><strong>User:</strong> ${claim.userId}</p>
    <p><strong>Details:</strong> ${claim.details}</p>
    <p><strong>Status:</strong> ${claim.status}</p>
    <p><strong>Attached Files:</strong></p>
    ${filesHtml}
    <label for="reason-${claim.id}">Reason:</label>
    <input type="text" id="reason-${claim.id}" placeholder="Enter reason">
    <div class="actions" id="actions-${claim.id}">
      <button onclick="confirmAction('verify', ${claim.id})">Verify</button>
      <button onclick="confirmAction('reject', ${claim.id})">Reject</button>
    </div>
  `;
  claimsContainer.appendChild(claimBox);
}

// Confirmation + send to backend
function confirmAction(action, claimId) {
  const reasonInput = document.getElementById(`reason-${claimId}`);
  const reason = reasonInput ? reasonInput.value.trim() : "";

  if (confirm(`Are you sure you want to ${action} claim #${claimId}?`)) {
    fetch("/update-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId, action, reason })
    })
    .then(res => res.json())
    .then(data => {
      alert(`Claim #${claimId} ${action}ed!`);
      const claimBox = document.getElementById(`claim-${claimId}`);
      if (claimBox) claimBox.remove();
      updateCount();
    })
    .catch(err => {
      console.error("Error updating claim:", err);
      alert("Failed to update claim. Check console.");
    });
  }
}

// Update total claims count
function updateCount() {
  const count = document.querySelectorAll(".claim").length;
  claimsCount.textContent = `Total Claims: ${count}`;
}

// Load claims from backend + fallback hardcoded
async function loadClaims() {
  hardcodedClaims.forEach(renderClaim);

  try {
    const res = await fetch("/get-all-claims");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    data.forEach(claim => {
      claim.files = claim.files || [];
      renderClaim(claim);
    });
  } catch (err) {
    console.error("Failed to fetch claims:", err);
  }

  updateCount();
}

loadClaims();
