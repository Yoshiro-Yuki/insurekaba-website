// PopupProfile.js - Handles Profile Popup

// Use window object to avoid conflicts with other scripts
window.profileAPI = window.profileAPI || {};
window.profileAPI.API_URL = "http://localhost:3000";
window.profileAPI.userId = localStorage.getItem('userId');

// Get popup elements
const openProfileBtn = document.getElementById('openPopup-profile');
const closeProfileBtn = document.getElementById('closePopup-profile');
const profilePopup = document.getElementById('popup-profile');

// Get profile text elements
const profileTexts = document.querySelectorAll('.text-popup.info');

// Open popup and fetch profile
openProfileBtn.addEventListener('click', async () => {
    profilePopup.style.display = 'block';
    
    if (!window.profileAPI.userId) {
        // If no userId, just show placeholder text instead of alert
        profileTexts.forEach(text => text.textContent = 'Not logged in');
        return;
    }
    
    // Show loading state
    profileTexts.forEach(text => {
        text.textContent = 'Loading...';
    });
    
    try {
        // Fetch profile from API
        const response = await fetch(`${window.profileAPI.API_URL}/get-profile/${window.profileAPI.userId}?userId=${window.profileAPI.userId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch profile');
        }
        
        const profile = await response.json();
        
        // Display profile information
        displayProfile(profile);
        
    } catch (error) {
        console.error('Error fetching profile:', error);
        profileTexts.forEach(text => text.textContent = 'Error loading profile');
    }
});

// Close popup
closeProfileBtn.addEventListener('click', () => {
    profilePopup.style.display = 'none';
});

// Close popup when clicking outside
profilePopup.addEventListener('click', (e) => {
    if (e.target === profilePopup) {
        profilePopup.style.display = 'none';
    }
});

// Display profile information
function displayProfile(profile) {
    const profileInfoElements = document.querySelectorAll('.text-popup.info');
    
    if (profileInfoElements.length >= 4) {
        profileInfoElements[0].textContent = `Username: ${profile.username || 'N/A'}`;
        profileInfoElements[1].textContent = `User ID: ${profile.id || 'N/A'}`;
        profileInfoElements[2].textContent = `Wallet Address: ${profile.walletAddress ? shortenAddress(profile.walletAddress) : 'N/A'}`;
        profileInfoElements[3].textContent = `Email: ${profile.email || 'N/A'}`;
    }
    
    addExtraProfileInfo(profile);
}

// Add extra profile information dynamically
function addExtraProfileInfo(profile) {
    let extraInfoDiv = document.querySelector('.extra-profile-info');
    
    if (!extraInfoDiv) {
        extraInfoDiv = document.createElement('div');
        extraInfoDiv.className = 'extra-profile-info';
        
        const closeBtn = document.getElementById('closePopup-profile');
        profilePopup.insertBefore(extraInfoDiv, closeBtn);
    }
    
    extraInfoDiv.innerHTML = '';
    
    const extraFields = [
        { label: 'Name', value: profile.name || 'Not set' },
        { label: 'Role', value: formatRole(profile.role) },
        { label: 'Hospital', value: profile.hospital_name || 'N/A' },
        { label: 'Token Balance', value: `${profile.token_balance || 0} tokens` },
        { label: 'Member Since', value: formatDate(profile.created_at) }
    ];
    
    extraFields.forEach(field => {
        const p = document.createElement('p');
        p.className = 'text-popup info';
        p.textContent = `${field.label}: ${field.value}`;
        extraInfoDiv.appendChild(p);
    });
}

// Helper functions
function shortenAddress(address) {
    if (!address) return 'N/A';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

function formatRole(role) {
    if (!role) return 'User';
    const roleMap = {
        'user': 'Patient',
        'admin-hospital': 'Hospital Admin',
        'admin-philhealth': 'PhilHealth Admin'
    };
    return roleMap[role] || role;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Add CSS dynamically with unique variable to avoid redeclaration
const profileStyle = document.createElement('style');
profileStyle.textContent = `
    .extra-profile-info {
        margin: 15px 0;
        padding: 10px 0;
        border-top: 1px solid #ddd;
    }
    
    .extra-profile-info .text-popup.info {
        margin: 8px 0;
        font-size: 0.95em;
    }
    
    .popup-profile {
        max-height: 80vh;
        overflow-y: auto;
    }
    
    .text-popup.info {
        color: white;
        line-height: 1.6;
    }
    
    .text-popup.prof {
        font-size: 1.5em;
        font-weight: bold;
        margin-bottom: 20px;
        color: #2c3e50;
    }
`;
document.head.appendChild(profileStyle);
