// ----------------------------------------------------------------
// USER DASHBOARD (Realtime Database)
// ----------------------------------------------------------------

let currentUser = null;
let currentPermissions = defaultPermissions();

guardRoute("user", (userDoc) => {
  currentUser = userDoc;
  document.getElementById("userNameTag").textContent = userDoc.fullName || userDoc.email;
  fillProfileForm(userDoc);
  loadAllPosts();
  loadMyPosts();
  loadAnnouncements();
  loadMyReports();
  watchPermissions();
});

wireSignOut("signOutBtn");
wireSidebarNav();

// ---------------- PERMISSIONS (live) ----------------
// Admin toggles write straight to users/<uid>/permissions/<key>. Keeping a
// standing .on("value") listener here (instead of a one-time .get()) is
// what makes toggle changes show up immediately, without the user
// refreshing or signing back in.

function watchPermissions() {
  db.ref("users/" + currentUser.uid + "/permissions").on("value", (snap) => {
    currentPermissions = normalizePermissions(snap.val());
    applyPermissionsToUI();
  }, (err) => console.error(err));
}

function applyPermissionsToUI() {
  const p = currentPermissions;

  // READ — hide the Admin Announcements nav item + view entirely.
  setNavVisible("view-announcements", p.read);

  // EXECUTE — hide the Submit a Report nav item + view entirely.
  setNavVisible("view-report", p.execute);

  // If the user is currently sitting on a view that just got hidden,
  // bounce them back to a view they still have access to.
  const activeView = document.querySelector(".view.active");
  if (activeView && activeView.classList.contains("hidden")) {
    const firstVisibleNav = document.querySelector(".nav-item:not(.hidden)");
    if (firstVisibleNav) firstVisibleNav.click();
  }

  // WRITE — hide the reply box under each announcement.
  document.querySelectorAll("[data-reply-box]").forEach((el) => el.classList.toggle("hidden", !p.write));

  // UPDATE — lock the profile form (name + DOB, plus bio for consistency).
  const profileLocked = !p.update;
  ["profFullName", "profDob", "profBio"].forEach((id) => {
    document.getElementById(id).disabled = profileLocked;
  });
  document.getElementById("profileSaveBtn").disabled = profileLocked;
  document.getElementById("profileLockedNotice").classList.toggle("hidden", !profileLocked);

  // UPDATE / DELETE — re-render "My Posts" so Edit/Delete buttons
  // appear or disappear per the current permissions.
  renderMyPostsCache();
}

function setNavVisible(viewId, visible) {
  const nav = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  const view = document.getElementById(viewId);
  if (nav) nav.classList.toggle("hidden", !visible);
  if (view) view.classList.toggle("hidden", !visible);
}

// ---------------- PROFILE ----------------

function fillProfileForm(u) {
  document.getElementById("profEmail").value = u.email || "";
  document.getElementById("profFullName").value = u.fullName || "";
  document.getElementById("profDob").value = u.dob || "";
  document.getElementById("profBio").value = u.bio || "";
}

document.getElementById("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentPermissions.update) return; // extra guard alongside disabled fields

  const btn = document.getElementById("profileSaveBtn");
  const msg = document.getElementById("profileMsg");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const data = {
    fullName: document.getElementById("profFullName").value.trim(),
    dob: document.getElementById("profDob").value,
    bio: document.getElementById("profBio").value.trim(),
  };

  try {
    await db.ref("users/" + currentUser.uid).update(data);
    currentUser = { ...currentUser, ...data };
    document.getElementById("userNameTag").textContent = data.fullName || currentUser.email;
    msg.className = "form-msg success";
    msg.textContent = "Profile saved.";
  } catch (err) {
    console.error(err);
    msg.className = "form-msg error";
    msg.textContent = "Couldn't save your profile. Please try again.";
  } finally {
    btn.disabled = !currentPermissions.update ? true : false;
    btn.textContent = "Save profile";
    setTimeout(() => { msg.className = "form-msg"; }, 3000);
  }
});

// ---------------- POSTS: CREATE ----------------

document.getElementById("postForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("postSubmitBtn");
  const title = document.getElementById("postTitle").value.trim();
  const content = document.getElementById("postContent").value.trim();
  if (!title || !content) return;

  btn.disabled = true;
  btn.textContent = "Posting…";

  try {
    const newRef = db.ref("posts").push();
    await newRef.set({
      title,
      content,
      authorId: currentUser.uid,
      authorName: currentUser.fullName || currentUser.email,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    });
    document.getElementById("postForm").reset();
  } catch (err) {
    console.error(err);
    alert("Couldn't post your suggestion. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Post suggestion";
  }
});

