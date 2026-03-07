(function registerFfmpegService(ns) {
  function t(key, defaultValue) {
    return ns.i18n.t(key, { defaultValue });
  }

  function getNodeRequire() {
    return window.require || (typeof require === "function" ? require : null);
  }

  function mapJpegQuality(value) {
    const quality = Math.min(100, Math.max(1, Number(value) || 82));
    const ffmpegScale = Math.round(31 - ((quality - 1) / 99) * 29);
    return Math.min(31, Math.max(2, ffmpegScale));
  }

  function buildResizeDimensions(item, settings) {
    const ratio = (Number(settings.resizeRatio) || 100) / 100;
    const width = Math.max(1, Math.round((Number(item.width) || 1) * ratio));
    const height = Math.max(1, Math.round((Number(item.height) || 1) * ratio));

    return { width, height };
  }

  function buildArgs(item, settings, outputPath) {
    const { width, height } = buildResizeDimensions(item, settings);
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      item.filePath,
      "-vf",
      `scale=${width}:${height}:flags=lanczos`,
      "-frames:v",
      "1"
    ];

    switch (settings.outputFormat) {
      case "png":
        args.push("-compression_level", String(settings.pngCompressionLevel));
        break;
      case "webp":
        args.push("-quality", String(settings.quality), "-compression_level", "4", "-lossless", "0");
        break;
      case "jpg":
      default:
        args.push("-q:v", String(mapJpegQuality(settings.quality)), "-pix_fmt", "yuvj420p");
        break;
    }

    args.push(outputPath);
    return args;
  }

  function createConversionTask(options) {
    const nodeRequire = getNodeRequire();
    if (!nodeRequire) {
      throw new Error("Node.js child_process API is not available.");
    }

    const spawn = nodeRequire("child_process").spawn;
    const args = buildArgs(options.item, options.settings, options.outputPath);
    let childProcess = null;
    let canceled = false;

    const promise = new Promise((resolve, reject) => {
      childProcess = spawn(options.ffmpegPath, args, {
        windowsHide: true
      });

      let stderr = "";

      childProcess.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      childProcess.on("error", (error) => {
        reject(error);
      });

      childProcess.on("close", (code, signal) => {
        if (canceled || signal) {
          const cancellationError = new Error(t("status.canceled", "Canceled"));
          cancellationError.code = "TASK_CANCELED";
          reject(cancellationError);
          return;
        }

        if (code === 0) {
          resolve({
            outputPath: options.outputPath,
            stderr
          });
          return;
        }

        reject(new Error(stderr || `ffmpeg exited with code ${code}`));
      });
    });

    return {
      promise,
      cancel() {
        canceled = true;
        if (childProcess && !childProcess.killed) {
          childProcess.kill();
        }
      },
      args
    };
  }

  ns.ffmpegService = {
    buildArgs,
    buildResizeDimensions,
    createConversionTask
  };
})(window.EagleThumb = window.EagleThumb || {});
