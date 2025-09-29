// ------------------------
// File Upload
// ------------------------
const uploadForm = document.getElementById('uploadForm');
const uploadResult = document.getElementById('uploadResult');

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Get user ID from localStorage
  const userId = localStorage.getItem('userId');
  if (!userId) {
    uploadResult.textContent = 'Please log in first.';
    uploadResult.style.color = 'orange';
    return;
  }

  // Create FormData and append userId
  const formData = new FormData(uploadForm);
  formData.append('userId', userId);

  console.log('Attempting upload with userId:', userId);
  uploadResult.textContent = 'Uploading...';
  uploadResult.style.color = 'blue';

  try {
    const res = await fetch('http://localhost:3000/upload-record', {
      method: 'POST',
      body: formData
    });
    
    console.log('Response status:', res.status);
    const data = await res.json();
    console.log('Response data:', data);

    if (res.ok) {
      uploadResult.textContent = `Success! File: ${data.originalFilename}`;
      uploadResult.style.color = 'green';
      loadRecords();
      updateFileDropdown();
      uploadForm.reset();
    } else {
      uploadResult.textContent = `Error: ${data.error}`;
      uploadResult.style.color = 'red';
    }
  } catch (err) {
    console.error('Upload error:', err);
    uploadResult.textContent = `Error uploading file: ${err.message}`;
    uploadResult.style.color = 'red';
  }
});

// ------------------------
// Update file dropdown
// ------------------------
function updateFileDropdown() {
  const userId = localStorage.getItem('userId');
  if (!userId) {
    console.log('No userId found, skipping dropdown update');
    return;
  }

  const select = document.getElementById('attachedFileHashes');
  select.innerHTML = '<option value="">Select files to attach (hold Ctrl/Cmd for multiple)</option>';

  // Add userId as query parameter for authentication
  fetch(`http://localhost:3000/get-records/${userId}?userId=${userId}`)
    .then(res => {
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      if (data.records && data.records.length > 0) {
        data.records.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.hash;
          opt.textContent = `${r.original_filename} (${new Date(r.uploaded_at).toLocaleDateString()})`;
          select.appendChild(opt);
        });
      }
    })
    .catch(err => console.error('Error loading records for dropdown:', err));
}

// ------------------------
// Claim Submission
// ------------------------
const claimForm = document.getElementById('claimForm');
const claimResult = document.getElementById('claimResult');

claimForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Auto-fill userId
  const userId = localStorage.getItem('userId');
  if (!userId) {
    claimResult.textContent = 'Please log in first.';
    claimResult.style.color = 'orange';
    return;
  }

  const select = claimForm.attachedFileHashes;
  const selectedHashes = Array.from(select.selectedOptions)
    .map(option => option.value)
    .filter(hash => hash !== '');

  const formData = {
    userId: userId,
    details: claimForm.details.value,
    attachedFileHashes: selectedHashes
  };

  console.log('Submitting claim:', formData);
  claimResult.textContent = 'Submitting...';
  claimResult.style.color = 'blue';

  try {
    const res = await fetch('http://localhost:3000/submit-claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const data = await res.json();

    if (res.ok) {
      claimResult.textContent = `Claim submitted! ID: ${data.claimId}, Status: ${data.status}`;
      claimResult.style.color = 'green';
      loadClaims();
      claimForm.reset();
    } else {
      claimResult.textContent = `Error: ${data.error}`;
      claimResult.style.color = 'red';
    }
  } catch (err) {
    console.error(err);
    claimResult.textContent = `Error submitting claim: ${err.message}`;
    claimResult.style.color = 'red';
  }
});

