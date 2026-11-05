import {Component, type ReactNode, useEffect} from "react";
import {useServices, useUi} from "./StudyContext";
import {Shell} from "./shell/Shell";
import {SpeechGuideScreen} from "./pages/SpeechGuideScreen";
import {BookScreen, CatalogScreen, HomeScreen, LessonScreen, useCatalog} from "../modules/curriculum/presentation/index";
import {type LessonSelection, UnavailableLessonError} from "../modules/curriculum/public";
import {SettingsScreen} from "./pages/SettingsScreen";
import {ProgressTools} from "./components/ProgressTools";
import {SearchScreen} from "../modules/search/presentation/index";

class ErrorBoundary extends Component<
    { children: ReactNode },
    { failed: boolean }
> {
    state = {failed: false};

    static getDerivedStateFromError() {
        return {failed: true};
    }

    render() {
        return this.state.failed ? (
            <ErrorFallback onRetry={() => this.setState({failed: false})}/>
        ) : (
            this.props.children
        );
    }
}

function ErrorFallback({onRetry}: {onRetry: () => void}) {
    const t = useUi();
    return (
        <section className="empty-state">
            <p role="alert">{t("ui.error")}</p>
            <button type="button" onClick={onRetry}>{t("ui.reload")}</button>
            <a href="./">{t("ui.allBooks")}</a>
        </section>
    );
}

export function App() {
    const services = useServices();
    const t = useUi();
    const {catalog, error, retry} = useCatalog();
    useEffect(() => {
        if (!catalog || new URLSearchParams(window.location.search).has("unit")) return;
        const target = window.location.hash.slice(1);
        const isLessonEntry = catalog.books.some(book => book.lessonIds.some(id => target === "unit-" + id));
        if (!isLessonEntry) return;
        // 目录在导航之后才到达，浏览器的首次锚点滚动
        // 可能早于目标区块出现。
        const frame = requestAnimationFrame(() => {
            document.getElementById(target)?.scrollIntoView({behavior: "instant", block: "start"});
        });
        return () => cancelAnimationFrame(frame);
    }, [catalog]);
    const params = new URLSearchParams(window.location.search);
    // 引擎指南是说明文字而非内容数据，不用等目录加载就能打开。
    const guide = params.get("page") === "speech";
    // 全文检索自带索引文件，同样不依赖目录。
    const searching = params.get("page") === "search";
    // 设置页也不依赖目录：教材加载失败时仍然能调外观、语言、导出记录。
    const settings = params.get("page") === "settings";
    const library = params.get("page") === "library";
    let content: ReactNode = (
        <p className="empty-state" role="status">
            {t("ui.loading")}
        </p>
    );
    if (guide)
        content = <SpeechGuideScreen/>;
    else if (searching)
        content = <SearchScreen/>;
    else if (settings)
        content = <SettingsScreen/>;
    else if (error)
        content = (
            <div className="empty-state">
                <p>{t("ui.error")}</p>
                <button onClick={retry}>{t("ui.reload")}</button>
            </div>
        );
    if (catalog && !guide && !searching && !settings) {
        const unitId = params.get("unit");
        const bookId = params.get("book");
        const book = catalog.books.find(item => item.id === bookId);
        // 不带视图参数的课次 URL 打开该课次的默认模式。
        // 只有课次不存在可以恢复；其他错误一律交给错误边界。
        let selected: LessonSelection | null = null;
        let isMissing = !unitId && !!bookId && !book;
        if (!isMissing) {
            try {
                selected = services.curriculum.select(catalog, unitId, params.get("view"));
            } catch (error) {
                if (!(error instanceof UnavailableLessonError)) throw error;
                isMissing = true;
            }
        }
        content = isMissing ? (
            <div className="empty-state">
                <h1 lang="ja">教材が見つかりません</h1>
                <a href="./" lang="ja">
                    教材索引に戻る
                </a>
            </div>
        ) : selected ? (
            <LessonScreen {...selected} catalog={catalog}/>
        ) : book ? (
            <BookScreen book={book} catalog={catalog}/>
        ) : library ? (
            <CatalogScreen catalog={catalog}/>
        ) : (
            <><HomeScreen catalog={catalog}/><ProgressTools/></>
        );
    }
    return (
        <Shell>
            <ErrorBoundary>{content}</ErrorBoundary>
        </Shell>
    );
}
