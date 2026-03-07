(function bootstrapMain(ns) {
  const store = ns.state.createStore();
  const SUPPORT_URL = "https://patreon.com/NakamuraShippo?utm_medium=unknown&utm_source=join_link&utm_campaign=creatorshare_creator&utm_content=copyLink";

  function t(key, defaultValue, options) {
    return ns.i18n.t(key, {
      defaultValue,
      ...(options || {})
    });
  }

  const refs = {
    selectedCount: document.getElementById("selected-count"),
    successCount: document.getElementById("success-count"),
    errorCount: document.getElementById("error-count"),
    banner: document.getElementById("banner"),
    supportButton: document.getElementById("support-button"),
    reloadButton: document.getElementById("reload-button"),
    languageSelect: document.getElementById("language-select"),
    outputFormat: document.getElementById("output-format"),
    outputTargetType: document.getElementById("output-target-type"),
    resizeRatioRange: document.getElementById("resize-ratio-range"),
    resizeRatioNumber: document.getElementById("resize-ratio-number"),
    compressionLabel: document.getElementById("compression-label"),
    compressionRange: document.getElementById("compression-range"),
    compressionNumber: document.getElementById("compression-number"),
    compressionSuffix: document.getElementById("compression-suffix"),
    compressionHint: document.getElementById("compression-hint"),
    outputDirectory: document.getElementById("output-directory"),
    browseButton: document.getElementById("browse-button"),
    eagleFolderPanel: document.getElementById("eagle-folder-panel"),
    eagleFolderSelect: document.getElementById("eagle-folder-select"),
    reloadFoldersButton: document.getElementById("reload-folders-button"),
    filesystemTargetPanel: document.getElementById("filesystem-target-panel"),
    renameMode: document.getElementById("rename-mode"),
    renameText: document.getElementById("rename-text"),
    validationList: document.getElementById("validation-list"),
    startButton: document.getElementById("start-button"),
    cancelButton: document.getElementById("cancel-button"),
    progressLabel: document.getElementById("progress-label"),
    progressDetail: document.getElementById("progress-detail"),
    progressFill: document.getElementById("progress-fill"),
    listSubtitle: document.getElementById("list-subtitle"),
    summaryPill: document.getElementById("summary-pill"),
    tableShell: document.querySelector(".table-shell"),
    itemList: document.getElementById("item-list")
  };

  let saveSettingsTimer = null;
  let currentRunner = null;
  let hasBoundEvents = false;
  let pendingRefreshAfterCreate = false;

  function isPluginReady() {
    const state = store.getState();
    return Boolean(state.plugin && state.ui.initialized);
  }

  function cloneTextOptions(options) {
    return options ? { ...options } : {};
  }

  function buildLocalizedText(key, defaultValue, options) {
    const normalizedOptions = cloneTextOptions(options);
    return {
      key,
      defaultValue,
      options: normalizedOptions,
      value: t(key, defaultValue, normalizedOptions)
    };
  }

  function getBannerPatch(key, defaultValue, tone, options) {
    const localized = buildLocalizedText(key, defaultValue, options);
    return {
      bannerTone: tone,
      bannerKey: localized.key,
      bannerDefaultValue: localized.defaultValue,
      bannerOptions: localized.options,
      bannerMessage: localized.value
    };
  }

  function getSummaryPatch(key, defaultValue, options) {
    const localized = buildLocalizedText(key, defaultValue, options);
    return {
      summaryKey: localized.key,
      summaryDefaultValue: localized.defaultValue,
      summaryOptions: localized.options,
      summaryLabel: localized.value
    };
  }

  function hydrateLocalizedUiDefaults() {
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        ...getBannerPatch(
          "banner.selectImages",
          "Please select images in Eagle and then open this plugin.",
          "info"
        ),
        ...getSummaryPatch("list.summaryNotStarted", "Not Started")
      }
    }));
  }

  function formatBytes(bytes) {
    if (!bytes) {
      return "-";
    }

    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getStatusLabel(status) {
    switch (status) {
      case "running":
        return t("status.running", "Running");
      case "success":
        return t("status.success", "Done");
      case "error":
        return t("status.error", "Error");
      case "canceled":
        return t("status.canceled", "Canceled");
      case "pending":
      default:
        return t("status.pending", "Pending");
    }
  }

  function getStatusMessage(status) {
    switch (status) {
      case "running":
        return t("status.running", "Running");
      case "canceled":
        return t("status.canceled", "Canceled");
      case "pending":
      default:
        return t("status.pending", "Pending");
    }
  }

  function renderLanguageOptions(selectedLanguage) {
    const locale = ns.i18n.getLocale();
    const selectedValue = ns.i18n.isSupportedLanguage(selectedLanguage)
      ? selectedLanguage
      : ns.i18n.AUTO_LANGUAGE;

    if (
      refs.languageSelect.dataset.locale !== locale ||
      refs.languageSelect.options.length !== ns.i18n.getLanguageOptions().length
    ) {
      refs.languageSelect.innerHTML = ns.i18n
        .getLanguageOptions()
        .map((option) => {
          const label = option.value === ns.i18n.AUTO_LANGUAGE
            ? t("settings.languageAuto", "Auto (Eagle)")
            : option.label;
          return `<option value="${escapeHtml(option.value)}">${escapeHtml(label)}</option>`;
        })
        .join("");
      refs.languageSelect.dataset.locale = locale;
    }

    refs.languageSelect.value = selectedValue;
  }

  function renderEagleFolderOptions(folders, selectedFolderId) {
    const safeFolders = Array.isArray(folders) ? folders : [];
    const placeholder = safeFolders.length
      ? t("settings.eagleFolderPlaceholder", "Choose an Eagle folder")
      : t("settings.eagleFolderEmpty", "No Eagle folders available");
    const hasSelectedFolder = safeFolders.some((folder) => folder.id === selectedFolderId);

    refs.eagleFolderSelect.innerHTML = [
      `<option value="">${escapeHtml(placeholder)}</option>`,
      ...safeFolders.map((folder) => (
        `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.pathLabel || folder.name || folder.id)}</option>`
      ))
    ].join("");

    refs.eagleFolderSelect.value = hasSelectedFolder ? selectedFolderId : "";
  }

  function syncDestinationPanels(state) {
    const isFilesystemTarget = state.settings.outputTargetType === "filesystem";
    refs.filesystemTargetPanel.hidden = !isFilesystemTarget;
    refs.eagleFolderPanel.hidden = isFilesystemTarget;
  }

  function getPreferredEagleFolderId(folders, preferredId) {
    const safeFolders = Array.isArray(folders) ? folders : [];
    if (preferredId && safeFolders.some((folder) => folder.id === preferredId)) {
      return preferredId;
    }

    const selectedFolder = safeFolders.find((folder) => folder.isSelected);
    return selectedFolder ? selectedFolder.id : "";
  }

  function relocalizeUiState() {
    store.setState((state) => ({
      ...state,
      items: state.items.map((item) => {
        if (!["pending", "running", "canceled"].includes(item.status)) {
          return item;
        }

        return {
          ...item,
          statusMessage: getStatusMessage(item.status)
        };
      }),
      ui: {
        ...state.ui,
        ...(state.ui.bannerKey
          ? getBannerPatch(
            state.ui.bannerKey,
            state.ui.bannerDefaultValue || state.ui.bannerMessage || "",
            state.ui.bannerTone,
            state.ui.bannerOptions
          )
          : {}),
        ...(state.ui.summaryKey
          ? getSummaryPatch(
            state.ui.summaryKey,
            state.ui.summaryDefaultValue || state.ui.summaryLabel || "",
            state.ui.summaryOptions
          )
          : {})
      }
    }));
  }

  async function applyLanguagePreference(preferred) {
    await ns.i18n.changeLanguage(preferred);
    ns.i18n.applyDomTranslations(document);
    relocalizeUiState();
  }

  function requestLanguagePreference(preferred) {
    return applyLanguagePreference(preferred).catch((error) => {
      if (window.eagle && window.eagle.log && typeof window.eagle.log.warn === "function") {
        window.eagle.log.warn(`applyLanguagePreference failed: ${error.message}`);
      }
    });
  }

  function setBanner(key, defaultValue, tone, options) {
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        ...getBannerPatch(key, defaultValue, tone, options)
      }
    }));
  }

  function setSummary(key, defaultValue, options) {
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        ...getSummaryPatch(key, defaultValue, options)
      }
    }));
  }

  function patchSettings(patch) {
    store.setState((state) => {
      const normalized = ns.validationService.normalizeSettings({
        ...state.settings,
        ...patch
      });

      const items = state.items.map((item) => ({
        ...item,
        outputFileName: ns.namingService.buildOutputFileName(item, normalized)
      }));

      return {
        ...state,
        settings: normalized,
        items
      };
    });

    queueSettingsSave();
  }

  function queueSettingsSave() {
    if (saveSettingsTimer) {
      clearTimeout(saveSettingsTimer);
    }

    saveSettingsTimer = setTimeout(async () => {
      const state = store.getState();
      if (!state.plugin) {
        return;
      }

      await ns.settingsService.saveSettings(state.plugin, state.settings);
    }, 250);
  }

  function updateCompressionInputs(settings) {
    const meta = ns.validationService.getCompressionUiMeta(settings.outputFormat);
    const value = settings.outputFormat === "png" ? settings.pngCompressionLevel : settings.quality;

    refs.compressionLabel.textContent = meta.label;
    refs.compressionHint.textContent = meta.hint;
    refs.compressionSuffix.textContent = meta.suffix;
    refs.compressionRange.min = String(meta.min);
    refs.compressionRange.max = String(meta.max);
    refs.compressionRange.step = String(meta.step);
    refs.compressionNumber.min = String(meta.min);
    refs.compressionNumber.max = String(meta.max);
    refs.compressionNumber.step = String(meta.step);
    refs.compressionRange.value = String(value);
    refs.compressionNumber.value = String(value);
  }

  function syncFormFromState(state) {
    renderLanguageOptions(state.settings.language);
    renderEagleFolderOptions(state.eagleFolders, state.settings.eagleFolderId);
    syncDestinationPanels(state);
    refs.outputFormat.value = state.settings.outputFormat;
    refs.outputTargetType.value = state.settings.outputTargetType;
    refs.resizeRatioRange.value = String(state.settings.resizeRatio);
    refs.resizeRatioNumber.value = String(state.settings.resizeRatio);
    refs.outputDirectory.value = state.settings.outputDirectory || "";
    refs.renameMode.value = state.settings.renameMode;
    refs.renameText.value = state.settings.renameText;
    updateCompressionInputs(state.settings);
  }

  function renderValidationErrors(errors) {
    refs.validationList.innerHTML = errors
      .map((message) => `<div class="validation-item">${escapeHtml(message)}</div>`)
      .join("");
  }

  function renderItems(items) {
    if (!items.length) {
      refs.itemList.innerHTML = "";
      refs.tableShell.classList.add("is-empty");
      return;
    }

    refs.tableShell.classList.remove("is-empty");
    refs.itemList.innerHTML = items
      .map((item) => {
        const thumbMarkup = item.thumbnailURL
          ? `<img src="${escapeHtml(item.thumbnailURL)}" alt="${escapeHtml(item.name)}" />`
          : `<span class="thumb-fallback">${escapeHtml(item.ext || "img")}</span>`;

        return `
          <tr>
            <td class="thumb-cell">
              <div class="thumb-frame">${thumbMarkup}</div>
            </td>
            <td>
              <div class="name-stack">
                <span class="file-name">${escapeHtml(item.name)}</span>
                <span class="file-meta">${escapeHtml((item.ext || "-").toUpperCase())}</span>
              </div>
            </td>
            <td>
              <div class="size-stack">${escapeHtml(`${item.width || "-"} x ${item.height || "-"}`)}</div>
              <div class="file-meta">${escapeHtml(formatBytes(item.size))}</div>
            </td>
            <td>
              <div class="output-name">${escapeHtml(item.outputFileName || "-")}</div>
            </td>
            <td>
              <div class="status-pill status-${escapeHtml(item.status)}">${escapeHtml(getStatusLabel(item.status))}</div>
              <div class="status-text">${escapeHtml(item.statusMessage || "")}</div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function render(state) {
    syncFormFromState(state);
    renderValidationErrors(state.ui.validationErrors);
    renderItems(state.items);

    refs.selectedCount.textContent = String(state.items.length);
    refs.successCount.textContent = String(state.ui.progress.success);
    refs.errorCount.textContent = String(state.ui.progress.error);
    refs.banner.textContent = state.ui.bannerMessage;
    refs.banner.dataset.tone = state.ui.bannerTone;
    refs.summaryPill.textContent = state.ui.summaryLabel;
    refs.listSubtitle.textContent = state.items.length
      ? t("list.subtitleCount", "{{count}} images are ready for batch processing.", { count: state.items.length })
      : t("list.subtitleEmpty", "Selected images will appear here.");
    refs.progressLabel.textContent = state.ui.running
      ? state.ui.cancelRequested
        ? t("status.canceling", "Canceling")
        : t("status.running", "Running")
      : state.ui.summaryLabel;
    refs.progressDetail.textContent = `${state.ui.progress.completed} / ${state.ui.progress.total}`;

    const progressWidth = state.ui.progress.total
      ? (state.ui.progress.completed / state.ui.progress.total) * 100
      : 0;
    refs.progressFill.style.width = `${progressWidth}%`;

    const disabled = state.ui.running;
    refs.reloadButton.disabled = disabled;
    refs.languageSelect.disabled = disabled;
    refs.outputFormat.disabled = disabled;
    refs.outputTargetType.disabled = disabled;
    refs.resizeRatioRange.disabled = disabled;
    refs.resizeRatioNumber.disabled = disabled;
    refs.compressionRange.disabled = disabled;
    refs.compressionNumber.disabled = disabled;
    refs.browseButton.disabled = disabled;
    refs.eagleFolderSelect.disabled = disabled || state.ui.loadingFolders || state.eagleFolders.length === 0;
    refs.reloadFoldersButton.disabled = disabled || state.ui.loadingFolders;
    refs.renameMode.disabled = disabled;
    refs.renameText.disabled = disabled;
    refs.startButton.disabled = disabled;
    refs.cancelButton.disabled = !state.ui.running;
  }

  function replaceItems(items) {
    const state = store.getState();
    const nextItems = items.map((item) => ({
      ...item,
      outputFileName: ns.namingService.buildOutputFileName(item, state.settings)
    }));

    store.setState((current) => ({
      ...current,
      items: nextItems
    }));
  }

  function updateItem(itemId, patch) {
    store.setState((state) => ({
      ...state,
      items: state.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    }));
  }

  function setProgress(progressPatch) {
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        progress: {
          ...state.ui.progress,
          ...progressPatch
        }
      }
    }));
  }

  async function loadEagleFolders(options) {
    const silent = Boolean(options && options.silent);

    if (!isPluginReady()) {
      return;
    }

    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        loadingFolders: true
      }
    }));

    try {
      const folders = await ns.eagleService.getAvailableFolders();
      let shouldSaveSettings = false;

      store.setState((state) => {
        const preferredFolderId = getPreferredEagleFolderId(folders, state.settings.eagleFolderId);
        shouldSaveSettings = preferredFolderId !== state.settings.eagleFolderId;

        return {
          ...state,
          eagleFolders: folders,
          settings: {
            ...state.settings,
            eagleFolderId: preferredFolderId
          }
        };
      });

      if (shouldSaveSettings) {
        queueSettingsSave();
      }

      if (!silent) {
        if (folders.length > 0) {
          setBanner("messages.eagleFoldersLoaded", "Loaded {{count}} Eagle folders.", "info", {
            count: folders.length
          });
        } else {
          setBanner("messages.noEagleFolders", "No Eagle folders are available in this library.", "warning");
        }
      }
    } catch (error) {
      setBanner(
        "messages.loadFoldersFailed",
        "Failed to load Eagle folders: {{message}}",
        "error",
        { message: error.message }
      );
      ns.eagleService.log("error", `loadEagleFolders failed: ${error.message}`);
    } finally {
      store.setState((state) => ({
        ...state,
        ui: {
          ...state.ui,
          loadingFolders: false
        }
      }));
    }
  }

  async function loadSelectedItems(options) {
    const silent = Boolean(options && options.silent);

    if (!isPluginReady()) {
      pendingRefreshAfterCreate = true;
      if (!silent) {
        setBanner("messages.pluginInitWait", "Waiting for plugin initialization.", "info");
      }
      return;
    }

    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        loadingItems: true
      }
    }));

    try {
      const items = await ns.eagleService.getSelectedItems();
      replaceItems(items);

      setBanner(
        items.length ? "messages.selectionLoaded" : "banner.selectImages",
        items.length
          ? "Loaded {{count}} images."
          : "Please select images in Eagle and then open this plugin.",
        items.length ? "info" : "warning",
        items.length ? { count: items.length } : undefined
      );

      if (!silent) {
        setSummary(
          items.length ? "list.summaryReady" : "list.summaryNoItems",
          items.length ? "Ready" : "No Items"
        );
      }
    } catch (error) {
      setBanner(
        "messages.loadItemsFailed",
        "Failed to load selected images: {{message}}",
        "error",
        { message: error.message }
      );
      ns.eagleService.log("error", `loadSelectedItems failed: ${error.message}`);
    } finally {
      store.setState((state) => ({
        ...state,
        ui: {
          ...state.ui,
          loadingItems: false
        }
      }));
    }
  }

  async function initializePlugin(plugin) {
    if (ns.i18n && typeof ns.i18n.setPluginPath === "function") {
      ns.i18n.setPluginPath(plugin && plugin.path);
    }

    store.setState((state) => ({
      ...state,
      plugin,
      ui: {
        ...state.ui,
        initialized: true,
        ...getSummaryPatch("list.summaryInitializing", "Initializing")
      }
    }));

    const loadedSettings = await ns.settingsService.loadSettings(plugin);
    store.setState((state) => ({
      ...state,
      settings: loadedSettings
    }));
    await applyLanguagePreference(loadedSettings.language);
    await loadEagleFolders({ silent: true });

    await loadSelectedItems();

    if (pendingRefreshAfterCreate) {
      pendingRefreshAfterCreate = false;
      await loadSelectedItems({ silent: true });
    }
  }

  async function handleBrowse() {
    if (!isPluginReady()) {
      setBanner(
        "messages.pluginInitInProgress",
        "The plugin is still initializing. Please try again in a moment.",
        "warning"
      );
      return;
    }

    const state = store.getState();

    try {
      const outputDirectory = await ns.eagleService.chooseOutputDirectory(state.settings.outputDirectory);
      if (!outputDirectory) {
        return;
      }

      patchSettings({
        outputDirectory
      });
      setBanner("messages.outputDirectoryUpdated", "Output folder updated.", "info");
    } catch (error) {
      setBanner(
        "messages.browseFailed",
        "Failed to choose an output folder: {{message}}",
        "error",
        { message: error.message }
      );
    }
  }

  async function handleStart() {
    if (!isPluginReady()) {
      setBanner(
        "messages.pluginInitInProgress",
        "The plugin is still initializing. Please try again in a moment.",
        "warning"
      );
      return;
    }

    const state = store.getState();
    const validation = ns.validationService.validateSettings(state.settings, state.items);
    const selectedEagleFolder = validation.normalized.outputTargetType === "eagle-folder"
      ? state.eagleFolders.find((folder) => folder.id === validation.normalized.eagleFolderId) || null
      : null;

    try {
      if (validation.valid
        && validation.normalized.outputTargetType === "filesystem"
        && validation.normalized.outputDirectory) {
        await ns.eagleService.ensureOutputDirectoryExists(validation.normalized.outputDirectory);
      }
    } catch (error) {
      validation.errors.push(
        t(
          "validation.outputDirectoryAccess",
          "The output folder cannot be accessed. Please choose an existing folder."
        )
      );
    }

    if (validation.normalized.outputTargetType === "eagle-folder" && !selectedEagleFolder) {
      validation.errors.push(
        t(
          "validation.eagleFolderUnavailable",
          "The selected Eagle folder is no longer available. Please choose another folder."
        )
      );
    }

    validation.valid = validation.errors.length === 0;

    store.setState((current) => ({
      ...current,
      settings: validation.normalized,
      ui: {
        ...current.ui,
        validationErrors: validation.errors
      }
    }));

    if (!validation.valid) {
      setBanner("messages.checkInputs", "Please review the input values.", "warning");
      return;
    }

    try {
      const ffmpegReady = await ns.eagleService.confirmFfmpegInstallation();
      if (!ffmpegReady) {
        setBanner(
          "messages.ffmpegInstallRequired",
          "Install the FFmpeg Dependency Plugin and try again.",
          "warning"
        );
        return;
      }

      const ffmpegPaths = await ns.eagleService.getFfmpegPaths();
      const resetItems = store.getState().items.map((item) => ({
        ...item,
        status: "pending",
        statusMessage: getStatusMessage("pending"),
        outputFileName: ns.namingService.buildOutputFileName(item, validation.normalized)
      }));

      store.setState((current) => ({
        ...current,
        items: resetItems,
        settings: validation.normalized,
        ui: {
          ...current.ui,
          running: true,
          cancelRequested: false,
          validationErrors: [],
          ...getSummaryPatch("list.summaryRunning", "Running"),
          progress: {
            total: resetItems.length,
            completed: 0,
            success: 0,
            error: 0,
            canceled: 0
          }
        }
      }));

      setBanner("messages.batchStarted", "Batch conversion started.", "info");

      currentRunner = await ns.imageJobRunner.runBatch({
        items: resetItems,
        settings: validation.normalized,
        ffmpegPaths,
        eagleFolder: selectedEagleFolder,
        onItemUpdate(itemId, patch) {
          updateItem(itemId, patch);
        },
        onProgress(progress) {
          setProgress(progress);
        }
      });

      const summary = await currentRunner.done();
      currentRunner = null;

      const summaryKey = summary.error > 0
        ? "list.summaryPartial"
        : summary.canceled === summary.total
          ? "list.summaryCanceled"
          : "list.summaryCompleted";
      const summaryDefaultValue = summary.error > 0
        ? "Completed with Errors"
        : summary.canceled === summary.total
          ? "Canceled"
          : "Completed";

      store.setState((current) => ({
        ...current,
        ui: {
          ...current.ui,
          running: false,
          cancelRequested: false,
          ...getSummaryPatch(summaryKey, summaryDefaultValue)
        }
      }));

      if (summary.error > 0) {
        setBanner(
          "messages.batchCompletedWithIssues",
          "Completed: {{success}} succeeded / {{error}} failed / {{canceled}} canceled",
          "warning",
          {
            success: summary.success,
            error: summary.error,
            canceled: summary.canceled
          }
        );
        return;
      }

      if (summary.canceled > 0) {
        setBanner(
          "messages.batchCanceled",
          "Stopped: {{success}} succeeded / {{canceled}} canceled",
          "warning",
          {
            success: summary.success,
            canceled: summary.canceled
          }
        );
        return;
      }

      setBanner("messages.batchCompleted", "Completed {{count}} image conversions.", "info", {
        count: summary.success
      });
    } catch (error) {
      currentRunner = null;
      store.setState((current) => ({
        ...current,
        ui: {
          ...current.ui,
          running: false,
          cancelRequested: false,
          ...getSummaryPatch("list.summaryFailed", "Failed")
        }
      }));
      setBanner(
        "messages.batchStartFailed",
        "Failed to start batch conversion: {{message}}",
        "error",
        { message: error.message }
      );
      ns.eagleService.log("error", `handleStart failed: ${error.message}`);
    }
  }

  function handleCancel() {
    if (!currentRunner) {
      return;
    }

    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        cancelRequested: true,
        ...getSummaryPatch("status.canceling", "Canceling")
      }
    }));

    setBanner("messages.canceling", "Canceling conversion.", "warning");
    currentRunner.cancel();
  }

  async function handleSupportClick() {
    try {
      if (window.eagle && window.eagle.shell && typeof window.eagle.shell.openExternal === "function") {
        await window.eagle.shell.openExternal(SUPPORT_URL);
        return;
      }

      window.open(SUPPORT_URL, "_blank", "noopener,noreferrer");
    } catch (error) {
      ns.eagleService.log("warn", `support link open failed: ${error.message}`);
      window.open(SUPPORT_URL, "_blank", "noopener,noreferrer");
    }
  }

  function bindEvents() {
    if (hasBoundEvents) {
      return;
    }

    hasBoundEvents = true;

    if (refs.supportButton) {
      refs.supportButton.addEventListener("click", () => {
        void handleSupportClick();
      });
    }

    refs.reloadButton.addEventListener("click", () => {
      void loadSelectedItems();
    });

    refs.languageSelect.addEventListener("change", (event) => {
      patchSettings({
        language: event.target.value
      });
      void requestLanguagePreference(event.target.value);
    });

    refs.outputFormat.addEventListener("change", (event) => {
      patchSettings({
        outputFormat: event.target.value
      });
    });

    refs.outputTargetType.addEventListener("change", (event) => {
      patchSettings({
        outputTargetType: event.target.value
      });

      if (event.target.value === "eagle-folder") {
        void loadEagleFolders({ silent: true });
      }
    });

    refs.resizeRatioRange.addEventListener("input", (event) => {
      patchSettings({
        resizeRatio: event.target.value
      });
    });

    refs.resizeRatioNumber.addEventListener("input", (event) => {
      patchSettings({
        resizeRatio: event.target.value
      });
    });

    refs.compressionRange.addEventListener("input", (event) => {
      const state = store.getState();
      if (state.settings.outputFormat === "png") {
        patchSettings({
          pngCompressionLevel: event.target.value
        });
        return;
      }

      patchSettings({
        quality: event.target.value
      });
    });

    refs.compressionNumber.addEventListener("input", (event) => {
      const state = store.getState();
      if (state.settings.outputFormat === "png") {
        patchSettings({
          pngCompressionLevel: event.target.value
        });
        return;
      }

      patchSettings({
        quality: event.target.value
      });
    });

    refs.browseButton.addEventListener("click", () => {
      void handleBrowse();
    });

    refs.eagleFolderSelect.addEventListener("change", (event) => {
      patchSettings({
        eagleFolderId: event.target.value
      });
    });

    refs.reloadFoldersButton.addEventListener("click", () => {
      void loadEagleFolders();
    });

    refs.renameMode.addEventListener("change", (event) => {
      patchSettings({
        renameMode: event.target.value
      });
    });

    refs.renameText.addEventListener("input", (event) => {
      patchSettings({
        renameText: event.target.value
      });
    });

    refs.startButton.addEventListener("click", () => {
      void handleStart();
    });

    refs.cancelButton.addEventListener("click", handleCancel);
  }

  function setupLifecycle() {
    bindEvents();
    ns.i18n.applyDomTranslations(document);
    hydrateLocalizedUiDefaults();
    store.subscribe(render);
    render(store.getState());

    if (!window.eagle || typeof window.eagle.onPluginCreate !== "function") {
      setBanner(
        "messages.runtimeUnavailable",
        "Some features are unavailable outside the Eagle runtime.",
        "warning"
      );
      return;
    }

    window.eagle.onPluginCreate((plugin) => {
      void initializePlugin(plugin);
    });

    window.eagle.onPluginRun(() => {
      if (!isPluginReady()) {
        pendingRefreshAfterCreate = true;
        return;
      }

      void loadSelectedItems({ silent: true });
    });
  }

  setupLifecycle();
})(window.EagleThumb = window.EagleThumb || {});