// ------------------------
// Fetch and display all records
// ------------------------
async function loadRecords() {
  try {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      document.getElementById('recordsList').innerHTML = '<li style="color: orange;">Please log in first.</li>';
      return;
    }

    console.log('Fetching records for userId:', userId);
    
    // Add userId as query parameter for authentication
    const res = await fetch(`http://localhost:3000/get-records/${userId}?userId=${userId}`);
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Server error:', res.status, errorData);
      document.getElementById('recordsList').innerHTML = `<li style="color: red;">Error: ${errorData.error || 'Failed to load records'}</li>`;
      return;
    }
    
    const data = await res.json();
    console.log('Records received:', data);
    
    const list = document.getElementById('recordsList');
    
    if (!data.records || data.records.length === 0) {
      list.innerHTML = '<li style="color: gray;">No records uploaded yet.</li>';
      return;
    }
    
    list.innerHTML = '';
    data.records.forEach(r => {
      const li = document.createElement('li');
      const uploadDate = new Date(r.uploaded_at).toLocaleString();
      const hashPreview = r.hash.substring(0, 16);
      const fileSize = (r.file_size / 1024).toFixed(2);
      
      li.innerHTML = `
        <strong>${r.original_filename}</strong><br>
        Hash: ${hashPreview}...<br>
        Size: ${fileSize} KB | Uploaded: ${uploadDate}<br>
        Status: <span style="color: ${r.verification_status === 'verified' ? 'green' : 'orange'}">${r.verification_status}</span>
        ${r.blockchain_tx_hash ? '<br>✓ Blockchain verified' : ''}
      `;
      li.style.marginBottom = '15px';
      li.style.padding = '10px';
      li.style.border = '1px solid #ddd';
      li.style.borderRadius = '5px';
      li.style.backgroundColor = '#f9f9f9';
      list.appendChild(li);
    });
  } catch (err) {
    console.error('Error loading records:', err);
    document.getElementById('recordsList').innerHTML = '<li style="color: red;">Failed to connect to server. Make sure the server is running.</li>';
  }
}

// ------------------------
// Fetch and display all claims
// ------------------------
async function loadClaims() {
  try {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      document.getElementById('claimsList').innerHTML = '<li style="color: orange;">Please log in first.</li>';
      return;
    }

    console.log('Fetching claims for userId:', userId);
    const res = await fetch(`http://localhost:3000/get-claims/${userId}?userId=${userId}`);
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Server error:', res.status, errorData);
      document.getElementById('claimsList').innerHTML = `<li style="color: red;">Error: ${errorData.error || 'Failed to load claims'}</li>`;
      return;
    }
    
    const data = await res.json();
    console.log('Claims received:', data);
    
    const list = document.getElementById('claimsList');
    
    if (!data.claims || data.claims.length === 0) {
      list.innerHTML = '<li style="color: gray;">No claims submitted yet.</li>';
      return;
    }
    
    list.innerHTML = '';
    data.claims.forEach(c => {
      const li = document.createElement('li');
      const createdDate = new Date(c.created_at).toLocaleString();
      const statusColor = c.status === 'Approved' ? 'green' : 
                         c.status === 'Denied' ? 'red' : 
                         c.status === 'Paid' ? 'blue' : 'orange';
      
      li.innerHTML = `
        <strong>Claim #${c.id}</strong><br>
        Details: ${c.details}<br>
        Amount: ₱${c.amount || 0}<br>
        Status: <span style="color: ${statusColor}; font-weight: bold;">${c.status}</span><br>
        Submitted: ${createdDate}
      `;
      li.style.marginBottom = '15px';
      li.style.padding = '10px';
      li.style.border = '1px solid #ddd';
      li.style.borderRadius = '5px';
      li.style.backgroundColor = '#f9f9f9';
      list.appendChild(li);
    });
  } catch (err) {
    console.error('Error loading claims:', err);
    document.getElementById('claimsList').innerHTML = '<li style="color: red;">Failed to connect to server. Make sure the server is running.</li>';
  }
}

// ------------------------
// Load data on page load
// ------------------------
window.addEventListener('DOMContentLoaded', () => {
  console.log('Page loaded, checking for userId...');
  const userId = localStorage.getItem('userId');
  
  if (!userId) {
    console.warn('No userId found in localStorage. User needs to log in.');
    document.getElementById('recordsList').innerHTML = '<li style="color: orange;">Please log in to view your records. <br><small>For testing: Open console (F12) and run: localStorage.setItem("userId", "1")</small></li>';
    document.getElementById('claimsList').innerHTML = '<li style="color: orange;">Please log in to view your claims.</li>';
  } else {
    console.log('UserId found:', userId);
    loadRecords();
    updateFileDropdown();
    loadClaims();
  }
});