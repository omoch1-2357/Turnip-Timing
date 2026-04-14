import type { PreviousPatternInput, RiskProfile } from "../turnips/decisionEngine";

export type ToolState = {
  buyPrice: string;
  previousPattern: PreviousPatternInput;
  riskProfile: RiskProfile;
  observedPrices: string[];
  draftUpdatedAt: string | null;
};
