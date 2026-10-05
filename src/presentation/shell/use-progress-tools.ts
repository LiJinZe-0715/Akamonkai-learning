import { useStudy } from "../context";
export function useProgressTools() {
  const { services, currentProgress, updateProgress, setMessage } = useStudy();
  return {
    download: () => services.progressTransfer.export(currentProgress()),
    downloadRecovery: () => services.progressTransfer.exportRecovery(),
    hasRecovery: services.progress.recovery() !== undefined,
    importFile: async (file: unknown) => {
      try {
        const outcome = await services.progressTransfer.import(file, currentProgress);
        if (outcome.status === "imported") {
          const persisted = await updateProgress(outcome.progress);
          setMessage(persisted ? "ui.imported" : "ui.storageError");
        } else setMessage("ui.invalidFile");
      } catch { setMessage("ui.storageError"); }
    },
  };
}
