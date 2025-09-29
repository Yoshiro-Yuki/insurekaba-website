const API_BASE = "http://localhost:3000"; // backend base URL

// ===== LOGIN HANDLER =====
document.getElementById("loginForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const walletAddress = document.getElementById("wallet").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!walletAddress || !password) {
    alert("Please enter wallet address and password");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Send walletAddress for authentication (backend checks for 0x prefix)
      body: JSON.stringify({
        walletAddress,
        password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || "Login failed");
      return;
    }

    // Save session info
    localStorage.setItem("userId", data.userId);
    localStorage.setItem("walletAddress", data.walletAddress);
    localStorage.setItem("role", data.role);

    // Redirect by role
    switch (data.role) {
      case "admin-philhealth":
        window.location.href = "pages/admin.html";
        break;
      case "admin-hospital":
        window.location.href = "pages/hospital.html";
        break;
      case "user":
        window.location.href = "pages/guest.html";
        break;
      default:
        alert("Unknown role: " + data.role);
    }

  } catch (err) {
    console.error("Login error:", err);
    alert("Server error. Try again later.");
  }
});

// ===== CREATE ACCOUNT HANDLER =====
document.getElementById("createAccountBtn").addEventListener("click", async function () {
  const walletAddress = document.getElementById("wallet").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!walletAddress || !password) {
    alert("Please enter wallet address and password to create account");
    return;
  }

  // Validate wallet address format (basic check)
  if (!walletAddress.startsWith('0x') || walletAddress.length !== 42) {
    alert("Please enter a valid Ethereum wallet address");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/create-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Send exactly what backend expects: email, walletAddress, password
      body: JSON.stringify({
        email: walletAddress + "@wallet.local", // Use wallet as email since backend requires it
        walletAddress,
        password,
        role: "user",
        name: "User " + walletAddress.slice(-6) // Generate a display name
      })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || "Account creation failed");
      return;
    }

    alert("Account created successfully! You can now log in.");

  } catch (err) {
    console.error("Create account error:", err);
    alert("Server error. Try again later.");
  }
});