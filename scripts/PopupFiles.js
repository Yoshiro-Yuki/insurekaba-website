const popupFile = document.getElementById("popup-file");
const openFileBtn = document.getElementById("openPopup-files");
const closeFileBtn = document.getElementById("closePopup");
const fileInput = document.getElementById("fileInput");
const fileNameDisplay = document.getElementById("fileName");

// Open popup
openFileBtn.addEventListener("click", () => {
    popupFile.classList.add("active");
});

// Close popup
closeFileBtn.addEventListener("click", () => {
    popupFile.classList.remove("active");
});

// Handle file input
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileNameDisplay.textContent = file ? `Selected file: ${file.name}` : "";
});
