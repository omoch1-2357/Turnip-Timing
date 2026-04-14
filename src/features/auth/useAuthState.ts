import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth, isFirebaseConfigured } from "../../lib/firebase/client";

type AuthState = {
  user: User | null;
  loading: boolean;
  authEnabled: boolean;
};

export function useAuthState(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  return {
    user,
    loading,
    authEnabled: isFirebaseConfigured,
  };
}
