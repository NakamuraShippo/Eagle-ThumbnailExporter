(function registerNamingService(ns) {
  function getNodeRequire() {
    return window.require || (typeof require === "function" ? require : null);
  }

  function getFsAndPath() {
    const nodeRequire = getNodeRequire();
    if (!nodeRequire) {
      throw new Error("Node.js API is not available in this renderer.");
    }

    return {
      fs: nodeRequire("fs").promises,
      path: nodeRequire("path")
    };
  }

  function sanitizeFileNamePart(value) {
    return String(value || "")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getBaseName(item) {
    const nodeRequire = getNodeRequire();
    const path = nodeRequire ? nodeRequire("path") : null;
    const fallbackName = item && item.filePath && path ? path.parse(item.filePath).name : "image";
    const rawName = sanitizeFileNamePart((item && item.name) || fallbackName || "image");
    const parsed = path ? path.parse(rawName) : { name: rawName };

    return sanitizeFileNamePart(parsed.name || rawName || "image") || "image";
  }

  function getOutputExtension(format) {
    const normalized = String(format || "jpg").toLowerCase();
    if (normalized === "jpeg") {
      return "jpg";
    }

    return normalized;
  }

  function buildOutputFileName(item, settings) {
    const renameMode = settings.renameMode || "none";
    const renameText = sanitizeFileNamePart(settings.renameText || "");
    const baseName = getBaseName(item);
    const outputExtension = getOutputExtension(settings.outputFormat);
    let nextName = baseName;

    if (renameMode === "prefix" && renameText) {
      nextName = `${renameText}${baseName}`;
    }

    if (renameMode === "suffix" && renameText) {
      nextName = `${baseName}${renameText}`;
    }

    const safeName = sanitizeFileNamePart(nextName) || "image";
    return `${safeName}.${outputExtension}`;
  }

  async function getUniqueOutputPath(outputDirectory, requestedFileName) {
    const { fs, path } = getFsAndPath();
    const parsed = path.parse(requestedFileName);
    let candidateName = requestedFileName;
    let counter = 1;

    while (true) {
      const candidatePath = path.join(outputDirectory, candidateName);

      try {
        await fs.access(candidatePath);
        candidateName = `${parsed.name}_${String(counter).padStart(3, "0")}${parsed.ext}`;
        counter += 1;
      } catch (error) {
        return {
          fileName: candidateName,
          filePath: candidatePath
        };
      }
    }
  }

  ns.namingService = {
    buildOutputFileName,
    getOutputExtension,
    getUniqueOutputPath,
    sanitizeFileNamePart
  };
})(window.EagleThumb = window.EagleThumb || {});
