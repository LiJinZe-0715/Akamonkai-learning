import { createServices } from "./client";
import { HttpUiCatalog } from "../modules/localization/infrastructure/http-ui-catalog";
import { HttpWordAliases } from "../modules/learning-progress/infrastructure/http-word-aliases";
export async function initializeServices() {
  const [ui, aliases] = await Promise.all([new HttpUiCatalog().load(), new HttpWordAliases().load()]);
  return createServices(ui, aliases);
}
