import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC09JG_P24MU4qj7H36HPtil-0J60xDf7E",
  authDomain: "ledger-979ce.firebaseapp.com",
  projectId: "ledger-979ce",
  storageBucket: "ledger-979ce.firebasestorage.app",
  messagingSenderId: "598972154253",
  appId: "1:598972154253:web:dd1d8472cef12c4f2dbdc4",
  measurementId: "G-EZ3PTWHVYQ"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore and export it so App.tsx can use it
export const db = getFirestore(app);