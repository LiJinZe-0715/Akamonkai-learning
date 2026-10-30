import {type Catalog, isStudyView} from "./catalog";

/** The only recoverable routing failure: the URL names a lesson that does not exist. */
export class UnavailableLessonError extends Error {
    constructor() {
        super("Unavailable lesson");
        this.name = "UnavailableLessonError";
    }
}

/** Aggregate policy: only a catalogued unit and its enabled study views may be selected. */
export class Curriculum {
    constructor(private readonly catalog: Catalog) {
    }

    select(unitId: string, view: string | null) {
        const book = this.catalog.books.find(b => b.units.some(u => u.id === unitId));
        const unit = book?.units.find(u => u.id === unitId);
        if (!book || !unit || !isStudyView(view) || !unit.views.includes(view))
            throw new UnavailableLessonError();
        return {book, unit, view};
    }
}
