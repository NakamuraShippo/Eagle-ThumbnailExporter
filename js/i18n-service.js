(function registerI18nService(ns) {
  const AUTO_LANGUAGE = "auto";
  const DEFAULT_LANGUAGE = "en";
  let currentLocale = null;
  let pluginPath = "";
  const localeCache = new Map();
  const LANGUAGE_OPTIONS = Object.freeze([
    { value: AUTO_LANGUAGE, label: "Auto (Eagle)" },
    { value: "en", label: "English" },
    { value: "ja_JP", label: "日本語" },
    { value: "zh_CN", label: "简体中文" },
    { value: "zh_TW", label: "繁體中文" },
    { value: "ko_KR", label: "한국어" },
    { value: "de_DE", label: "Deutsch" },
    { value: "ru_RU", label: "Русский" },
    { value: "es_ES", label: "Español" },
    { value: "pt_BR", label: "Português (Brasil)" },
    { value: "fr_FR", label: "Français" }
  ]);
  const SUPPORTED_LANGUAGES = new Set(
    LANGUAGE_OPTIONS
      .map((option) => option.value)
      .filter((value) => value !== AUTO_LANGUAGE)
  );
  const LANGUAGE_ALIASES = Object.freeze({
    de: "de_DE",
    en: "en",
    es: "es_ES",
    fr: "fr_FR",
    ja: "ja_JP",
    ko: "ko_KR",
    pt: "pt_BR",
    ru: "ru_RU",
    zh: "zh_CN",
    zh_cn: "zh_CN",
    zh_hans: "zh_CN",
    zh_tw: "zh_TW",
    zh_hant: "zh_TW"
  });

  function getI18next() {
    return window.i18next || null;
  }

  function getNodeRequire() {
    return window.require || (typeof require === "function" ? require : null);
  }

  function getLocaleFsTools() {
    const nodeRequire = getNodeRequire();
    if (!nodeRequire) {
      return null;
    }

    try {
      return {
        fs: nodeRequire("fs"),
        path: nodeRequire("path"),
        fileURLToPath: nodeRequire("url").fileURLToPath
      };
    } catch (error) {
      return null;
    }
  }

  function normalizeLanguage(value) {
    if (value == null) {
      return "";
    }

    const rawValue = String(value).trim();
    if (!rawValue) {
      return "";
    }

    if (rawValue === AUTO_LANGUAGE) {
      return AUTO_LANGUAGE;
    }

    const exactValue = rawValue.replace(/-/g, "_");
    if (SUPPORTED_LANGUAGES.has(exactValue)) {
      return exactValue;
    }

    const normalizedValue = exactValue.toLowerCase();
    if (SUPPORTED_LANGUAGES.has(normalizedValue)) {
      return normalizedValue;
    }

    if (Object.prototype.hasOwnProperty.call(LANGUAGE_ALIASES, normalizedValue)) {
      return LANGUAGE_ALIASES[normalizedValue];
    }

    const baseLanguage = normalizedValue.split("_")[0];
    return Object.prototype.hasOwnProperty.call(LANGUAGE_ALIASES, baseLanguage)
      ? LANGUAGE_ALIASES[baseLanguage]
      : "";
  }

  function isSupportedLanguage(value) {
    return Boolean(normalizeLanguage(value));
  }

  function getRuntimeLocale() {
    if (window.eagle && window.eagle.app && window.eagle.app.locale) {
      const eagleLocale = normalizeLanguage(window.eagle.app.locale);
      if (eagleLocale && eagleLocale !== AUTO_LANGUAGE) {
        return eagleLocale;
      }
    }

    const browserLocale = normalizeLanguage(
      (navigator.languages && navigator.languages[0]) || navigator.language || ""
    );

    return browserLocale && browserLocale !== AUTO_LANGUAGE
      ? browserLocale
      : DEFAULT_LANGUAGE;
  }

  function resolveLanguage(preferred) {
    const normalized = normalizeLanguage(preferred);
    if (normalized && normalized !== AUTO_LANGUAGE) {
      return normalized;
    }

    return getRuntimeLocale();
  }

  function getLocaleFilePath(locale) {
    const tools = getLocaleFsTools();
    if (!tools) {
      return null;
    }

    if (pluginPath) {
      return tools.path.join(pluginPath, "_locales", `${locale}.json`);
    }

    try {
      return tools.fileURLToPath(new URL(`./_locales/${locale}.json`, window.location.href));
    } catch (error) {
      return null;
    }
  }

  function setPluginPath(nextPluginPath) {
    pluginPath = nextPluginPath ? String(nextPluginPath) : "";
    localeCache.clear();
  }

  function readLocaleFile(locale) {
    if (localeCache.has(locale)) {
      return localeCache.get(locale);
    }

    const tools = getLocaleFsTools();
    if (!tools) {
      localeCache.set(locale, null);
      return null;
    }

    try {
      const localeFilePath = getLocaleFilePath(locale);
      if (!localeFilePath) {
        localeCache.set(locale, null);
        return null;
      }

      const raw = tools.fs.readFileSync(localeFilePath, "utf8");
      const parsed = JSON.parse(raw);
      localeCache.set(locale, parsed);
      return parsed;
    } catch (error) {
      if (window.eagle && window.eagle.log && typeof window.eagle.log.warn === "function") {
        window.eagle.log.warn(`locale load failed for ${locale}: ${error.message}`);
      }
      localeCache.set(locale, null);
      return null;
    }
  }

  function getMessageValue(messages, key) {
    if (!messages || !key) {
      return undefined;
    }

    return key
      .split(".")
      .reduce((current, segment) => (
        current && typeof current === "object" ? current[segment] : undefined
      ), messages);
  }

  function interpolateMessage(template, options) {
    if (typeof template !== "string") {
      return template;
    }

    return template.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (match, token) => {
      if (!options || !Object.prototype.hasOwnProperty.call(options, token)) {
        return "";
      }

      const replacement = options[token];
      return replacement == null ? "" : String(replacement);
    });
  }

  function translateWithI18next(key, options) {
    const i18next = getI18next();
    if (!i18next || typeof i18next.t !== "function") {
      return undefined;
    }

    try {
      const value = i18next.t(key, options);
      return value == null || value === key ? undefined : value;
    } catch (error) {
      return undefined;
    }
  }

  function t(key, options) {
    const opts = options || {};
    const defaultValue = Object.prototype.hasOwnProperty.call(opts, "defaultValue")
      ? opts.defaultValue
      : key;
    const locale = getLocale();
    const localizedMessages = readLocaleFile(locale);
    const fallbackMessages = locale === DEFAULT_LANGUAGE ? localizedMessages : readLocaleFile(DEFAULT_LANGUAGE);
    const localizedValue = getMessageValue(localizedMessages, key);
    const fallbackValue = getMessageValue(fallbackMessages, key);
    const resolvedValue = typeof localizedValue === "string"
      ? localizedValue
      : typeof fallbackValue === "string"
        ? fallbackValue
        : translateWithI18next(key, opts);

    return interpolateMessage(
      typeof resolvedValue === "string" ? resolvedValue : defaultValue,
      opts
    );
  }

  function getLocale() {
    return currentLocale || resolveLanguage(AUTO_LANGUAGE);
  }

  async function changeLanguage(preferred) {
    currentLocale = resolveLanguage(preferred);
    document.documentElement.lang = currentLocale.replace(/_/g, "-");
    return currentLocale;
  }

  function getElementDefaultText(element) {
    if (!element.dataset.i18nDefault) {
      element.dataset.i18nDefault = element.textContent || "";
    }

    return element.dataset.i18nDefault;
  }

  function getElementDefaultPlaceholder(element) {
    if (!element.dataset.i18nPlaceholderDefault) {
      element.dataset.i18nPlaceholderDefault = element.getAttribute("placeholder") || "";
    }

    return element.dataset.i18nPlaceholderDefault;
  }

  function applyDomTranslations(root) {
    const scope = root || document;

    scope.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.getAttribute("data-i18n");
      element.textContent = t(key, { defaultValue: getElementDefaultText(element) });
    });

    scope.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      const key = element.getAttribute("data-i18n-placeholder");
      element.setAttribute(
        "placeholder",
        t(key, { defaultValue: getElementDefaultPlaceholder(element) })
      );
    });

    if (!document.documentElement.dataset.i18nTitleDefault) {
      document.documentElement.dataset.i18nTitleDefault = document.title;
    }

    document.title = t("app.title", {
      defaultValue: document.documentElement.dataset.i18nTitleDefault || document.title
    });
    document.documentElement.lang = getLocale().replace(/_/g, "-");
  }

  ns.i18n = {
    AUTO_LANGUAGE,
    applyDomTranslations,
    changeLanguage,
    getLocale,
    getLanguageOptions() {
      return [...LANGUAGE_OPTIONS];
    },
    isSupportedLanguage,
    resolveLanguage,
    setPluginPath,
    t
  };
})(window.EagleThumb = window.EagleThumb || {});
