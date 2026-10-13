// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDLGsYImlxjSJ3tdIlhUc9Kb8ZJhaNm3vA",
  authDomain: "cofre-de-acessos.firebaseapp.com",
  projectId: "cofre-de-acessos",
  storageBucket: "cofre-de-acessos.firebasestorage.app",
  messagingSenderId: "30843690854",
  appId: "1:30843690854:web:94567e9fb9a94b240ff2a7",
  measurementId: "G-M773F2ZJDB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);