(function registerSettingsService(ns) {
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

  async function getUserDataPath() {
    if (!window.eagle || !window.eagle.app) {
      throw new Error("Eagle app API is not available.");
    }

    if (window.eagle.app.userDataPath) {
      return window.eagle.app.userDataPath;
    }

    return window.eagle.app.getPath("userData");
  }

  function sanitizePluginId(plugin) {
    const rawId = plugin && plugin.manifest && plugin.manifest.id ? plugin.manifest.id : "eagle-thumb";
    return String(rawId).replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  async function getSettingsFilePath(plugin) {
    const { path } = getFsAndPath();
    const userDataPath = await getUserDataPath();
    const pluginFolder = sanitizePluginId(plugin);

    return path.join(userDataPath, pluginFolder, "thumbnail-exporter.settings.json");
  }

  async function loadSettings(plugin) {
    const defaults = ns.validationService.normalizeSettings(ns.state.DEFAULT_SETTINGS);

    try {
      const { fs } = getFsAndPath();
      const settingsFilePath = await getSettingsFilePath(plugin);
      const raw = await fs.readFile(settingsFilePath, "utf8");
      const parsed = JSON.parse(raw);
      return ns.validationService.normalizeSettings({ ...defaults, ...parsed });
    } catch (error) {
      return defaults;
    }
  }

  async function saveSettings(plugin, settings) {
    try {
      const { fs, path } = getFsAndPath();
      const settingsFilePath = await getSettingsFilePath(plugin);
      await fs.mkdir(path.dirname(settingsFilePath), { recursive: true });
      const normalized = ns.validationService.normalizeSettings(settings);
      await fs.writeFile(settingsFilePath, JSON.stringify(normalized, null, 2), "utf8");
      return true;
    } catch (error) {
      if (window.eagle && window.eagle.log) {
        window.eagle.log.warn(`settings save skipped: ${error.message}`);
      }

      return false;
    }
  }

  ns.settingsService = {
    loadSettings,
    saveSettings
  };
})(window.EagleThumb = window.EagleThumb || {});