// ---------------- POSTS: LOAD ALL (community feed) ----------------

function loadAllPosts() {
  db.ref("posts").orderByChild("createdAt").on("value", (snap) => {
    const board = document.getElementById("allPostsBoard");
    if (!snap.exists()) {
      board.innerHTML = `<p class="loader">No suggestions yet — be the first to post one.</p>`;
      return;
    }
    const entries = [];
    snap.forEach((child) => { entries.push([child.key, child.val()]); });
    entries.reverse(); // newest first
    board.innerHTML = "";
    entries.forEach(([id, p]) => board.appendChild(renderNotice(id, p, false)));
  }, (err) => console.error(err));
}

// ---------------- POSTS: LOAD MINE ----------------

let myPostsCache = [];

function loadMyPosts() {
  db.ref("posts").orderByChild("authorId").equalTo(currentUser.uid).on("value", (snap) => {
    const entries = [];
    snap.forEach((child) => { entries.push([child.key, child.val()]); });
    entries.sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
    myPostsCache = entries;
    renderMyPostsCache();
  }, (err) => console.error(err));
}

function renderMyPostsCache() {
  const board = document.getElementById("myPostsBoard");
  if (!board) return;
  if (!myPostsCache.length) {
    board.innerHTML = `<p class="loader">You haven't posted anything yet.</p>`;
    return;
  }
  board.innerHTML = "";
  myPostsCache.forEach(([id, p]) => board.appendChild(renderNotice(id, p, true)));
}

function renderNotice(id, p, editable) {
  const el = document.createElement("div");
  el.className = "notice";
  const when = p.createdAt ? timeAgo(new Date(p.createdAt)) : "just now";
  const showEdit = editable && currentPermissions.update;
  const showDelete = editable && currentPermissions.delete;
  el.innerHTML = `
    <h3>${escapeHtml(p.title)}</h3>
    <p>${escapeHtml(p.content)}</p>
    <div class="notice-meta">
      <span>${escapeHtml(p.authorName || "Neighbor")} · ${when}</span>
      ${(showEdit || showDelete) ? `<span class="notice-actions">
        ${showEdit ? `<button data-edit="${id}">Edit</button>` : ""}
        ${showDelete ? `<button data-delete="${id}" class="danger">Delete</button>` : ""}
      </span>` : ""}
    </div>
  `;
  if (showEdit) el.querySelector(`[data-edit="${id}"]`).addEventListener("click", () => openEditModal(id, p));
  if (showDelete) el.querySelector(`[data-delete="${id}"]`).addEventListener("click", () => deletePost(id));
  return el;
}

// ---------------- POSTS: EDIT ----------------

function openEditModal(id, p) {
  if (!currentPermissions.update) return;
  document.getElementById("editPostId").value = id;
  document.getElementById("editTitle").value = p.title;
  document.getElementById("editContent").value = p.content;
  document.getElementById("editMsg").className = "form-msg";
  document.getElementById("editModalBackdrop").classList.add("active");
}

document.getElementById("editCancelBtn").addEventListener("click", () => {
  document.getElementById("editModalBackdrop").classList.remove("active");
});

document.getElementById("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentPermissions.update) return;
  const id = document.getElementById("editPostId").value;
  const title = document.getElementById("editTitle").value.trim();
  const content = document.getElementById("editContent").value.trim();
  const msg = document.getElementById("editMsg");
  try {
    await db.ref("posts/" + id).update({ title, content });
    document.getElementById("editModalBackdrop").classList.remove("active");
  } catch (err) {
    console.error(err);
    msg.className = "form-msg error";
    msg.textContent = "Couldn't save changes. Please try again.";
  }
});

// ---------------- POSTS: DELETE ----------------

async function deletePost(id) {
  if (!currentPermissions.delete) return;
  if (!confirm("Delete this suggestion? This can't be undone.")) return;
  try {
    await db.ref("posts/" + id).remove();
  } catch (err) {
    console.error(err);
    alert("Couldn't delete this post. Please try again.");
  }
}

// ---------------- ANNOUNCEMENTS (view: Read, reply: Write) ----------------

function loadAnnouncements() {
  db.ref("announcements").orderByChild("createdAt").on("value", (snap) => {
    const board = document.getElementById("announcementsBoard");
    if (!snap.exists()) {
      board.innerHTML = `<p class="loader">No announcements from the admin yet.</p>`;
      return;
    }
    const entries = [];
    snap.forEach((child) => { entries.push([child.key, child.val()]); });
    entries.reverse();
    board.innerHTML = "";
    entries.forEach(([id, a]) => board.appendChild(renderAnnouncement(id, a)));
  }, (err) => console.error(err));

  db.ref("replies").orderByChild("createdAt").on("value", () => {
    // Re-render is cheap here and keeps reply threads live under each announcement.
    db.ref("announcements").orderByChild("createdAt").get().then((snap) => {
      const board = document.getElementById("announcementsBoard");
      if (!snap.exists()) return;
      const entries = [];
      snap.forEach((child) => { entries.push([child.key, child.val()]); });
      entries.reverse();
      board.innerHTML = "";
      entries.forEach(([id, a]) => board.appendChild(renderAnnouncement(id, a)));
    });
  });
}

