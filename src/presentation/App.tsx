import { useEffect, Component, type ReactNode } from "react";
import { useStudy, useUi } from "./context";
import { Shell } from "./shell/Shell";
import { IndexScreen } from "./screens/IndexScreen";
import { LessonScreen } from "./screens/LessonScreen";
import { useCatalog } from "../modules/curriculum/presentation/index";
import { destinations } from "./shell/data/navigation";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section className="empty-state">
        <h1 lang="ja">ページを表示できません</h1>
        <a href="./" lang="ja">
          教材索引に戻る
        </a>
      </section>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  const { services } = useStudy();
  const t = useUi();
  const { catalog, error, retry } = useCatalog();
  useEffect(() => {
    if (!catalog || new URLSearchParams(window.location.search).has("unit")) return;
    const target = window.location.hash.slice(1);
    const isLessonEntry = catalog.books.some(book => book.units.some(unit => target === "unit-" + unit.id));
    if (!destinations.some(item => item.id === target) && !isLessonEntry) return;
    // The catalog arrives after navigation, so the browser's initial anchor scroll
    // may run before the target section exists.
    const frame = requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "instant", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [catalog]);
  let content: ReactNode = (
    <p className="empty-state" role="status">
      {t("ui.loading")}
    </p>
  );
  if (error)
    content = (
      <div className="empty-state">
        <p>{t("ui.error")}</p>
        <button onClick={retry}>{t("ui.reload")}</button>
      </div>
    );
  if (catalog) {
    try {
      const params = new URLSearchParams(window.location.search);
      const selected = services.curriculum.resolve(
        catalog,
        params.get("unit"),
        params.get("view"),
      );
      content = selected ? (
        <LessonScreen {...selected} />
      ) : (
        <IndexScreen catalog={catalog} />
      );
    } catch {
      content = (
        <div className="empty-state">
          <h1 lang="ja">教材が見つかりません</h1>
          <a href="./" lang="ja">
            教材索引に戻る
          </a>
        </div>
      );
    }
  }
  return (
    <Shell>
      <ErrorBoundary>{content}</ErrorBoundary>
    </Shell>
  );
}
