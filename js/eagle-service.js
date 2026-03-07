(function registerEagleService(ns) {
  function t(key, defaultValue, options) {
    return ns.i18n.t(key, {
      defaultValue,
      ...(options || {})
    });
  }

  function getNodeRequire() {
    return window.require || (typeof require === "function" ? require : null);
  }

  function getPathModule() {
    const nodeRequire = getNodeRequire();
    return nodeRequire ? nodeRequire("path") : null;
  }

  function log(level, message) {
    if (window.eagle && window.eagle.log && typeof window.eagle.log[level] === "function") {
      window.eagle.log[level](message);
    }
  }

  function mapItem(rawItem) {
    const path = getPathModule();
    const fallbackName = rawItem.filePath && path ? path.parse(rawItem.filePath).name : "image";

    return {
      id: String(rawItem.id || ""),
      name: String(rawItem.name || fallbackName || "image"),
      ext: String(rawItem.ext || "").toLowerCase(),
      filePath: String(rawItem.filePath || ""),
      thumbnailURL: String(rawItem.thumbnailURL || rawItem.fileURL || ""),
      width: Number(rawItem.width) || 0,
      height: Number(rawItem.height) || 0,
      size: Number(rawItem.size) || 0,
      status: "pending",
      statusMessage: t("status.pending", "Pending"),
      outputFileName: ""
    };
  }

  function mapFolder(rawFolder) {
    return {
      id: String(rawFolder.id || ""),
      name: String(rawFolder.name || ""),
      parent: rawFolder.parent == null ? "" : String(rawFolder.parent),
      isSelected: false,
      pathLabel: ""
    };
  }

  function buildFolderPath(folderMap, folderId, activeIds) {
    const folder = folderMap.get(folderId);
    if (!folder) {
      return "";
    }

    if (activeIds.has(folderId)) {
      return folder.name || folderId;
    }

    activeIds.add(folderId);

    const parts = [];
    if (folder.parent && folderMap.has(folder.parent)) {
      const parentPath = buildFolderPath(folderMap, folder.parent, activeIds);
      if (parentPath) {
        parts.push(parentPath);
      }
    }

    parts.push(folder.name || folder.id);
    activeIds.delete(folderId);
    return parts.join(" / ");
  }

  async function getAvailableFolders() {
    if (!window.eagle || !window.eagle.folder) {
      throw new Error("Eagle folder API is not available.");
    }

    const collator = new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: "base"
    });

    const [rawFolders, selectedFolders] = await Promise.all([
      window.eagle.folder.getAll(),
      window.eagle.folder.get({ isSelected: true }).catch(async () => window.eagle.folder.getSelected())
    ]);

    const selectedIds = new Set(
      (Array.isArray(selectedFolders) ? selectedFolders : [])
        .map((folder) => String(folder.id || ""))
        .filter(Boolean)
    );

    const folders = (Array.isArray(rawFolders) ? rawFolders : [])
      .map(mapFolder)
      .filter((folder) => folder.id);
    const folderMap = new Map(folders.map((folder) => [folder.id, folder]));

    folders.forEach((folder) => {
      folder.pathLabel = buildFolderPath(folderMap, folder.id, new Set()) || folder.name || folder.id;
      folder.isSelected = selectedIds.has(folder.id);
    });

    folders.sort((left, right) => {
      if (left.isSelected !== right.isSelected) {
        return left.isSelected ? -1 : 1;
      }

      return collator.compare(left.pathLabel, right.pathLabel);
    });

    return folders;
  }

  async function getSelectedItems() {
    if (!window.eagle || !window.eagle.item) {
      throw new Error("Eagle item API is not available.");
    }

    const fields = ["id", "name", "ext", "filePath", "thumbnailURL", "fileURL", "width", "height", "size"];
    let rawItems = [];

    try {
      rawItems = await window.eagle.item.get({
        isSelected: true,
        fields
      });
    } catch (error) {
      log("warn", `item.get fallback: ${error.message}`);
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      rawItems = await window.eagle.item.getSelected();
    }

    return rawItems
      .map(mapItem)
      .filter((item) => item.filePath);
  }

  async function chooseOutputDirectory(defaultPath) {
    const result = await window.eagle.dialog.showOpenDialog({
      title: t("dialogs.chooseOutputTitle", "Choose Output Folder"),
      defaultPath: defaultPath || undefined,
      buttonLabel: t("dialogs.chooseOutputButton", "Use This Folder"),
      properties: ["openDirectory"]
    });

    if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
      return "";
    }

    return result.filePaths[0];
  }

  async function confirmFfmpegInstallation() {
    if (!window.eagle || !window.eagle.extraModule || !window.eagle.extraModule.ffmpeg) {
      throw new Error("Eagle FFmpeg module is not available.");
    }

    const installed = await window.eagle.extraModule.ffmpeg.isInstalled();
    if (installed) {
      return true;
    }

    const result = await window.eagle.dialog.showMessageBox({
      title: t("dialogs.ffmpegMissingTitle", "FFmpeg dependency is required"),
      message: t("dialogs.ffmpegMissingMessage", "The FFmpeg Dependency Plugin is required for image conversion."),
      detail: t(
        "dialogs.ffmpegMissingDetail",
        "Open the install screen, install it, and then try the conversion again."
      ),
      buttons: [
        t("dialogs.ffmpegInstallButton", "Open Install Screen"),
        t("dialogs.cancelButton", "Cancel")
      ],
      type: "warning"
    });

    if (result.response === 0) {
      await window.eagle.extraModule.ffmpeg.install();
    }

    return false;
  }

  async function getFfmpegPaths() {
    return window.eagle.extraModule.ffmpeg.getPaths();
  }

  async function importFileToFolder(filePath, folderId, options) {
    if (!window.eagle || !window.eagle.item) {
      throw new Error("Eagle item API is not available.");
    }

    const path = getPathModule();
    const fileName = options && options.fileName
      ? String(options.fileName)
      : (path ? path.basename(filePath) : String(filePath || ""));
    const importOptions = {
      folders: [folderId]
    };

    if (path) {
      importOptions.name = path.parse(fileName).name;
    }

    return window.eagle.item.addFromPath(filePath, importOptions);
  }

  async function ensureOutputDirectoryExists(outputDirectory) {
    const nodeRequire = getNodeRequire();
    if (!nodeRequire) {
      throw new Error("Node.js fs API is not available.");
    }

    const fs = nodeRequire("fs").promises;
    await fs.access(outputDirectory);
    return true;
  }

  async function showError(title, content) {
    if (window.eagle && window.eagle.dialog) {
      await window.eagle.dialog.showErrorBox(title, content);
    }
  }

  ns.eagleService = {
    chooseOutputDirectory,
    confirmFfmpegInstallation,
    ensureOutputDirectoryExists,
    getFfmpegPaths,
    getAvailableFolders,
    getSelectedItems,
    importFileToFolder,
    log,
    showError
  };
})(window.EagleThumb = window.EagleThumb || {});
