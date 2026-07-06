# Civic Notice — Community Improvement Web App

A lightweight prototype where a **User** registers their own account, an
**Admin** verifies it before it can be used, and the user then logs in to
update their profile and post community improvement suggestions. Built with
plain HTML/CSS/JS and Firebase (Authentication + **Realtime Database**) — no build
tools required.

## File structure

```
community-app/
├── index.html          Login page (+ link to register)
├── register.html          Self-registration page for new users
├── admin.html           Admin dashboard (verify/create users, view all posts, activity)
├── dashboard.html        User dashboard (profile, suggestions, my posts)
├── admin-user-template.json   Template JSON for bootstrapping the first admin
├── import-admin.js             Node script to write that JSON via the Admin SDK
├── css/styles.css
└── js/
    ├── firebase-config.js   ← your Firebase project keys live here
    ├── auth.js               Login + role/verification redirect
    ├── register.js            Self-registration: creates the auth account and the users/<uid> node
    ├── common.js             Shared helpers (route guard, sign out, formatting)
    ├── admin.js               Admin logic (incl. Pending Approvals)
    └── user.js                User logic
```

## Data shape (Realtime Database)

```
{
  "users": {
    "<uid>": {
      "email": "...", "fullName": "...", "role": "admin|user",
      "dob": "...", "bio": "...", "createdAt": 173...,
      "verified": true,                // false until an admin approves a self-registered user; missing = treated as true
      "permissions": {                 // only meaningful for role: "user" — admins always have full access
        "read": true,                  // can view admin announcements
        "write": true,                 // can reply to admin announcements
        "update": true,                // can edit their profile (name, DOB) and their own posts
        "delete": true,                // can delete their own posts
        "execute": true                // can submit reports / complete tasks
      }
    }
  },
  "posts": {
    "<pushId>": { "title": "...", "content": "...", "authorId": "<uid>", "authorName": "...", "createdAt": 173... }
  },
  "announcements": {
    "<pushId>": { "title": "...", "content": "...", "authorId": "<admin uid>", "authorName": "...", "createdAt": 173... }
  },
  "replies": {
    "<pushId>": { "announcementId": "<announcement pushId>", "content": "...", "authorId": "<uid>", "authorName": "...", "createdAt": 173... }
  },
  "reports": {
    "<pushId>": { "content": "...", "authorId": "<uid>", "authorName": "...", "status": "submitted|reviewed", "createdAt": 173... }
  }
}
```

## Self-registration + admin verification

Instead of an admin creating every account, anyone can register themselves:

1. **User visits `register.html`** (linked from the sign-in page) and enters
   their full name, email, and password.
2. **`js/register.js`** creates their Firebase Auth account, then
   automatically writes their `users/<uid>` node — this is the "node is
   created automatically" step, no admin action needed to make the record
   exist. It's written with `role: "user"`, `verified: false`, and the
   default permissions (all ON, ready to go the moment they're approved).
3. The new account is immediately signed back out — a `verified: false`
   account can't reach either dashboard (see below), so there's nothing
   useful for them to do yet.
4. **Admin reviews it** under **Admin Console → Pending Approvals** (also
   surfaced as a "Pending" badge in the sidebar and a stat on the Overview
   page) and clicks **Approve** (sets `verified: true` — the person can now
   sign in normally) or **Reject** (removes the `users/<uid>` profile node;
   see the note in Known limitations about the linked Auth account).
5. **User signs in** at `index.html` — `js/auth.js` checks `verified` before
   redirecting to `dashboard.html`. If it's still `false`, they're kept on
   the sign-in page with a "still awaiting admin verification" message
   instead of being let through. The same check runs in `js/common.js`'s
   `guardRoute()` in case someone has an open dashboard tab and their access
   hasn't been approved yet.

Accounts an admin creates directly (still available under **Manage
Users → + Create user**, e.g. for adding another admin) are written with
`verified: true` right away, since the admin has already vetted them —
nothing changes for that flow. Any account from before this feature existed
has no `verified` field at all, and a missing field is treated the same as
`true`, so it keeps working without needing a manual migration.

## Admin-controlled permissions (CRUD access control)

Every non-admin user has a `permissions` object with five independent ON/OFF
toggles that the admin controls from **Manage Users**:

| Toggle    | Controls |
|-----------|----------|
| **Read**    | Seeing the *Admin Announcements* view and its contents |
| **Write**   | Replying to an admin announcement |
| **Update**  | Editing their profile (name, DOB) and editing their own community posts |
| **Delete**  | Deleting their own community posts |
| **Execute** | Submitting reports / marking tasks complete |

Toggling a switch writes a single field, e.g. `users/<uid>/permissions/read`,
which the signed-in user's dashboard is listening to live
(`db.ref("users/<uid>/permissions").on("value", ...)` in `js/user.js`). That's
what makes the change apply **immediately** — the affected nav item, form, or
button appears/disappears or enables/disables in the user's browser without a
refresh or new sign-in. A missing `permissions` node (e.g. accounts created
before this feature existed) is treated as all-ON, so nothing already deployed
breaks.

This is enforced in two layers, as it should be for anything access-control related:
- **Client-side (UX):** `js/user.js` hides or disables the relevant nav items,
  buttons, and form fields based on `currentPermissions`.
- **Server-side (real enforcement):** the Realtime Database rules below check
  `root.child('users').child(auth.uid).child('permissions').child('<key>').val()`
  before allowing the corresponding write, so a user can't bypass the UI (e.g.
  via the browser console) and write data they've been denied.

