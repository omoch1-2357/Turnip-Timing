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
    buyPrice: typeof data?.buyPrice === "string" ? data.buyPrice : "",
    previousPattern:
      data?.previousPattern === "0" ||
      data?.previousPattern === "1" ||
      data?.previousPattern === "2" ||
      data?.previousPattern === "3"
        ? data.previousPattern
        : "unknown",
    riskProfile:
      data?.riskProfile === "conservative" ||
      data?.riskProfile === "neutral" ||
      data?.riskProfile === "aggressive"
        ? data.riskProfile
        : "neutral",
    observedPrices: Array.isArray(data?.observedPrices)
      ? Array.from({ length: 12 }, (_, index) =>
          typeof data.observedPrices[index] === "string" ? data.observedPrices[index] : "",
        )
      : Array.from({ length: 12 }, () => ""),
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
      buyPrice: state.buyPrice,
      previousPattern: state.previousPattern,
      riskProfile: state.riskProfile,
      observedPrices: state.observedPrices,
      draftUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
