// PopupFiles.js - Handles Claim Status Popup

// Use window object to avoid conflicts with other scripts
window.claimsAPI = window.claimsAPI || {};
window.claimsAPI.API_URL = "http://localhost:3000";
window.claimsAPI.userId = localStorage.getItem('userId');

// Get popup elements
const openPopupBtn = document.getElementById('openPopup-files');
const closePopupBtn = document.getElementById('closePopup');
const popup = document.getElementById('popup-file');
const claimStatusList = document.getElementById('claimStatusList');

// Open popup and fetch claim status
openPopupBtn.addEventListener('click', async () => {
    popup.style.display = 'flex';
    
    if (!window.claimsAPI.userId) {
        claimStatusList.innerHTML = '<li class="status error">Please log in first</li>';
        return;
    }
    
    // Show loading state
    claimStatusList.innerHTML = '<li class="status loading">Loading claims...</li>';
    
    try {
        // Fetch claims from API
        const response = await fetch(`${window.claimsAPI.API_URL}/get-claims/${window.claimsAPI.userId}?userId=${window.claimsAPI.userId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch claims');
        }
        
        const data = await response.json();
        
        // Display claims
        if (data.claims && data.claims.length > 0) {
            displayClaims(data.claims);
        } else {
            claimStatusList.innerHTML = '<li class="status none">No claims found</li>';
        }
        
    } catch (error) {
        console.error('Error fetching claims:', error);
        claimStatusList.innerHTML = '<li class="status error">Error loading claims. Please try again.</li>';
    }
});

// Close popup
closePopupBtn.addEventListener('click', () => {
    popup.style.display = 'none';
});

// Close popup when clicking outside
popup.addEventListener('click', (e) => {
    if (e.target === popup) {
        popup.style.display = 'none';
    }
});

// Display claims in the list
function displayClaims(claims) {
    claimStatusList.innerHTML = '';
    
    claims.forEach(claim => {
        const li = document.createElement('li');
        li.className = `status ${claim.status.toLowerCase()}`;
        
        // Format date
        const date = new Date(claim.created_at);
        const formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        // Create claim item HTML
        li.innerHTML = `
            <div class="claim-item">
                <div class="claim-header">
                    <span class="claim-id">Claim #${claim.id}</span>
                    <span class="claim-status status-${claim.status.toLowerCase()}">${claim.status}</span>
                </div>
                <div class="claim-details">
                    <p class="claim-description">${claim.details}</p>
                    <p class="claim-amount">Amount: ₱${parseFloat(claim.amount).toLocaleString()}</p>
                    <p class="claim-date">Submitted: ${formattedDate}</p>
                </div>
            </div>
        `;
        
        claimStatusList.appendChild(li);
    });
}

// Add some CSS for better styling
const style = document.createElement('style');
style.textContent = `
    .claim-item {
        background: #f9f9f9;
        padding: 15px;
        margin: 10px 0;
        border-radius: 8px;
        border-left: 4px solid #ddd;
    }
    
    .claim-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }
    
    .claim-id {
        font-weight: bold;
        color: #333;
    }
    
    .claim-status {
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 0.85em;
        font-weight: bold;
        text-transform: uppercase;
    }
    
    .status-pending {
        background: #fff3cd;
        color: #856404;
    }
    
    .status-approved {
        background: #d4edda;
        color: #155724;
    }
    
    .status-denied {
        background: #f8d7da;
        color: #721c24;
    }
    
    .status-paid {
        background: #d1ecf1;
        color: #0c5460;
    }
    
    .claim-details {
        color: #666;
        font-size: 0.9em;
    }
    
    .claim-description {
        margin: 8px 0;
        color: #333;
    }
    
    .claim-amount {
        font-weight: bold;
        color: #28a745;
        margin: 5px 0;
    }
    
    .claim-date {
        font-size: 0.85em;
        color: #999;
    }
    
    .status.loading,
    .status.none,
    .status.error {
        text-align: center;
        padding: 20px;
        color: #666;
    }
    
    .status.error {
        color: #dc3545;
    }
`;
document.head.appendChild(style);