## 1. Enable Authentication

**Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**

## 2. Realtime Database security rules

**Build → Realtime Database → Rules**, paste:

```json
{
  "rules": {
    "users": {
      ".read": "auth != null",
      "$uid": {
        ".write": "auth != null && (auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin')",
        "permissions": {
          ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'"
        },
        "role": {
          ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'"
        },
        "verified": {
          ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'"
        }
      }
    },
    "posts": {
      ".read": "auth != null",
      "$postId": {
        ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() === 'admin' || (!data.exists() && newData.child('authorId').val() === auth.uid) || (data.exists() && data.child('authorId').val() === auth.uid && ((newData.exists() && root.child('users').child(auth.uid).child('permissions').child('update').val() !== false) || (!newData.exists() && root.child('users').child(auth.uid).child('permissions').child('delete').val() !== false))))"
      }
    },
    "announcements": {
      ".read": "auth != null",
      "$annId": {
        ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'"
      }
    },
    "replies": {
      ".read": "auth != null",
      "$replyId": {
        ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() === 'admin' || (!data.exists() && newData.child('authorId').val() === auth.uid && root.child('users').child(auth.uid).child('permissions').child('write').val() !== false))"
      }
    },
    "reports": {
      ".read": "auth != null",
      "$reportId": {
        ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() === 'admin' || (!data.exists() && newData.child('authorId').val() === auth.uid && root.child('users').child(auth.uid).child('permissions').child('execute').val() !== false))"
      }
    }
  }
}
```

This means: any signed-in person can read the users list, posts, announcements,
replies, and reports (needed for the admin tables and the various boards); a
user can only write their own `users/<uid>` node and only an admin can change
someone's `role`, `permissions`, or `verified` status (or an admin can write
anyone's node); a post
can be created by its future author, edited by its author only while their
`update` permission is ON, deleted by its author only while their `delete`
permission is ON, or written by an admin at any time; announcements can only
be created/edited/removed by an admin; a reply can only be created by its
author and only while their `write` permission is ON (admins can moderate any
reply); and a report can only be created by its author while their `execute`
permission is ON, with its `status` field updatable by an admin.

> Realtime Database rules can't easily distinguish "create" vs "delete" in one
> expression for every case, so the `posts` rule above is intentionally
> explicit about the three cases (create / edit / delete) rather than a single
> shorthand — if you simplify it, double check that deleting still checks
> `delete` and editing still checks `update` and not the other way around.

> **Limitation to know about:** because this is a client-only prototype, the
> rule technically lets any signed-in account write their *own* `users/<uid>`
> node into existence, including all of its children in one call — Realtime
> Database rules cascade downward, so the `role`/`permissions`/`verified`
> "admin only" restrictions above only bite when someone targets those exact
> sub-paths directly; they don't stop a user from setting the whole node
> (`role: "user", verified: false`, etc.) the first time, which is exactly
> what `register.js` relies on. It also means a technically-inclined person
> could call the client SDK directly and write `verified: true` (or
> `role: "admin"`) into their own node, bypassing the intended approval step
> and the UI entirely. In a production system, both account *creation* and
> *verification* should go through a trusted backend (e.g. a Cloud Function
> using the Admin SDK, or Firebase App Check + custom claims) instead of
> relying purely on client-writable rules.

## 3. Bootstrap the first Admin account

Because there's no admin yet to verify anyone (and self-registered users can
never become admins), you need to create the very first admin once, manually.
Two ways to do it:

**Option A — fastest, via the import script:**
1. Firebase Console → **Authentication → Users → Add user** → copy the new user's UID.
2. `npm install firebase-admin` in this folder.
3. Firebase Console → **Project Settings → Service Accounts → Generate new private key** → save as `serviceAccountKey.json` next to `import-admin.js` (never commit this file anywhere).
4. Edit `admin-user-template.json` — set the real `email`/`fullName`, delete the `_instructions` key.
5. Run: `node import-admin.js <UID>`

