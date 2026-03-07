(function registerValidationService(ns) {
  function t(key, defaultValue) {
    return ns.i18n.t(key, { defaultValue });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toInteger(value, fallback) {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeSettings(input) {
    const base = {
      ...ns.state.DEFAULT_SETTINGS,
      ...(input || {})
    };

    const language = ns.i18n.isSupportedLanguage(base.language) ? base.language : "auto";
    const outputFormat = ["jpg", "png", "webp"].includes(base.outputFormat) ? base.outputFormat : "jpg";
    const outputTargetType = ["filesystem", "eagle-folder"].includes(base.outputTargetType)
      ? base.outputTargetType
      : "filesystem";
    const renameMode = ["none", "prefix", "suffix"].includes(base.renameMode) ? base.renameMode : "none";

    return {
      language,
      outputFormat,
      resizeRatio: clamp(toInteger(base.resizeRatio, 50), 10, 100),
      quality: clamp(toInteger(base.quality, 82), 1, 100),
      pngCompressionLevel: clamp(toInteger(base.pngCompressionLevel, 6), 0, 9),
      outputTargetType,
      outputDirectory: String(base.outputDirectory || "").trim(),
      eagleFolderId: String(base.eagleFolderId || "").trim(),
      renameMode,
      renameText: String(base.renameText || "").slice(0, 80)
    };
  }

  function getCompressionUiMeta(format) {
    if (format === "png") {
      return {
        label: t("settings.compressionLevel", "Compression Level"),
        hint: t("settings.compressionLevelHint", "Compression level for PNG. Higher values mean stronger compression."),
        min: 0,
        max: 9,
        step: 1,
        suffix: ""
      };
    }

    return {
      label: t("settings.quality", "Quality"),
      hint: t("settings.qualityHint", "Output quality for JPG / WEBP."),
      min: 1,
      max: 100,
      step: 1,
      suffix: "%"
    };
  }

  function validateSettings(settings, items) {
    const normalized = normalizeSettings(settings);
    const errors = [];

    if (!Array.isArray(items) || items.length === 0) {
      errors.push(t("validation.selectItems", "Please select at least one image in Eagle."));
    }

    if (normalized.outputTargetType === "filesystem" && !normalized.outputDirectory) {
      errors.push(t("validation.chooseOutputDirectory", "Please choose an output folder."));
    }

    if (normalized.outputTargetType === "eagle-folder" && !normalized.eagleFolderId) {
      errors.push(t("validation.chooseEagleFolder", "Please choose an Eagle folder."));
    }

    if (normalized.resizeRatio < 10 || normalized.resizeRatio > 100) {
      errors.push(t("validation.resizeRatioRange", "The resize ratio must be between 10% and 100%."));
    }

    if (normalized.outputFormat === "png") {
      if (normalized.pngCompressionLevel < 0 || normalized.pngCompressionLevel > 9) {
        errors.push(t("validation.pngCompressionRange", "PNG compression level must be between 0 and 9."));
      }
    } else if (normalized.quality < 1 || normalized.quality > 100) {
      errors.push(t("validation.qualityRange", "Quality must be between 1 and 100."));
    }

    if (normalized.renameText.length > 80) {
      errors.push(t("validation.renameTextLength", "Rename text must be 80 characters or fewer."));
    }

    return {
      normalized,
      errors,
      valid: errors.length === 0
    };
  }

  ns.validationService = {
    getCompressionUiMeta,
    normalizeSettings,
    validateSettings
  };
})(window.EagleThumb = window.EagleThumb || {});
