// ----------------------------------------------------------------
// LOGIN + ROLE-BASED REDIRECT (Realtime Database)
// ----------------------------------------------------------------

const formMsg = document.getElementById("formMsg");

function showMsg(text, type) {
  formMsg.textContent = text;
  formMsg.className = "form-msg " + type;
}

// Show a one-time message if we were redirected here after registering
// or after being bounced back for pending verification.
(function showRedirectMsg() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("registered") === "1") {
    showMsg("Account created! An administrator needs to verify your account before you can sign in. Check back soon.", "success");
  } else if (params.get("pending") === "1") {
    showMsg("Your account is still awaiting admin verification. Please check back later.", "error");
  }
})();

// If someone is already signed in, send them straight to the right dashboard
auth.onAuthStateChanged(async (user) => {
  if (user) {
    await routeToDashboard(user.uid, { silent: true });
  }
});

async function routeToDashboard(uid, opts = {}) {
  try {
    const snap = await db.ref("users/" + uid).get();
    if (!snap.exists()) {
      if (!opts.silent) showMsg("No profile found for this account. Contact your administrator.", "error");
      await auth.signOut();
      return;
    }
    const data = snap.val();
    const role = data.role;

    // Self-registered users start with verified:false and stay locked
    // out of their dashboard until an admin approves them. Accounts
    // created the old way (by an admin, with no "verified" field at
    // all) are treated as already verified, so nothing already
    // deployed breaks.
    if (role !== "admin" && data.verified === false) {
      showMsg("Your account hasn't been verified by an administrator yet. Please check back later.", "error");
      await auth.signOut();
      return;
    }

    if (role === "admin") {
      window.location.href = "admin.html";
    } else {
      window.location.href = "dashboard.html";
    }
  } catch (err) {
    console.error(err);
    if (!opts.silent) showMsg("Could not verify your account role. Please try again.", "error");
  }
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const btn = document.getElementById("loginBtn");

  btn.disabled = true;
  btn.textContent = "Signing in…";
  formMsg.className = "form-msg";

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    showMsg("Signed in — redirecting…", "success");
    await routeToDashboard(cred.user.uid);
  } catch (err) {
    console.error("Sign-in error:", err.code, err.message);
    let msg = `Sign-in failed (${err.code || "unknown error"}). Check your email and password.`;
    if (err.code === "auth/invalid-email") msg = "That email address looks invalid.";
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") msg = "No account matches those credentials.";
    if (err.code === "auth/wrong-password") msg = "Incorrect password.";
    if (err.code === "auth/too-many-requests") msg = "Too many attempts. Please wait and try again.";
    if (err.code === "auth/operation-not-allowed") msg = "Email/Password sign-in isn't enabled yet in Firebase Authentication settings.";
    if (err.code === "auth/network-request-failed") msg = "Network error reaching Firebase. Check your connection.";
    showMsg(msg, "error");
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
});
