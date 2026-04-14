import { GithubAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth, isFirebaseConfigured } from "../../lib/firebase/client";

const provider = new GithubAuthProvider();
provider.setCustomParameters({
  allow_signup: "true",
});

export async function signInWithGitHub() {
  if (!auth || !isFirebaseConfigured) {
    return;
  }

  await signInWithPopup(auth, provider);
}

export async function signOutUser() {
  if (!auth) {
    return;
  }

  await signOut(auth);
}
