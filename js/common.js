// ----------------------------------------------------------------
// SHARED HELPERS — route guarding, formatting, sidebar nav wiring
// ----------------------------------------------------------------

/**
 * Ensures a user is signed in AND has the expected role before showing
 * a dashboard. Redirects to login if not. Calls onReady(userDoc) once verified.
 */
function guardRoute(expectedRole, onReady) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    try {
      const snap = await db.ref("users/" + user.uid).get();
      if (!snap.exists() || snap.val().role !== expectedRole) {
        const role = snap.exists() ? snap.val().role : null;
        if (role === "admin") window.location.href = "admin.html";
        else if (role === "user") window.location.href = "dashboard.html";
        else { await auth.signOut(); window.location.href = "index.html"; }
        return;
      }
      // A self-registered user who is still unverified shouldn't be able
      // to land on the dashboard just by having a valid session (e.g. a
      // page refresh) — kick them back to the login screen with a note.
      if (expectedRole === "user" && snap.val().verified === false) {
        await auth.signOut();
        window.location.href = "index.html?pending=1";
        return;
      }
      onReady({ uid: user.uid, ...snap.val() });
    } catch (err) {
      console.error(err);
      window.location.href = "index.html";
    }
  });
}

function wireSignOut(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    await auth.signOut();
    window.location.href = "index.html";
  });
}

function wireSidebarNav() {
  const items = document.querySelectorAll(".nav-item");
  const views = document.querySelectorAll(".view");
  items.forEach((item) => {
    item.addEventListener("click", () => {
      items.forEach((i) => i.classList.remove("active"));
      views.forEach((v) => v.classList.remove("active"));
      item.classList.add("active");
      document.getElementById(item.dataset.view).classList.add("active");
    });
  });
}

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function timeAgo(date) {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const units = [
    ["year", 31536000], ["month", 2592000], ["day", 86400],
    ["hour", 3600], ["minute", 60]
  ];
  for (const [label, secs] of units) {
    const val = Math.floor(seconds / secs);
    if (val >= 1) return `${val} ${label}${val > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ----------------------------------------------------------------
// PERMISSIONS — shared between admin.js (setting them) and
// user.js (reacting to them). Missing keys default to ON (true) so
// existing users created before this feature keep working.
// ----------------------------------------------------------------
const PERMISSION_KEYS = ["read", "write", "update", "delete", "execute"];

function normalizePermissions(raw) {
  const p = raw || {};
  const out = {};
  PERMISSION_KEYS.forEach((k) => { out[k] = p[k] !== false; });
  return out;
}

function defaultPermissions() {
  return { read: true, write: true, update: true, delete: true, execute: true };
}
