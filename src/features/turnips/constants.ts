export const SLOT_LABELS = [
  "月曜午前",
  "月曜午後",
  "火曜午前",
  "火曜午後",
  "水曜午前",
  "水曜午後",
  "木曜午前",
  "木曜午後",
  "金曜午前",
  "金曜午後",
  "土曜午前",
  "土曜午後",
] as const;

export const PATTERN_LABELS = {
  0: "波型",
  1: "大スパイク型",
  2: "減少型",
  3: "小スパイク型",
} as const;

export const PREVIOUS_PATTERN_OPTIONS = [
  { value: "unknown", label: "不明" },
  { value: "0", label: PATTERN_LABELS[0] },
  { value: "1", label: PATTERN_LABELS[1] },
  { value: "2", label: PATTERN_LABELS[2] },
  { value: "3", label: PATTERN_LABELS[3] },
] as const;

export const RISK_PROFILE_OPTIONS = [
  { value: "conservative", label: "保守型" },
  { value: "neutral", label: "中立" },
  { value: "aggressive", label: "強気型" },
] as const;
