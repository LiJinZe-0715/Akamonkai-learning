import type {ReactNode} from "react";
import {JapaneseText} from "./JapaneseText";
import {ListenButton} from "./ListenButton";

/**
 * 一行日语：角色前缀、正文、朗读按钮各占一个 grid 列。
 *
 * 正文是唯一可伸缩列（minmax(0, 1fr)），长句换行不会压缩角色名，按钮也永远
 * 固定在行尾；不依赖 justify-content / margin-left:auto 这类对子项数量敏感的规则。
 * children 只能是说明块，渲染在日语行之外——行容器本身不接受任意内容。
 */
export function JapaneseLine({text, role, lessonId, children}: {
    text: string;
    role?: string;
    lessonId?: string;
    children?: ReactNode;
}) {
    return <>
        <div className={role ? "jline has-role" : "jline"}>
            {role && <strong className="jline-role" lang="ja" translate="no">{role}：</strong>}
            <JapaneseText text={text} className="jline-text"/>
            <ListenButton text={text} role={role} lessonId={lessonId}/>
        </div>
        {children}
    </>;
}

/** 说明块（译文、拆解）：窄标签列 + 正文列，挂在日语行下方。 */
export function LineNote({label, tone, children}: {
    label: string;
    tone?: "note";
    children: ReactNode;
}) {
    return <div className={tone === "note" ? "jline-note is-note" : "jline-note"}>
        <span className="jline-tag">{label}</span>
        <p className={tone === "note" ? "jline-note-text" : "jline-zh"}>{children}</p>
    </div>;
}
