import {createStudyServices} from "./create-study-services";
import {HttpUiCatalog} from "../modules/localization/infrastructure/http-ui-catalog";

export async function initializeStudyServices() {
    return createStudyServices(await new HttpUiCatalog().load());
}
