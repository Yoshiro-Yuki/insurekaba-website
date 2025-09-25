const popupProfile = document.getElementById("popup-profile");
const openProfileBtn = document.getElementById("openPopup-profile");
const closeProfileBtn = document.getElementById("closePopup-profile");

// Open popup
openProfileBtn.addEventListener("click", () => {
    popupProfile.classList.add("active");
});

// Close popup
closeProfileBtn.addEventListener("click", () => {
    popupProfile.classList.remove("active");
});
