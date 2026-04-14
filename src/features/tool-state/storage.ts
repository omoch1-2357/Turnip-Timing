import { currentTool } from "../../config/tool";
import type { ToolState } from "./types";

const STORAGE_KEY = `tool-state:${currentTool.toolId}`;

const emptyState: ToolState = {
  buyPrice: "",
  previousPattern: "unknown",
  riskProfile: "neutral",
  observedPrices: Array.from({ length: 12 }, () => ""),
  draftUpdatedAt: null,
};

function safeGetItem(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveItem(key: string) {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadLocalState(): ToolState {
  const rawValue = safeGetItem(STORAGE_KEY);
  if (!rawValue) {
    return emptyState;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<ToolState> & {
      draft?: string;
      updatedAt?: string | null;
    };
    return {
      buyPrice: typeof parsedValue.buyPrice === "string" ? parsedValue.buyPrice : "",
      previousPattern:
        parsedValue.previousPattern === "0" ||
        parsedValue.previousPattern === "1" ||
        parsedValue.previousPattern === "2" ||
        parsedValue.previousPattern === "3"
          ? parsedValue.previousPattern
          : "unknown",
      riskProfile:
        parsedValue.riskProfile === "conservative" ||
        parsedValue.riskProfile === "neutral" ||
        parsedValue.riskProfile === "aggressive"
          ? parsedValue.riskProfile
          : "neutral",
      observedPrices: Array.isArray(parsedValue.observedPrices)
        ? Array.from({ length: 12 }, (_, index) =>
            typeof parsedValue.observedPrices?.[index] === "string" ? parsedValue.observedPrices[index] : "",
          )
        : Array.from({ length: 12 }, () => ""),
      draftUpdatedAt:
        typeof parsedValue.draftUpdatedAt === "string"
          ? parsedValue.draftUpdatedAt
          : typeof parsedValue.updatedAt === "string"
            ? parsedValue.updatedAt
            : null,
    };
  } catch {
    return emptyState;
  }
}

export function saveLocalState(state: ToolState) {
  return safeSetItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearLocalState() {
  return safeRemoveItem(STORAGE_KEY);
}
