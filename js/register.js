// ----------------------------------------------------------------
// SELF-REGISTRATION — user creates their own account. The database
// node for them is created automatically at registration time, but
// with verified:false so they can't reach the dashboard until an
// admin approves them from Manage Users / Pending Approvals.
// ----------------------------------------------------------------

const formMsg = document.getElementById("formMsg");

function showMsg(text, type) {
  formMsg.textContent = text;
  formMsg.className = "form-msg " + type;
}

// If someone lands here already signed in, just bounce them to the
// normal login flow so the role/verification check there can decide.
auth.onAuthStateChanged((user) => {
  if (user) {
    window.location.href = "index.html";
  }
});

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("registerBtn");
  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  formMsg.className = "form-msg";

  if (password !== confirmPassword) {
    showMsg("Passwords don't match.", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Creating account…";

  let cred;
  try {
    // Step 1: create the auth account. This signs the browser in as
    // the new user, which is exactly what we need to write their own
    // users/<uid> node under the database rules.
    cred = await auth.createUserWithEmailAndPassword(email, password);
  } catch (err) {
    console.error("Registration error:", err.code, err.message);
    let text = `Couldn't create your account (${err.code || "unknown error"}).`;
    if (err.code === "auth/email-already-in-use") text = "That email is already registered. Try signing in instead.";
    if (err.code === "auth/invalid-email") text = "That email address looks invalid.";
    if (err.code === "auth/weak-password") text = "Password should be at least 6 characters.";
    if (err.code === "auth/operation-not-allowed") text = "Email/Password sign-in isn't enabled yet in Firebase Authentication settings.";
    if (err.code === "auth/network-request-failed") text = "Network error reaching Firebase. Check your connection.";
    showMsg(text, "error");
    btn.disabled = false;
    btn.textContent = "Create account";
    return;
  }

  const uid = cred.user.uid;

  try {
    // Step 2: automatically create their users/<uid> node. Always
    // role "user" and verified:false — only an admin can change either
    // of those from here on (see Manage Users / Pending Approvals).
    await db.ref("users/" + uid).set({
      email,
      fullName,
      role: "user",
      dob: "",
      bio: "",
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      verified: false,
      permissions: defaultPermissions(),
    });
  } catch (err) {
    console.error("Database write error:", err.code, err.message);
    showMsg(
      "Your login was created, but saving your profile failed. Please contact an administrator for help.",
      "error"
    );
    btn.disabled = false;
    btn.textContent = "Create account";
    return;
  }

  // Sign the new (unverified) account out immediately — they shouldn't
  // stay signed in until an admin verifies them.
  await auth.signOut();

  window.location.href = "index.html?registered=1";
});
