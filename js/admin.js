// ----------------------------------------------------------------
// ADMIN DASHBOARD (Realtime Database)
// ----------------------------------------------------------------

let adminUser = null;

guardRoute("admin", (userDoc) => {
  adminUser = userDoc;
  loadStats();
  loadUsersTable();
  loadPendingUsers();
  loadAllPostsAdmin();
  loadRecentPosts();
  loadAnnouncementsAdmin();
  loadRepliesAdmin();
  loadReportsAdmin();
});

wireSignOut("signOutBtn");
wireSidebarNav();

// ----------------------------------------------------------------
// SECONDARY FIREBASE APP — lets the admin create a new auth user
// without Firebase signing the admin OUT and INTO the new account.
// (createUserWithEmailAndPassword always signs in as the created user
// on whichever app instance it's called on, so we isolate it here.)
// ----------------------------------------------------------------
const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = secondaryApp.auth();

// ---------------- STATS ----------------

function loadStats() {
  db.ref("users").on("value", (snap) => {
    const users = snap.val() || {};
    const list = Object.values(users);
    document.getElementById("statUsers").textContent = list.length;
    document.getElementById("statAdmins").textContent = list.filter((u) => u.role === "admin").length;
    document.getElementById("statPending").textContent = list.filter((u) => u.role !== "admin" && u.verified === false).length;
  });
  db.ref("posts").on("value", (snap) => {
    const posts = snap.val() || {};
    document.getElementById("statPosts").textContent = Object.keys(posts).length;
  });
}

