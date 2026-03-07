(function registerImageJobRunner(ns) {
  function t(key, defaultValue, options) {
    return ns.i18n.t(key, {
      defaultValue,
      ...(options || {})
    });
  }

  function getNodeRequire() {
    return window.require || (typeof require === "function" ? require : null);
  }

  async function removeFile(fs, filePath) {
    if (!filePath) {
      return;
    }

    try {
      await fs.rm(filePath, { force: true });
    } catch (error) {
      // Best-effort cleanup for temporary export files.
    }
  }

  async function removeDirectory(fs, directoryPath) {
    if (!directoryPath) {
      return;
    }

    try {
      await fs.rm(directoryPath, { recursive: true, force: true });
    } catch (error) {
      // Best-effort cleanup for temporary workspaces.
    }
  }

  async function runBatch(options) {
    const nodeRequire = getNodeRequire();
    if (!nodeRequire) {
      throw new Error("Node.js runtime is not available.");
    }

    const path = nodeRequire("path");
    const fs = nodeRequire("fs").promises;
    const os = nodeRequire("os");
    const queue = [...options.items];
    const activeTasks = new Set();
    const concurrency = Math.max(1, Math.min(2, queue.length || 1));
    const isEagleFolderTarget = options.settings.outputTargetType === "eagle-folder";
    const tempWorkspace = isEagleFolderTarget
      ? await fs.mkdtemp(path.join(os.tmpdir(), "eagle-thumb-"))
      : "";

    const stats = {
      total: options.items.length,
      completed: 0,
      success: 0,
      error: 0,
      canceled: 0
    };

    let canceled = false;

    function emitProgress() {
      options.onProgress({
        ...stats
      });
    }

    async function handleItem(item) {
      let activeRecord = null;
      let outputTarget = null;
      try {
        const requestedFileName = ns.namingService.buildOutputFileName(item, options.settings);
        outputTarget = await ns.namingService.getUniqueOutputPath(
          isEagleFolderTarget ? tempWorkspace : options.settings.outputDirectory,
          requestedFileName
        );

        options.onItemUpdate(item.id, {
          status: "running",
          statusMessage: t("status.running", "Running"),
          outputFileName: outputTarget.fileName
        });

        const task = ns.ffmpegService.createConversionTask({
          item,
          settings: options.settings,
          outputPath: outputTarget.filePath,
          ffmpegPath: options.ffmpegPaths.ffmpeg
        });

        activeRecord = {
          itemId: item.id,
          task
        };

        activeTasks.add(activeRecord);

        await task.promise;

        if (isEagleFolderTarget) {
          await ns.eagleService.importFileToFolder(outputTarget.filePath, options.eagleFolder.id, {
            fileName: outputTarget.fileName
          });
          await removeFile(fs, outputTarget.filePath);
          stats.success += 1;
          options.onItemUpdate(item.id, {
            status: "success",
            statusMessage: options.eagleFolder.pathLabel || options.eagleFolder.name || "Eagle",
            outputFileName: outputTarget.fileName
          });
        } else {
          stats.success += 1;
          options.onItemUpdate(item.id, {
            status: "success",
            statusMessage: path.basename(outputTarget.filePath),
            outputFileName: outputTarget.fileName
          });
        }
      } catch (error) {
        if (isEagleFolderTarget) {
          await removeFile(fs, outputTarget ? outputTarget.filePath : "");
        }

        if (canceled || error.code === "TASK_CANCELED") {
          stats.canceled += 1;
          options.onItemUpdate(item.id, {
            status: "canceled",
            statusMessage: t("status.canceled", "Canceled"),
            outputFileName: outputTarget ? outputTarget.fileName : item.outputFileName
          });
        } else {
          stats.error += 1;
          options.onItemUpdate(item.id, {
            status: "error",
            statusMessage: error.message,
            outputFileName: outputTarget ? outputTarget.fileName : item.outputFileName
          });
        }
      } finally {
        if (activeRecord) {
          activeTasks.delete(activeRecord);
        }
        stats.completed += 1;
        emitProgress();
      }
    }

    async function worker() {
      while (queue.length > 0) {
        if (canceled) {
          return;
        }

        const nextItem = queue.shift();
        if (!nextItem) {
          return;
        }

        await handleItem(nextItem);
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker());

    return {
      async done() {
        await Promise.allSettled(workers);
        await removeDirectory(fs, tempWorkspace);
        return {
          ...stats
        };
      },
      cancel() {
        if (canceled) {
          return;
        }

        canceled = true;

        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) {
            continue;
          }

          stats.canceled += 1;
          stats.completed += 1;
          options.onItemUpdate(item.id, {
            status: "canceled",
            statusMessage: t("status.canceled", "Canceled")
          });
          emitProgress();
        }

        activeTasks.forEach((activeRecord) => {
          activeRecord.task.cancel();
        });
      }
    };
  }

  ns.imageJobRunner = {
    runBatch
  };
})(window.EagleThumb = window.EagleThumb || {});
