import type {ReactNode} from "react";
import type {ExamModule, ExamSection} from "../../public";

/** 三大块的卷面名。 */
export const moduleTitles: Readonly<Record<ExamModule, string>> = {
    knowledge: "言語知識",
    reading: "読解",
    listening: "聴解",
};

/** 卷面题号区间，如「52–56」；只有一题时是「52」。 */
export function range(numbers: readonly number[]): string {
    if (!numbers.length) return "";
    return numbers.length === 1 ? String(numbers[0]) : `${numbers[0]}–${numbers[numbers.length - 1]}`;
}

/**
 * 小节标题：大题号 + 可选的小节名。
 * 読解 問題12/13/14 卷面只印大题指示、没有独立文章标题，此时不追加全角空格，
 * 也不能把指示的截断副本当标题显示——它已在 section.instruction 里完整印出。
 */
export function sectionHeading(label: string, title: string): string {
    return title ? `${label}　${title}` : label;
}

/** 真题的一节：卷面标题、指示、正文／配图，题目由调用方挂在 children。 */
export function ExamSectionView({section, children}: {section: ExamSection; children?: ReactNode}) {
    return (
        <article className={"exam-section exam-section-" + section.module} id={section.id}>
            <header className="exam-section-head">
                <p className="exam-section-module" lang="ja" translate="no">{moduleTitles[section.module]}</p>
                <h2 className="exam-section-title" lang="ja" translate="no">
                    {sectionHeading(section.label, section.title)}
                </h2>
                <span className="exam-section-range">{range(section.questions.map(question => question.number))}</span>
            </header>
            {section.instruction && (
                <p className="question-section-instruction" lang="ja" translate="no">{section.instruction}</p>
            )}
            {section.image && (
                <img className="article-image" src={section.image}
                     alt={sectionHeading(section.label, section.title)} lang="ja"/>
            )}
            {section.body && (
                <div className="exam-passage-body" lang="ja" translate="no">
                    {section.body.map((line, position) => <p className="passage-text" key={position}>{line}</p>)}
                </div>
            )}
            {children}
        </article>
    );
}
