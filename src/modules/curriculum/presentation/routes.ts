import type { View } from "../public";
/** Query links remain relative to the deployment directory. */
export const lessonHref = (id: string, view: View): string => "?unit=" + encodeURIComponent(id) + "&view=" + view;
