import {type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState,} from "react";
import {useUi} from "../StudyContext";

/**
 * 分页阅读。
 *
 * 一课里往往有十几条文法、十几个汉字：把它们堆成一条长卷，想换一条就得
 * 先滑回顶部找索引。这里改成一页一条，左右翻页，索引挂在随滚动浮动的
 * 翻页条上——人在哪一页都能直接跳到另一页。
 *
 * 所有页都留在 DOM 里，只显示当前页：翻页是瞬时的，深链（#id）也仍然
 * 指向页面内原有的锚点。
 */
export interface PagedItem {
    /** 与页面内锚点同名，供深链定位。 */
    id: string;
    /** 跳转列表里的一行短标签。 */
    label: string;
    content: ReactNode;
}

interface PagedProps {
    items: readonly PagedItem[];
    /** 整个分页区域的可访问名称。 */
    label: string;
    /** 完整索引，由翻页条展开：汉字表或文法目录。 */
    index?: (select: (position: number) => void, current: number) => ReactNode;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** 地址栏里的锚点决定首屏翻到哪一页。 */
function hashPosition(items: readonly PagedItem[]) {
    const hash = typeof window === "undefined" ? "" : window.location?.hash ?? "";
    if (!hash) return 0;
    const found = items.findIndex(item => "#" + item.id === hash);
    return found < 0 ? 0 : found;
}

/** 顶栏与模式切换条都浮在页面上方，翻页条要停在它们下面。 */
function useStickyTop() {
    const [top, setTop] = useState(66);
    useLayoutEffect(() => {
        if (typeof window === "undefined" || typeof document === "undefined") return;
        const measure = () => {
            const header = document.querySelector<HTMLElement>(".site-header");
            const modes = document.querySelector<HTMLElement>(".lesson-modes");
            setTop((header?.offsetHeight ?? 0) + (modes?.offsetHeight ?? 0));
        };
        measure();
        window.addEventListener("resize", measure);
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
        document.querySelectorAll(".site-header, .lesson-modes").forEach(node => observer?.observe(node));
        return () => {
            window.removeEventListener("resize", measure);
            observer?.disconnect();
        };
    }, []);
    return top;
}

export function Paged(props: PagedProps) {
    // 只有一页时不需要翻页条：它已经是一屏了。
    if (props.items.length <= 1) return <>{props.items[0]?.content ?? null}</>;
    return <PagedBook {...props}/>;
}

function PagedBook({items, label, index}: PagedProps) {
    const t = useUi();
    const total = items.length;
    const [view, setView] = useState(() => ({position: hashPosition(items), direction: 0}));
    const [indexOpen, setIndexOpen] = useState(false);
    const top = useStickyTop();
    const section = useRef<HTMLElement>(null);
    const active = useRef<HTMLDivElement>(null);
    const swipe = useRef<{ x: number; y: number; pointer: number } | null>(null);

    const go = useCallback((next: number) => {
        setView(current => {
            const position = Math.min(Math.max(next, 0), total - 1);
            if (position === current.position) return current;
            return {position, direction: position > current.position ? 1 : -1};
        });
    }, [total]);

    const step = useCallback((delta: number) => {
        setView(current => {
            const position = Math.min(Math.max(current.position + delta, 0), total - 1);
            if (position === current.position) return current;
            return {position, direction: delta > 0 ? 1 : -1};
        });
    }, [total]);

    const choose = useCallback((next: number) => {
        go(next);
        setIndexOpen(false);
    }, [go]);

    // 当前页写回地址栏，复制出去的链接就能直接打开这一页。
    useEffect(() => {
        const item = items[view.position];
        if (!item || typeof window === "undefined" || !window.history) return;
        if (window.location.hash === "#" + item.id) return;
        window.history.replaceState(null, "", "#" + item.id);
    }, [items, view.position]);

    // 手点锚点或改地址栏时同步页码；不认识的锚点（如页内跳转）不动当前页。
    useEffect(() => {
        const onHash = () => {
            const found = items.findIndex(item => "#" + item.id === (window.location?.hash ?? ""));
            if (found >= 0) go(found);
        };
        window.addEventListener("hashchange", onHash);
        return () => window.removeEventListener("hashchange", onHash);
    }, [items, go]);

    // 键盘左右翻页；焦点在输入控件里时交给控件自己处理。
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                step(-1);
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                step(1);
            } else if (event.key === "Escape") {
                setIndexOpen(false);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [step]);

