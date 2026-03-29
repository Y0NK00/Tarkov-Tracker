// ── Firebase Configuration ──────────────────────────────────────────────────
// Kappa Tracker — Firebase project: kappa-tracker-4bff9
//
// Firestore security rules applied:
//   rules_version = '2';
//   service cloud.firestore {
//     match /databases/{database}/documents {
//       match /users/{userId}/progress/{doc} {
//         allow read, write: if request.auth != null && request.auth.uid == userId;
//       }
//     }
//   }

window.FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCLSUarcTqh-ZulwZNJrQb4ljAb8HZG-UQ',
  authDomain:        'kappa-tracker-4bff9.firebaseapp.com',
  projectId:         'kappa-tracker-4bff9',
  storageBucket:     'kappa-tracker-4bff9.firebasestorage.app',
  messagingSenderId: '713908714449',
  appId:             '1:713908714449:web:ad069e220d5b918ef3bef0',
  measurementId:     'G-T93MTC3TKB'
};
