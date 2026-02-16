import { createClient } from "@/lib/supabase/server";
import { STYLE_GUIDE_DEFAULTS } from "./defaults";
import type { StyleGuide } from "./types";

export async function fetchStyleGuide(): Promise<StyleGuide> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("style_guide")
      .select("*")
      .single();

    if (error || !data) return STYLE_GUIDE_DEFAULTS;
    return data as StyleGuide;
  } catch {
    return STYLE_GUIDE_DEFAULTS;
  }
}
