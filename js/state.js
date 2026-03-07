(function bootstrapState(ns) {
  const DEFAULT_SETTINGS = Object.freeze({
    language: "auto",
    outputFormat: "jpg",
    resizeRatio: 50,
    quality: 82,
    pngCompressionLevel: 6,
    outputTargetType: "filesystem",
    outputDirectory: "",
    eagleFolderId: "",
    renameMode: "none",
    renameText: ""
  });

  const INITIAL_STATE = Object.freeze({
    plugin: null,
    items: [],
    eagleFolders: [],
    settings: { ...DEFAULT_SETTINGS },
    ui: {
      initialized: false,
      bannerTone: "info",
      bannerKey: "banner.selectImages",
      bannerDefaultValue: "Eagle で画像を選択してから、このプラグインを開いてください。",
      bannerOptions: {},
      bannerMessage: "Eagle で画像を選択してから、このプラグインを開いてください。",
      loadingItems: false,
      loadingFolders: false,
      running: false,
      cancelRequested: false,
      validationErrors: [],
      progress: {
        total: 0,
        completed: 0,
        success: 0,
        error: 0,
        canceled: 0
      },
      summaryKey: "list.summaryNotStarted",
      summaryDefaultValue: "未実行",
      summaryOptions: {},
      summaryLabel: "未実行"
    }
  });

  function cloneInitialState() {
    return {
      plugin: INITIAL_STATE.plugin,
      items: [],
      eagleFolders: [],
      settings: { ...DEFAULT_SETTINGS },
      ui: {
        ...INITIAL_STATE.ui,
        bannerOptions: { ...INITIAL_STATE.ui.bannerOptions },
        validationErrors: [],
        progress: { ...INITIAL_STATE.ui.progress },
        summaryOptions: { ...INITIAL_STATE.ui.summaryOptions }
      }
    };
  }

  function createStore() {
    let state = cloneInitialState();
    const listeners = new Set();

    return {
      getState() {
        return state;
      },
      setState(updater) {
        const nextState = typeof updater === "function" ? updater(state) : updater;
        state = nextState;
        listeners.forEach((listener) => listener(state));
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }

  ns.state = {
    DEFAULT_SETTINGS,
    cloneInitialState,
    createStore
  };
})(window.EagleThumb = window.EagleThumb || {});