**Option B — manual, via the console:**
1. **Authentication → Users → Add user** → copy the UID.
2. **Realtime Database → root ⋮ menu → Import JSON**, or manually add under `users/<uid>`:
   ```json
   {
     "email": "admin@yourdomain.com", "fullName": "Admin", "role": "admin",
     "dob": "", "bio": "", "createdAt": 0, "verified": true,
     "permissions": { "read": true, "write": true, "update": true, "delete": true, "execute": true }
   }
   ```
   ⚠️ Importing at the root **replaces everything** already in the database — import at the `/users` path specifically if you have existing data.

Now sign in with that email/password at `index.html` and you'll land on the Admin Console.
From there you can approve people who register themselves (**Pending Approvals**),
or create an account directly yourself (e.g. another admin) through **Manage Users**.

## 4. Run it

No build step needed — this is static HTML/CSS/JS.

- **Quickest:** open `index.html` directly in a browser, or serve the folder with
  any static server (e.g. `npx serve .` or the VS Code "Live Server" extension).
- **Optional — Firebase Hosting:**
  ```
  npm install -g firebase-tools
  firebase login
  firebase init hosting   # choose this folder as the public directory
  firebase deploy
  ```


## How the demo flows

1. **User** visits `register.html` (linked from the sign-in page) → fills in
   name, email, and a password of their own choosing → their account and
   `users/<uid>` profile node are created automatically, but locked with
   `verified: false`.
2. **Admin** signs in → Admin Console → *Pending Approvals* → reviews the
   new registration → **Approve** (flips `verified` to `true`, with the
   default Read/Write/Update/Delete/Execute permissions already ON) or
   **Reject** (removes the request). Admins can also still add an account
   directly under *Manage Users → + Create user* — useful for e.g. adding
   another admin — which is pre-verified immediately.
3. **User** signs in with the email/password they chose → now that they're
   verified, they land on their dashboard → fills out **My Profile** (name,
   date of birth, other info) → posts an idea under **Community
   Suggestions**. If they try to sign in before being approved, they're kept
   on the sign-in page with a "still awaiting admin verification" message.
4. Everyone with a verified account can see the shared **Community Suggestions** feed
   in real time (Realtime Database `.on("value")` listeners — no page refresh needed).
5. The user can edit or delete their own posts from **My Posts**, view and reply
   to the admin's notices under **Admin Announcements**, and log a task/report
   under **Submit a Report** — each of these is only available while the
   matching permission is ON.
6. The **Admin** posts notices from *Announcements* (readable/replyable per
   user, per the Read/Write toggles), reviews everything submitted under
   *Reports*, reviews every post under **All Posts** and removes anything
   inappropriate, and watches user/post/pending counts update live on
   **Activity Overview**.
7. To see access control live: while the user has the app open on one screen,
   flip one of their toggles off in **Manage Users** on another screen (or
   another browser tab). The corresponding nav item, form, or button disappears
   or disables on the user's dashboard immediately — no refresh needed.

## Notes on the "admin creates users" trick (still used for Manage Users → + Create user)

Firebase's client SDK normally signs you *into* whichever account you just created
with `createUserWithEmailAndPassword`. To keep the admin logged in while creating
someone else's account directly (e.g. adding another admin), `admin.js` spins up a
second, isolated Firebase app instance purely to create the new auth user, then
writes that person's profile record into Realtime Database using the admin's own
(untouched) session, and finally signs the secondary instance back out. This trick
isn't needed for self-registration (`register.js`) since there the new person *is*
signing themselves in — it's the same underlying pattern used for admin-driven
account creation. A production system would instead do privileged user creation
from a trusted backend (e.g. a Cloud Function using the Firebase Admin SDK).

## Known limitations (this is a teaching prototype, not production-hardened)

- Users set their own password at registration, but can't reset a forgotten one —
  there's no "forgot password" flow wired up.
- No email verification flow (that's a separate Firebase concept from the
  admin-approval "verified" flag this app uses).
- No file/image upload — profiles are text-only, as specified.
- Deleting a user's *auth* account (not just their database profile) isn't wired
  up from the Admin Console — rejecting a pending user only removes their
  database profile, since deleting the Auth record requires a privileged backend
  call (Admin SDK). A rejected person's login will simply have no profile to
  route to, and they'd need to register again (with a different email, since the
  old one is still taken in Authentication) to get a fresh, working request in.
- See the rules limitation note above regarding self-registration and the
  `verified` flag being technically self-writable by a determined user going
  around the UI.
- Permission toggles only apply to the "user" role; an account with role
  "admin" always has full access, matching the two-role system described above.
- The "Execute" action here is a simple report/task submission box, kept
  generic so it's easy to swap for whatever a real deployment needs users to
  "do" (submit a form, complete a checklist, etc.) without changing the
  permission plumbing.
