import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: 'AIzaSyBm6d2YWjfmjboPvHu46QzaMTNhi8SIzgQ',
  authDomain: 'prediction-m.firebaseapp.com',
  projectId: 'prediction-m',
  storageBucket: 'prediction-m.firebasestorage.app',
  messagingSenderId: '880033693590',
  appId: '1:880033693590:web:4a1603e0e03ebb735ba7b7',
  measurementId: 'G-4EJG5CFHER',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
