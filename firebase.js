import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const firebaseConfig = {
  apiKey: "AIzaSyBqXYg-I3MeD8kzvmDAsLn1mW1jH1IByBA",
  authDomain: "n777-academy.firebaseapp.com",
  databaseURL: "https://n777-academy-default-rtdb.europe-west.firebasedatabase.app",
  projectId: "n777-academy",
  storageBucket: "n777-academy.firebasestorage.app",
  messagingSenderId: "92365891681",
  appId: "1:92365891681:web:e9b40736680116fd1d6220"
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const ADMIN_EMAIL = "admin@examora.app";
