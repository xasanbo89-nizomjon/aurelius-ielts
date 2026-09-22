"use client";

import { getApps, getApp, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!cachedApp) {
    cachedApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return cachedApp;
}

/**
 * Lazily initialized — must only be called from inside an event handler
 * (onClick/onSubmit), never at module or component render scope. Client
 * components still get their initial HTML produced by server-side
 * rendering in the App Router, and `getAuth()` throws immediately on an
 * invalid/empty API key, which would otherwise crash every page that
 * merely *renders* a login/register button before Firebase is configured.
 */
export function getFirebaseAuth(): Auth {
  if (!cachedAuth) {
    cachedAuth = getAuth(getFirebaseApp());
  }
  return cachedAuth;
}