function renderAnnouncement(id, a) {
  const when = a.createdAt ? timeAgo(new Date(a.createdAt)) : "just now";
  const el = document.createElement("div");
  el.className = "notice";
  el.innerHTML = `
    <h3>${escapeHtml(a.title)}</h3>
    <p>${escapeHtml(a.content)}</p>
    <div class="notice-meta"><span>Admin · ${when}</span></div>
    <div id="replies-${id}" style="margin-top:10px;"></div>
    <div data-reply-box class="${currentPermissions.write ? "" : "hidden"}" style="margin-top:10px;display:flex;gap:8px;">
      <input type="text" placeholder="Write a reply…" data-reply-input="${id}" maxlength="300" style="flex:1;padding:8px 10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);">
      <button data-reply-submit="${id}" class="btn btn-primary" style="padding:8px 14px;">Reply</button>
    </div>
  `;
  db.ref("replies").orderByChild("announcementId").equalTo(id).once("value", (rsnap) => {
    const list = [];
    rsnap.forEach((child) => list.push(child.val()));
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const container = el.querySelector(`#replies-${id}`);
    container.innerHTML = list.map((r) => `
      <div style="padding:6px 0;border-top:1px solid var(--color-border);">
        <strong style="font-size:13px;">${escapeHtml(r.authorName || "Neighbor")}</strong>
        <p style="margin:2px 0 0;font-size:13.5px;">${escapeHtml(r.content)}</p>
      </div>
    `).join("");
  });
  const submitBtn = el.querySelector(`[data-reply-submit="${id}"]`);
  submitBtn.addEventListener("click", async () => {
    if (!currentPermissions.write) return;
    const input = el.querySelector(`[data-reply-input="${id}"]`);
    const content = input.value.trim();
    if (!content) return;
    submitBtn.disabled = true;
    try {
      const newRef = db.ref("replies").push();
      await newRef.set({
        announcementId: id,
        content,
        authorId: currentUser.uid,
        authorName: currentUser.fullName || currentUser.email,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
      });
      input.value = "";
    } catch (err) {
      console.error(err);
      alert("Couldn't post your reply. Please try again.");
    } finally {
      submitBtn.disabled = false;
    }
  });
  return el;
}

// ---------------- REPORTS / TASKS (Execute) ----------------

document.getElementById("reportForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentPermissions.execute) return;
  const btn = document.getElementById("reportSubmitBtn");
  const msg = document.getElementById("reportMsg");
  const content = document.getElementById("reportContent").value.trim();
  if (!content) return;

  btn.disabled = true;
  btn.textContent = "Submitting…";
  try {
    const newRef = db.ref("reports").push();
    await newRef.set({
      content,
      authorId: currentUser.uid,
      authorName: currentUser.fullName || currentUser.email,
      status: "submitted",
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    });
    document.getElementById("reportForm").reset();
    msg.className = "form-msg success";
    msg.textContent = "Report submitted to the admin.";
  } catch (err) {
    console.error(err);
    msg.className = "form-msg error";
    msg.textContent = "Couldn't submit your report. Please try again.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit report";
    setTimeout(() => { msg.className = "form-msg"; }, 3000);
  }
});

function loadMyReports() {
  db.ref("reports").orderByChild("authorId").equalTo(currentUser.uid).on("value", (snap) => {
    const board = document.getElementById("myReportsBoard");
    if (!snap.exists()) {
      board.innerHTML = `<p class="loader">You haven't submitted any reports yet.</p>`;
      return;
    }
    const entries = [];
    snap.forEach((child) => entries.push(child.val()));
    entries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    board.innerHTML = `<table class="data-table"><thead><tr><th>Report</th><th>Submitted</th><th>Status</th></tr></thead><tbody></tbody></table>`;
    const tbody = board.querySelector("tbody");
    entries.forEach((r) => {
      const when = r.createdAt ? timeAgo(new Date(r.createdAt)) : "just now";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.content)}</td>
        <td class="muted">${when}</td>
        <td><span class="badge ${r.status === "reviewed" ? "badge-user" : "badge-admin"}">${r.status || "submitted"}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }, (err) => console.error(err));
}
