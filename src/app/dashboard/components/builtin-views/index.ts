export { ConcentrationRisk } from "./concentration-risk";
export { DiversificationRadar } from "./diversification-radar";
export { AccountQuality } from "./account-quality";
export { AssetCompositionDonut } from "./asset-composition-donut";

/** Registry of built-in view IDs and labels for the UI. */
export const BUILTIN_VIEWS = [
  { id: "concentration", label: "Concentration" },
  { id: "diversification", label: "Diversification" },
  { id: "accounts-quality", label: "Acct Quality" },
  { id: "composition", label: "Composition" },
] as const;

export type BuiltinViewId = (typeof BUILTIN_VIEWS)[number]["id"];
