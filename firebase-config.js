// =============================================
//  FINANCE TRACKER — Firebase Configuration
//  =============================================
//  SETUP INSTRUCTIONS:
//  1. Go to https://console.firebase.google.com
//  2. Click "Add project" → give it a name → Continue
//  3. Disable Google Analytics (optional) → Create project
//  4. In the left sidebar click ⚙️ Project Settings → Your apps → </> (Web)
//  5. Register the app (any nickname) → copy the firebaseConfig object below
//  6. In the left sidebar → Build → Firestore Database → Create database
//     → Start in production mode → choose a region close to you → Enable
//  7. Go to Firestore → Rules tab → paste this rule and Publish:
//       rules_version = '2';
//       service cloud.firestore {
//         match /databases/{database}/documents {
//           match /users/{userId}/{document=**} {
//             allow read, write: if request.auth != null && request.auth.uid == userId;
//           }
//         }
//       }
//  8. In the left sidebar → Build → Authentication → Get started
//     → Sign-in method → Google → Enable → Save
//  9. Replace the placeholder values below with YOUR config values
//     (found in Project Settings → Your apps → SDK setup and configuration)
// =============================================

// ✅ Your Firebase config — DO NOT add import statements or initializeApp() here.
//    The Firebase SDK is already loaded via CDN in index.html.
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyD-BjXFEVPLRYefg9IJpYtXR2QWezsZsos",
    authDomain: "tracker-f5d25.firebaseapp.com",
    projectId: "tracker-f5d25",
    storageBucket: "tracker-f5d25.firebasestorage.app",
    messagingSenderId: "372520621401",
    appId: "1:372520621401:web:e309459da7187c6e732848",
    measurementId: "G-PZJDBSMMRB"
};