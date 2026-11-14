/**
 * 教材一条录音轨里用 ■ 小标题和 ①②③④ 分组时，正文里用来隔开的标题与组号。
 *
 * 两个字段都是「起始标记」：只挂在该篇首段／每个组的第一条台词或第一个段落上，
 * 所以这里只在字段有值时渲染，组内后续行不再重复。■ 是排版符号，不写进数据。
 */
export function GroupHeads({section, group}: {section?: string; group?: string}) {
    return <>
        {section && <h3 className="passage-section" lang="ja" translate="no">■ {section}</h3>}
        {group && <div className="passage-group-label" lang="ja" translate="no">{group}</div>}
    </>;
}
