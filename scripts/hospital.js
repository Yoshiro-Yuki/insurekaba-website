const patientSelect = document.getElementById("patientSelect");
const uploadForm = document.getElementById("uploadForm");
const fileInput = document.getElementById("fileInput");
const uploadResult = document.getElementById("uploadResult");

// Load patients from backend
async function loadPatients() {
    try {
        const res = await fetch("/get-users"); // backend endpoint
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const users = await res.json();

        patientSelect.innerHTML = '<option value="">Select a patient</option>';
        users.forEach(u => {
            const opt = document.createElement("option");
            opt.value = u.walletAddress;
            opt.textContent = `${u.name} (${u.walletAddress})`;
            patientSelect.appendChild(opt);
        });
    } catch (err) {
        console.error("Failed to load users:", err);
        patientSelect.innerHTML = '<option value="">Failed to load patients</option>';
    }
}

// Handle file upload
uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const selectedWallet = patientSelect.value;
    if (!selectedWallet) {
        alert("Please select a patient first.");
        return;
    }

    const file = fileInput.files[0];
    if (!file) {
        alert("Please select a file to upload.");
        return;
    }

    const formData = new FormData();
    formData.append("recordfile", file);
    formData.append("walletAddress", selectedWallet);

    try {
        const res = await fetch("/upload-record", {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            uploadResult.textContent = `File uploaded successfully for ${selectedWallet}`;
            fileInput.value = "";
        } else {
            uploadResult.textContent = `Error: ${data.error}`;
        }
    } catch (err) {
        console.error(err);
        uploadResult.textContent = "Upload failed.";
    }
});

// Initialize
loadPatients();
