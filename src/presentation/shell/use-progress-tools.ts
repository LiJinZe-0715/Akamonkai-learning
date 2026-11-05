import {useServices, useProgressActions, useFeedback} from "../StudyContext";

export function useProgressTools() {
    const services = useServices();
    const {currentProgress, updateProgress, clearProgress} = useProgressActions();
    const {setNotice} = useFeedback();
    return {
        exportProgress: () => services.progressTransfer.export(currentProgress()),
        exportRecovery: () => services.progressTransfer.exportRecovery(),
        hasRecovery: services.progress.recovery() !== undefined,
        clearAll: async () => {
            try {
                const persisted = await clearProgress();
                // 做到一半的测验答案也属于学习记录，一起清掉。
                const draftsCleared = services.drafts.clearAll();
                setNotice(persisted && draftsCleared ? "ui.progressCleared" : "ui.storageError");
            } catch {
                setNotice("ui.storageError");
            }
        },
        importFile: async (file: unknown) => {
            try {
                const outcome = await services.progressTransfer.import(file, currentProgress);
                if (outcome.status === "imported") {
                    const persisted = await updateProgress(outcome.progress);
                    setNotice(persisted ? "ui.imported" : "ui.storageError");
                } else setNotice("ui.invalidFile");
            } catch {
                setNotice("ui.storageError");
            }
        },
    };
}
