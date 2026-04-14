import { currentTool } from "../../config/tool";
import type { ToolState } from "./types";

const STORAGE_KEY = `tool-state:${currentTool.toolId}`;

const emptyState: ToolState = {
  draft: "",
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
    const parsedValue = JSON.parse(rawValue) as ToolState & { updatedAt?: string | null };
    return {
      draft: typeof parsedValue.draft === "string" ? parsedValue.draft : "",
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
