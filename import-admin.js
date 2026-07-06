/**
 * IMPORT ADMIN PROFILE INTO REALTIME DATABASE
 * --------------------------------------------
 * One-time helper so you don't have to build the JSON node by hand in
 * the console.
 *
 * SETUP:
 *   1. npm install firebase-admin
 *   2. Firebase Console → Project Settings → Service Accounts →
 *      "Generate new private key" → save the downloaded file next to this
 *      script as serviceAccountKey.json (keep it OUT of git / public repos —
 *      it grants full admin access to your project).
 *   3. Firebase Console → Authentication → Users → Add user (email + password)
 *      → copy that user's UID.
 *   4. Edit admin-user-template.json with the real email/fullName, and
 *      delete the "_instructions" key.
 *   5. Run:  node import-admin.js <UID>
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const uid = process.argv[2];
if (!uid) {
  console.error("Usage: node import-admin.js <UID>");
  process.exit(1);
}

const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
if (!fs.existsSync(serviceAccountPath)) {
  console.error(
    "Missing serviceAccountKey.json.\n" +
    "Download it from Firebase Console → Project Settings → Service Accounts\n" +
    "→ Generate new private key, and save it next to this script."
  );
  process.exit(1);
}

const templatePath = path.join(__dirname, "admin-user-template.json");
const raw = JSON.parse(fs.readFileSync(templatePath, "utf8"));
delete raw._instructions;

if (!raw.email || raw.email === "admin@example.com") {
  console.warn("Warning: admin-user-template.json still has placeholder values — edit it first.");
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
  databaseURL: "https://mytestlms-13259-default-rtdb.firebaseio.com",
});

const db = admin.database();

async function run() {
  await db.ref("users/" + uid).set({
    ...raw,
    createdAt: admin.database.ServerValue.TIMESTAMP,
  });
  console.log(`✅ Admin profile written to users/${uid}`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
