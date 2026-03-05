// firebase/config.js
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc,
  addDoc, 
  query, 
  where, 
  getDocs,
  getDoc,
  updateDoc,
  serverTimestamp,
  increment 
} from 'firebase/firestore';

// 🔥 Tumhara diya hua Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCkY6DNXvOl3VJiGHJ7RlHdeVN_9hlCYvY",
  authDomain: "cyber-ai-d1022.firebaseapp.com",
  projectId: "cyber-ai-d1022",
  storageBucket: "cyber-ai-d1022.firebasestorage.app",
  messagingSenderId: "85272255847",
  appId: "1:85272255847:web:4c0af459c71a65e2e463c2",
  measurementId: "G-J8G8EQLS10"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Collections
const KEYS_COLLECTION = 'api_keys';
const USAGE_COLLECTION = 'daily_usage';

export {
  db,
  KEYS_COLLECTION,
  USAGE_COLLECTION,
  collection,
  doc,
  addDoc,
  query,
  where,
  getDocs,
  getDoc,
  updateDoc,
  serverTimestamp,
  increment
};
