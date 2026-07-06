/**
 * FIREBASE CONFIGURATION — Civic Notice (Realtime Database backend)
 * 1. Enable Authentication → Sign-in method → Email/Password
 * 2. Realtime Database → paste the rules from README.md into the Rules tab
 */
const firebaseConfig = {
  apiKey: "AIzaSyAz7DKL1RvAAsJnmWsGGXndE8kOL0H20ZI",
  authDomain: "mytestlms-13259.firebaseapp.com",
  databaseURL: "https://mytestlms-13259-default-rtdb.firebaseio.com",
  projectId: "mytestlms-13259",
  storageBucket: "mytestlms-13259.firebasestorage.app",
  messagingSenderId: "884409291506",
  appId: "1:884409291506:web:cd41b74c4039a3720f766b"
};

// Primary app instance — used for the signed-in session throughout the app
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();

