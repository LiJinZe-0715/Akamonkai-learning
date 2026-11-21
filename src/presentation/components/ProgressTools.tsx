import {useEffect, useRef, useState} from "react";
import {useUi} from "../StudyContext";
import {useProgressTools} from "../shell/use-progress-tools";

/** 清空学习记录：先说清后果、建议先导出，再点一次「确认清空」才动手。 */
function ClearProgress({onConfirm}: { onConfirm: () => Promise<void> }) {
    const t = useUi();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const panel = useRef<HTMLDivElement>(null);
    // 确认区在页面最底部，展开后滚到看得见的位置，免得按钮落在屏幕外。
    useEffect(() => {
        if (confirming) panel.current?.scrollIntoView({behavior: "smooth", block: "nearest"});
    }, [confirming]);
    if (!confirming)
        return <div className="button-row clear-progress">
            <button className="danger" onClick={() => setConfirming(true)}>{t("ui.clearProgress")}</button>
        </div>;
    return <div ref={panel} className="clear-progress" role="alertdialog" aria-labelledby="clear-progress-warning">
        <p id="clear-progress-warning">{t("ui.clearProgressWarning")}</p>
        <div className="button-row">
            <button className="danger" disabled={busy} onClick={async () => {
                setBusy(true);
                try {
                    await onConfirm();
                } finally {
                    setBusy(false);
                    setConfirming(false);
                }
            }}>{t("ui.clearProgressConfirm")}</button>
            <button disabled={busy} onClick={() => setConfirming(false)}>{t("ui.cancel")}</button>
        </div>
    </div>;
}

/** 首页底部：学习记录的导出、导入与清空。记录只存在本机，所以和记录放在同一页。 */
export function ProgressTools() {
    const t = useUi();
    const {exportProgress, exportRecovery, hasRecovery, importFile, clearAll} = useProgressTools();
    return <section className="record-section progress-tools" aria-labelledby="data-tools-title">
        <div className="dashboard-section-heading"><h2 id="data-tools-title">{t("ui.dataTools")}</h2></div>
        <p>{t("ui.localOnly")}</p>
        <div className="button-row">
            <button onClick={exportProgress}>{t("ui.export")}</button>
            <label className="file-button">{t("ui.import")}<input type="file" accept=".json,application/json"
                                                                  onChange={async e => {
                                                                      const file = e.target.files?.[0];
                                                                      if (!file) return;
                                                                      const input = e.currentTarget;
                                                                      try {
                                                                          await importFile(file);
                                                                      } finally {
                                                                          input.value = "";
                                                                      }
                                                                  }}/></label>
            {hasRecovery && <button onClick={exportRecovery}>{t("ui.exportRecovery")}</button>}
        </div>
        <ClearProgress onConfirm={clearAll}/>
    </section>;
}
