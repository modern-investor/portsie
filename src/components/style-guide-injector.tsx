import { fetchStyleGuide } from "@/lib/style-guide/server";
import { styleGuideToCss } from "@/lib/style-guide/css";

export async function StyleGuideInjector() {
  const guide = await fetchStyleGuide();
  const css = styleGuideToCss(guide);
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
