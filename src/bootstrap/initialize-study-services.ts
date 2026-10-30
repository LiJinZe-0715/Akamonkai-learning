import {createStudyServices} from "./create-study-services";
import {HttpUiCatalog} from "../modules/localization/infrastructure/http-ui-catalog";
import {HttpWordAliases} from "../modules/learning-progress/infrastructure/http-word-aliases";

export async function initializeStudyServices() {
    const [ui, aliases] = await Promise.all([new HttpUiCatalog().load(), new HttpWordAliases().load()]);
    return createStudyServices(ui, aliases);
}