    // 已经翻到长页深处时，换页要回到这一页的顶部，否则新页会从中间开始。
    useEffect(() => {
        if (view.direction === 0 || !section.current || typeof window === "undefined") return;
        const box = section.current.getBoundingClientRect();
        if (box.top >= top - 1) return;
        window.scrollTo({top: window.scrollY + box.top - top, behavior: "instant"});
    }, [view, top]);

    // 页面常驻 DOM，靠重放动画做翻页的动势。
    useEffect(() => {
        const node = active.current;
        if (!node || view.direction === 0) return;
        node.style.animation = "none";
        void node.offsetWidth;
        node.style.animation = "";
    }, [view]);

    const onPointerDown = (event: ReactPointerEvent) => {
        if (event.pointerType === "mouse") return;
        swipe.current = {x: event.clientX, y: event.clientY, pointer: event.pointerId};
    };

    const onPointerUp = (event: ReactPointerEvent) => {
        const origin = swipe.current;
        swipe.current = null;
        if (!origin || origin.pointer !== event.pointerId) return;
        const dx = event.clientX - origin.x;
        const dy = event.clientY - origin.y;
        // 竖向的拖动是滚动，不是翻页。
        if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        step(dx < 0 ? 1 : -1);
    };

    return (
        <section className="paged" aria-label={label} ref={section} data-direction={view.direction}>
            <div className="paged-bar" style={{top}}>
                <div className="paged-row">
                    <button
                        type="button"
                        className="paged-step"
                        onClick={() => step(-1)}
                        disabled={view.position === 0}
                        aria-label={t("ui.pagedPrevious")}
                    >
                        <span aria-hidden="true">←</span>
                        <span className="paged-step-text">{t("ui.pagedPrevious")}</span>
                    </button>
                    <div className="paged-middle">
                        <span className="paged-count" aria-live="polite">
                            <b>{pad(view.position + 1)}</b> / {pad(total)}
                        </span>
                        <select
                            className="paged-select"
                            value={view.position}
                            aria-label={t("ui.pagedJump")}
                            onChange={event => go(Number(event.currentTarget.value))}
                        >
                            {items.map((item, position) => (
                                <option key={item.id} value={position}>{item.label}</option>
                            ))}
                        </select>
                        {index && (
                            <button
                                type="button"
                                className="paged-index-toggle"
                                aria-expanded={indexOpen}
                                onClick={() => setIndexOpen(open => !open)}
                            >
                                {t("ui.pagedIndex")}
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        className="paged-step"
                        onClick={() => step(1)}
                        disabled={view.position === total - 1}
                        aria-label={t("ui.pagedNext")}
                    >
                        <span className="paged-step-text">{t("ui.pagedNext")}</span>
                        <span aria-hidden="true">→</span>
                    </button>
                </div>
                {/* 收起时也保留在文档里：索引里带着
                    深链接指向的页内锚点。 */}
                {index && <div className="paged-index" hidden={!indexOpen}>{index(choose, view.position)}</div>}
                <div className="paged-progress" aria-hidden="true">
                    <span style={{width: ((view.position + 1) / total * 100) + "%"}}/>
                </div>
            </div>
            <div className="paged-viewport" onPointerDown={onPointerDown} onPointerUp={onPointerUp}
                 onPointerCancel={() => {
                     swipe.current = null;
                 }}>
                {items.map((item, position) => (
                    <div
                        className="paged-page"
                        key={item.id}
                        hidden={position !== view.position}
                        data-active={position === view.position ? "true" : undefined}
                        ref={position === view.position ? active : undefined}
                        role="group"
                        aria-label={item.label}
                    >
                        {item.content}
                    </div>
                ))}
            </div>
        </section>
    );
}
