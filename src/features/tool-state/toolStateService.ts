import type { User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { currentTool } from "../../config/tool";
import { db } from "../../lib/firebase/client";
import type { ToolState } from "./types";

function getDocumentRef(user: User) {
  if (!db) {
    throw new Error("Firestore が利用できません。");
  }

  return doc(db, "users", user.uid, "apps", currentTool.toolId);
}

export async function fetchCloudState(user: User): Promise<ToolState> {
  const snapshot = await getDoc(getDocumentRef(user));
  const data = snapshot.data();

  return {
    draft: typeof data?.draft === "string" ? data.draft : "",
    draftUpdatedAt:
      typeof data?.draftUpdatedAt?.toDate === "function"
        ? data.draftUpdatedAt.toDate().toISOString()
        : null,
  };
}

export async function saveCloudState(user: User, state: ToolState) {
  await setDoc(
    getDocumentRef(user),
    {
      draft: state.draft,
      draftUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