function loadRecentPosts() {
  db.ref("posts").orderByChild("createdAt").limitToLast(5).on("value", (snap) => {
    const list = document.getElementById("recentPostsList");
    if (!snap.exists()) {
      list.innerHTML = `<p class="loader">No posts yet.</p>`;
      return;
    }
    const entries = [];
    snap.forEach((child) => { entries.push(child.val()); });
    entries.reverse(); // newest first
    list.innerHTML = `<table class="data-table"><tbody></tbody></table>`;
    const tbody = list.querySelector("tbody");
    entries.forEach((p) => {
      const when = p.createdAt ? timeAgo(new Date(p.createdAt)) : "just now";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${escapeHtml(p.title)}</strong></td>
        <td class="muted">${escapeHtml(p.authorName || "Neighbor")}</td>
        <td class="muted">${when}</td>
      `;
      tbody.appendChild(tr);
    });
  }, (err) => console.error(err));
}

// ---------------- USERS TABLE (+ PERMISSION TOGGLES) ----------------

function permSwitch(uid, key, checked, disabled) {
  const label = key[0].toUpperCase() + key.slice(1);
  return `
    <label class="perm-toggle" title="${label}">
      <span class="switch">
        <input type="checkbox" data-perm="${key}" data-uid="${uid}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <span class="slider"></span>
      </span>
      ${label[0]}
    </label>`;
}

function loadUsersTable() {
  db.ref("users").on("value", (snap) => {
    const tbody = document.getElementById("usersTableBody");
    if (!snap.exists()) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No users yet.</td></tr>`;
      return;
    }
    const entries = [];
    snap.forEach((child) => { entries.push({ uid: child.key, ...child.val() }); });
    entries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    tbody.innerHTML = "";
    entries.forEach((u) => {
      const when = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—";
      const isAdmin = u.role === "admin";
      const isPending = !isAdmin && u.verified === false;
      const perms = normalizePermissions(u.permissions);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="avatar-initial">${initials(u.fullName || u.email)}</span> &nbsp; ${escapeHtml(u.fullName || "—")}</td>
        <td class="muted">${escapeHtml(u.email)}</td>
        <td><span class="badge ${isAdmin ? "badge-admin" : "badge-user"}">${u.role}</span></td>
        <td>${isAdmin ? `<span class="muted">—</span>` : (isPending ? `<span class="badge badge-admin">Pending</span>` : `<span class="badge badge-user">Verified</span>`)}</td>
        <td class="muted">${when}</td>
        <td>
          ${isAdmin
            ? `<span class="muted">Full access</span>`
            : `<div class="perm-toggles">
                ${permSwitch(u.uid, "read", perms.read)}
                ${permSwitch(u.uid, "write", perms.write)}
                ${permSwitch(u.uid, "update", perms.update)}
                ${permSwitch(u.uid, "delete", perms.delete)}
                ${permSwitch(u.uid, "execute", perms.execute)}
              </div>`}
        </td>
        <td>${isPending ? `<button data-approve="${u.uid}" class="btn btn-ghost" style="padding:4px 10px;font-size:12px;">Approve</button>` : ""}</td>
      `;
      if (!isAdmin) {
        tr.querySelectorAll("input[data-perm]").forEach((input) => {
          input.addEventListener("change", () => {
            setUserPermission(input.dataset.uid, input.dataset.perm, input.checked);
          });
        });
      }
      const approveBtn = tr.querySelector("[data-approve]");
      if (approveBtn) approveBtn.addEventListener("click", () => approveUser(u.uid));
      tbody.appendChild(tr);
    });
  }, (err) => console.error(err));
}

// ---------------- PENDING APPROVALS (self-registered users) ----------------

function loadPendingUsers() {
  db.ref("users").on("value", (snap) => {
    const tbody = document.getElementById("pendingUsersTableBody");
    const badge = document.getElementById("pendingCountBadge");
    const entries = [];
    snap.forEach((child) => {
      const u = child.val();
      if (u.role !== "admin" && u.verified === false) entries.push({ uid: child.key, ...u });
    });
    entries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (entries.length) {
      badge.textContent = entries.length;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }

    if (!entries.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No pending registrations. New self-registered accounts will show up here.</td></tr>`;
      return;
    }
    tbody.innerHTML = "";
    entries.forEach((u) => {
      const when = u.createdAt ? timeAgo(new Date(u.createdAt)) : "just now";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="avatar-initial">${initials(u.fullName || u.email)}</span> &nbsp; ${escapeHtml(u.fullName || "—")}</td>
        <td class="muted">${escapeHtml(u.email)}</td>
        <td class="muted">${when}</td>
        <td>
          <button data-approve="${u.uid}" class="btn btn-accent" style="padding:4px 12px;font-size:12px;">Approve</button>
          &nbsp;<button data-reject="${u.uid}" class="btn btn-danger" style="padding:4px 12px;font-size:12px;">Reject</button>
        </td>
      `;
      tr.querySelector("[data-approve]").addEventListener("click", () => approveUser(u.uid));
      tr.querySelector("[data-reject]").addEventListener("click", () => rejectUser(u.uid));
      tbody.appendChild(tr);
    });
  }, (err) => console.error(err));
}

function approveUser(uid) {
  db.ref(`users/${uid}/verified`).set(true).catch((err) => {
    console.error("Couldn't approve user:", err);
    alert("Couldn't approve this user. Please try again.");
  });
}

function rejectUser(uid) {
  if (!confirm("Reject this registration? Their profile record will be removed and they'll need to register again.\n\nNote: this only removes their database profile — their login (Authentication) record isn't deleted from this prototype, since that requires a privileged backend call. They also won't be able to sign in without a profile.")) return;
  db.ref(`users/${uid}`).remove().catch((err) => {
    console.error("Couldn't reject user:", err);
    alert("Couldn't reject this user. Please try again.");
  });
}

// Writes a single permission flag for a user. Reflects immediately in the
// user's own dashboard because dashboard.html keeps a live listener open
// on users/<uid>/permissions (see js/user.js -> watchPermissions()).
function setUserPermission(uid, key, value) {
  db.ref(`users/${uid}/permissions/${key}`).set(value).catch((err) => {
    console.error("Couldn't update permission:", err);
    alert("Couldn't save that permission change. Please try again.");
    loadUsersTable(); // resync toggle state on failure
  });
}

// ---------------- CREATE USER ----------------

const createUserBackdrop = document.getElementById("createUserBackdrop");
const newUserPermsFieldset = document.getElementById("newUserPermsFieldset");

document.getElementById("openCreateUserBtn").addEventListener("click", () => {
  document.getElementById("createUserForm").reset();
  document.getElementById("createUserMsg").className = "form-msg";
  document.querySelectorAll("#newUserPermsFieldset input[type=checkbox]").forEach((cb) => (cb.checked = true));
  toggleNewUserPermsVisibility();
  createUserBackdrop.classList.add("active");
});
document.getElementById("cancelCreateUserBtn").addEventListener("click", () => {
  createUserBackdrop.classList.remove("active");
});

document.getElementById("newRole").addEventListener("change", toggleNewUserPermsVisibility);
function toggleNewUserPermsVisibility() {
  const role = document.getElementById("newRole").value;
  newUserPermsFieldset.classList.toggle("hidden", role === "admin");
}

document.getElementById("createUserForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("createUserSubmitBtn");
  const msg = document.getElementById("createUserMsg");
  const fullName = document.getElementById("newFullName").value.trim();
  const email = document.getElementById("newEmail").value.trim();
  const password = document.getElementById("newPassword").value;
  const role = document.getElementById("newRole").value;
  const permissions = {
    read: document.getElementById("newPermRead").checked,
    write: document.getElementById("newPermWrite").checked,
    update: document.getElementById("newPermUpdate").checked,
    delete: document.getElementById("newPermDelete").checked,
    execute: document.getElementById("newPermExecute").checked,
  };

  btn.disabled = true;
  btn.textContent = "Creating…";
  msg.className = "form-msg";

  try {
    // Step 1: create the auth account on the SECONDARY app so the admin's
    // own session (on the default app) is left untouched.
    let cred;
    try {
      cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    } catch (err) {
      console.error("Auth creation error:", err.code, err.message);
      let text = `Couldn't create the login (${err.code || "unknown"}).`;
      if (err.code === "auth/email-already-in-use") text = "That email is already registered.";
      if (err.code === "auth/invalid-email") text = "That email address looks invalid.";
      if (err.code === "auth/weak-password") text = "Password should be at least 6 characters.";
      if (err.code === "auth/operation-not-allowed") text = "Email/Password sign-in isn't enabled in Firebase Authentication settings.";
      msg.className = "form-msg error";
      msg.textContent = text;
      btn.disabled = false;
      btn.textContent = "Create user";
      return;
    }

    const newUid = cred.user.uid;

    // Step 2: write the profile record using the admin's session (default app's db)
    try {
      await db.ref("users/" + newUid).set({
        email,
        fullName,
        role,
        dob: "",
        bio: "",
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        // Accounts created directly by an admin are pre-verified — the
        // verification gate only applies to people who self-registered
        // from the sign-in page.
        verified: true,
        // Admins always have full access; permission toggles only apply to
        // the "user" role, but we store sensible defaults either way.
        permissions: role === "admin" ? defaultPermissions() : permissions,
      });
    } catch (err) {
      console.error("Database write error:", err.code, err.message);
      msg.className = "form-msg error";
      msg.textContent = `Login created, but saving the profile failed (${err.code || err.message || "unknown error"}). ` +
        "This is usually a Realtime Database rules issue — check that your rules match the README and that the admin's own users/<uid> node exists with role \"admin\".";
      await secondaryAuth.signOut();
      btn.disabled = false;
      btn.textContent = "Create user";
      return;
    }

    // Clean up the secondary session so it doesn't linger
    await secondaryAuth.signOut();

    msg.className = "form-msg success";
    msg.textContent = `User ${email} created.`;
    setTimeout(() => { createUserBackdrop.classList.remove("active"); }, 900);
  } finally {
    btn.disabled = false;
    btn.textContent = "Create user";
  }
});

// ---------------- ALL POSTS (moderation) ----------------

function loadAllPostsAdmin() {
  db.ref("posts").orderByChild("createdAt").on("value", (snap) => {
    const board = document.getElementById("allPostsAdminBoard");
    if (!snap.exists()) {
      board.innerHTML = `<p class="loader">No posts yet.</p>`;
      return;
    }
    const entries = [];
    snap.forEach((child) => { entries.push([child.key, child.val()]); });
    entries.reverse(); // newest first
    board.innerHTML = "";
    entries.forEach(([id, p]) => {
      const when = p.createdAt ? timeAgo(new Date(p.createdAt)) : "just now";
      const el = document.createElement("div");
      el.className = "notice";
      el.innerHTML = `
        <h3>${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.content)}</p>
        <div class="notice-meta">
          <span>${escapeHtml(p.authorName || "Neighbor")} · ${when}</span>
          <span class="notice-actions">
            <button data-delete="${id}" class="danger">Remove</button>
          </span>
        </div>
      `;
      el.querySelector("[data-delete]").addEventListener("click", () => deletePostAsAdmin(id));
      board.appendChild(el);
    });
  }, (err) => console.error(err));
}

async function deletePostAsAdmin(id) {
  if (!confirm("Remove this post from the platform?")) return;
  try {
    await db.ref("posts/" + id).remove();
  } catch (err) {
    console.error(err);
    alert("Couldn't remove this post. Please try again.");
  }
}

// ---------------- ANNOUNCEMENTS (admin creates; gated by "Read" for users) ----------------

document.getElementById("announcementForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("announcementSubmitBtn");
  const title = document.getElementById("announcementTitle").value.trim();
  const content = document.getElementById("announcementContent").value.trim();
  if (!title || !content) return;

  btn.disabled = true;
  btn.textContent = "Posting…";
  try {
    const newRef = db.ref("announcements").push();
    await newRef.set({
      title,
      content,
      authorId: adminUser.uid,
      authorName: adminUser.fullName || "Admin",
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    });
    document.getElementById("announcementForm").reset();
  } catch (err) {
    console.error(err);
    alert("Couldn't post the announcement. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Post announcement";
  }
});

let repliesByAnnouncement = {};

function loadAnnouncementsAdmin() {
  db.ref("announcements").orderByChild("createdAt").on("value", (snap) => {
    const board = document.getElementById("announcementsAdminBoard");
    if (!snap.exists()) {
      board.innerHTML = `<p class="loader">No announcements posted yet.</p>`;
      return;
    }
    const entries = [];
    snap.forEach((child) => { entries.push([child.key, child.val()]); });
    entries.reverse();
    board.innerHTML = "";
    entries.forEach(([id, a]) => {
      const when = a.createdAt ? timeAgo(new Date(a.createdAt)) : "just now";
      const replies = repliesByAnnouncement[id] || [];
      const el = document.createElement("div");
      el.className = "notice";
      el.innerHTML = `
        <h3>${escapeHtml(a.title)}</h3>
        <p>${escapeHtml(a.content)}</p>
        <div class="notice-meta">
          <span>Posted ${when}</span>
          <span class="notice-actions"><button data-delete-ann="${id}" class="danger">Delete</button></span>
        </div>
        <div class="divider"></div>
        <div class="section-sub" style="margin-bottom:8px;">${replies.length} repl${replies.length === 1 ? "y" : "ies"}</div>
        ${replies.map((r) => `
          <div style="padding:8px 0;border-top:1px solid var(--color-border);">
            <strong style="font-size:13px;">${escapeHtml(r.authorName || "Neighbor")}</strong>
            <span class="muted" style="font-family:var(--font-mono);font-size:11.5px;"> · ${r.createdAt ? timeAgo(new Date(r.createdAt)) : ""}</span>
            <p style="margin:4px 0 0;font-size:13.5px;">${escapeHtml(r.content)}</p>
          </div>
        `).join("")}
      `;
      el.querySelector("[data-delete-ann]").addEventListener("click", () => deleteAnnouncement(id));
      board.appendChild(el);
    });
  }, (err) => console.error(err));
}

function loadRepliesAdmin() {
  db.ref("replies").orderByChild("createdAt").on("value", (snap) => {
    repliesByAnnouncement = {};
    snap.forEach((child) => {
      const r = child.val();
      if (!repliesByAnnouncement[r.announcementId]) repliesByAnnouncement[r.announcementId] = [];
      repliesByAnnouncement[r.announcementId].push(r);
    });
    loadAnnouncementsAdmin();
  }, (err) => console.error(err));
}

async function deleteAnnouncement(id) {
  if (!confirm("Delete this announcement? Its replies will also be removed.")) return;
  try {
    await db.ref("announcements/" + id).remove();
    const snap = await db.ref("replies").orderByChild("announcementId").equalTo(id).get();
    const updates = {};
    snap.forEach((child) => { updates[child.key] = null; });
    if (Object.keys(updates).length) await db.ref("replies").update(updates);
  } catch (err) {
    console.error(err);
    alert("Couldn't delete this announcement. Please try again.");
  }
}

// ---------------- REPORTS (submitted via a user's "Execute" action) ----------------

function loadReportsAdmin() {
  db.ref("reports").orderByChild("createdAt").on("value", (snap) => {
    const tbody = document.getElementById("reportsTableBody");
    if (!snap.exists()) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No reports submitted yet.</td></tr>`;
      return;
    }
    const entries = [];
    snap.forEach((child) => { entries.push([child.key, child.val()]); });
    entries.reverse();
    tbody.innerHTML = "";
    entries.forEach(([id, r]) => {
      const when = r.createdAt ? timeAgo(new Date(r.createdAt)) : "just now";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.authorName || "Neighbor")}</td>
        <td>${escapeHtml(r.content)}</td>
        <td class="muted">${when}</td>
        <td>
          <span class="badge ${r.status === "reviewed" ? "badge-user" : "badge-admin"}">${r.status || "submitted"}</span>
          &nbsp;<button data-review="${id}" class="btn btn-ghost" style="padding:4px 10px;font-size:12px;">${r.status === "reviewed" ? "Mark pending" : "Mark reviewed"}</button>
        </td>
      `;
      tr.querySelector("[data-review]").addEventListener("click", () => {
        db.ref("reports/" + id + "/status").set(r.status === "reviewed" ? "submitted" : "reviewed");
      });
      tbody.appendChild(tr);
    });
  }, (err) => console.error(err));
}
