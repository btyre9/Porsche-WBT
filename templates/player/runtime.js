(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function shuffle(arr) {
    var a = (arr || []).slice();
    for (var i = a.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function pct(correct, total) {
    if (!total) return 0;
    return Math.round((correct / total) * 10000) / 100;
  }

  /* ================================================================
     SCORM API
     ================================================================ */

  function _scanChain(win) {
    var w = win;
    while (w) {
      if (w.API_1484_11) return { api: w.API_1484_11, version: "2004" };
      if (w.API) return { api: w.API, version: "1.2" };
      if (w === w.parent) break;
      w = w.parent;
    }
    return null;
  }

  function findApi(win) {
    var found = _scanChain(win);
    if (found) return found;
    if (win.opener) found = _scanChain(win.opener);
    return found || null;
  }

  var scorm = {
    api: null,
    version: null,
    terminated: false,

    init: function () {
      var found = findApi(window);
      if (!found) return false;
      this.api = found.api;
      this.version = found.version;
      try {
        var ok = this.version === "2004"
          ? this.api.Initialize("") === "true"
          : this.api.LMSInitialize("") === "true";
        if (!ok) this._logError("Initialize");
        return ok;
      } catch (_e) { return false; }
    },

    setValue: function (key, value) {
      if (!this.api) return false;
      try {
        var ok = this.version === "2004"
          ? this.api.SetValue(key, String(value)) === "true"
          : this.api.LMSSetValue(key, String(value)) === "true";
        if (!ok) this._logError("SetValue(" + key + ")");
        return ok;
      } catch (_e) { return false; }
    },

    commit: function () {
      if (!this.api) return false;
      try {
        var ok = this.version === "2004"
          ? this.api.Commit("") === "true"
          : this.api.LMSCommit("") === "true";
        if (!ok) this._logError("Commit");
        return ok;
      } catch (_e) { return false; }
    },

    terminate: function () {
      if (!this.api || this.terminated) return false;
      this.terminated = true;
      try {
        var ok = this.version === "2004"
          ? this.api.Terminate("") === "true"
          : this.api.LMSFinish("") === "true";
        if (!ok) this._logError("Terminate");
        return ok;
      } catch (_e) { return false; }
    },

    reportFinal: function (scorePercent, threshold) {
      if (!this.api) return false;
      var passed = Number(scorePercent) >= Number(threshold);
      var scaled = Math.round(Number(scorePercent)) / 100;

      if (this.version === "2004") {
        this.setValue("cmi.score.min", 0);
        this.setValue("cmi.score.max", 100);
        this.setValue("cmi.score.raw", scorePercent);
        this.setValue("cmi.score.scaled", scaled);
        this.setValue("cmi.success_status", passed ? "passed" : "failed");
        this.setValue("cmi.completion_status", "completed");
      } else {
        this.setValue("cmi.core.score.min", 0);
        this.setValue("cmi.core.score.max", 100);
        this.setValue("cmi.core.score.raw", scorePercent);
        this.setValue("cmi.core.lesson_status", passed ? "passed" : "failed");
      }
      this.commit();
      this.terminate();
      return true;
    },

    _logError: function (context) {
      if (!this.api) return;
      try {
        var code = this.version === "2004"
          ? this.api.GetLastError()
          : this.api.LMSGetLastError();
        if (code && code !== "0") {
          var msg = this.version === "2004"
            ? this.api.GetErrorString(code)
            : this.api.LMSGetErrorString(code);
          console.warn("[SCORM " + this.version + "] " + context + " error " + code + ": " + msg);
        }
      } catch (_e) {}
    }
  };

  /* ================================================================
     Player state
     ================================================================ */

  var SLIDE_W = 1920;
  var SLIDE_H = 920;

  var state = {
    data: null,
    slideIndex: 0,
    totalSlides: 0,
    menuOpen: false,
    muted: false,
    ccEnabled: false,
    audio: null,
    audioStartTimer: null,
    pendingAudioStart: false,
    audioUnlockArmed: false,
    audioUnlockFrameDoc: null,
    audioStartPromptShown: {},
    interactionAudio: null,
    interactionAudioStopTimer: null,
    interactionAudioShouldResumeNarration: false,
    interactionAudioMap: {},
    interactionAudioMapLoadToken: 0,
    voStartDelayMs: 1000,
    captionCues: [],
    activeCaptionIndex: -1,
    captionLoadToken: 0,
    playbackRates: [1, 1.25, 1.5, 2],
    playbackRateIndex: 0,
    sfx: { correct: null, incorrect: null },
    // Knowledge check
    kcQuestions: [],
    kcIndex: 0,
    kcSubmitted: false,
    // Final quiz (tracked across full-slide quiz questions)
    finalCorrect: 0,
    finalAnswered: 0,
    finalTotal: 0,
    cueEditor: {
      open: false,
      cues: [],
      slideId: "",
      source: "new"
    }
  };

  /* ================================================================
     Slide scaling
     ================================================================ */

  function scaleSlide() {
    var area = $("slide-area");
    var scaler = $("slide-scaler");
    if (!area || !scaler) return;

    var availW = area.clientWidth;
    var availH = area.clientHeight;
    var scale = Math.min(availW / SLIDE_W, availH / SLIDE_H);

    scaler.style.transform = "scale(" + scale + ")";
  }

  /* ================================================================
     Slide navigation
     ================================================================ */

  function isModuleFirstSlide(slide) {
    if (!slide) return false;
    var id = String(slide.id || "");
    // Match slides ending in _SLD_001 (first slide of each module)
    return /_SLD_001$/.test(id);
  }

  function updateNavButtons() {
    $("btn-next").disabled = state.slideIndex >= state.totalSlides - 1;
  }

  function resolveSlideAudioSrc(slide) {
    if (!slide) return "";
    if (slide.audio_vo) return slide.audio_vo;

    var id = String(slide.id || "");
    var m = id.match(/^slide-([A-Z]{2}\d{2}_SLD_\d{3})$/);
    if (m) return "assets/audio/vo/" + m[1] + ".mp3";
    return "";
  }

  function uniqueStrings(items) {
    var out = [];
    var seen = {};
    for (var i = 0; i < items.length; i += 1) {
      var key = items[i];
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(key);
    }
    return out;
  }

  function resolveInteractionMapCandidates(slideId) {
    var id = String(slideId || "");
    var names = [];
    if (id) names.push(id + ".json");

    var sldMatch = id.match(/^slide-([A-Z]{2}\d{2}_SLD_(\d{3}))$/);
    if (sldMatch) {
      var code = sldMatch[1];
      var num3 = sldMatch[2];
      var num = Number(num3);
      names.push(code + ".json");
      if (Number.isFinite(num)) {
        var num2 = ("0" + String(num)).slice(-2);
        names.push("slide-" + num2 + ".json");
      }
      names.push("slide-" + num3 + ".json");
    }

    return uniqueStrings(names);
  }

  function toAssetAudioUrl(src) {
    var raw = String(src || "").trim();
    if (!raw) return "";
    if (/^(https?:)?\/\//i.test(raw)) return raw;
    if (/^\.\.?\//.test(raw)) return raw;
    return "../" + raw.replace(/^\/+/, "");
  }

  function getSlideFrameDocument() {
    var frame = $("slide-frame");
    if (!frame) return null;
    try {
      return frame.contentDocument || null;
    } catch (_e) {
      return null;
    }
  }

  function setAudioUnlockListenersOnTarget(target, shouldArm) {
    if (!target || typeof target.addEventListener !== "function" || typeof target.removeEventListener !== "function") return;

    if (shouldArm) {
      target.addEventListener("pointerdown", onAudioUnlockInteraction, true);
      target.addEventListener("keydown", onAudioUnlockInteraction, true);
      target.addEventListener("touchstart", onAudioUnlockInteraction, true);
      return;
    }

    target.removeEventListener("pointerdown", onAudioUnlockInteraction, true);
    target.removeEventListener("keydown", onAudioUnlockInteraction, true);
    target.removeEventListener("touchstart", onAudioUnlockInteraction, true);
  }

  function syncAudioUnlockFrameListeners() {
    var frameDoc = getSlideFrameDocument();

    if (state.audioUnlockFrameDoc && state.audioUnlockFrameDoc !== frameDoc) {
      setAudioUnlockListenersOnTarget(state.audioUnlockFrameDoc, false);
    }

    state.audioUnlockFrameDoc = frameDoc;
    if (state.audioUnlockArmed && frameDoc) setAudioUnlockListenersOnTarget(frameDoc, true);
  }

  function setAudioStartOverlayVisible(visible) {
    var overlay = $("audio-start-overlay");
    if (!overlay) return;
    if (visible) overlay.classList.remove("hidden");
    else overlay.classList.add("hidden");
  }

  function disarmAudioUnlockListeners() {
    if (!state.audioUnlockArmed) return;
    state.audioUnlockArmed = false;
    setAudioUnlockListenersOnTarget(document, false);
    if (state.audioUnlockFrameDoc) {
      setAudioUnlockListenersOnTarget(state.audioUnlockFrameDoc, false);
      state.audioUnlockFrameDoc = null;
    }
  }

  function attemptStartAudioPlayback() {
    if (!state.audio) return;

    var maybePromise = state.audio.play();
    if (!maybePromise || typeof maybePromise.then !== "function") {
      state.pendingAudioStart = false;
      disarmAudioUnlockListeners();
      updateAudioUi();
      return;
    }

    maybePromise
      .then(function () {
        state.pendingAudioStart = false;
        disarmAudioUnlockListeners();
        setAudioStartOverlayVisible(false);
        updateAudioUi();
      })
      .catch(function () {
        state.pendingAudioStart = true;
        armAudioUnlockListeners();
        var slides = state.data && state.data.slides || [];
        var curSlide = slides[state.slideIndex];
        if (curSlide && isModuleFirstSlide(curSlide) && !state.audioStartPromptShown[curSlide.id]) {
          setAudioStartOverlayVisible(true);
        }
        updateAudioUi();
      });
  }

  function onAudioUnlockInteraction() {
    if (!state.audio) {
      disarmAudioUnlockListeners();
      setAudioStartOverlayVisible(false);
      return;
    }

    if (!state.pendingAudioStart && !state.audioStartTimer && !state.audio.paused) {
      disarmAudioUnlockListeners();
      return;
    }

    if (state.audioStartTimer) {
      clearTimeout(state.audioStartTimer);
      state.audioStartTimer = null;
    }

    state.pendingAudioStart = false;
    attemptStartAudioPlayback();
  }

  function armAudioUnlockListeners() {
    if (state.audioUnlockArmed) return;
    state.audioUnlockArmed = true;
    setAudioUnlockListenersOnTarget(document, true);
    syncAudioUnlockFrameListeners();
  }

  function setAudioProgressRatio(ratio) {
    var fill = $("audio-progress-fill");
    if (!fill) return;
    var safe = Number(ratio);
    if (!Number.isFinite(safe)) safe = 0;
    if (safe < 0) safe = 0;
    if (safe > 1) safe = 1;
    fill.style.width = String(Math.round(safe * 10000) / 100) + "%";
  }

  function setAudioProgressEnabled(enabled) {
    var bar = $("audio-progress");
    if (!bar) return;
    if (enabled) bar.classList.remove("disabled");
    else bar.classList.add("disabled");
  }

  function syncAudioProgress() {
    if (!state.audio) {
      setAudioProgressRatio(0);
      return;
    }

    var dur = Number(state.audio.duration);
    var cur = Number(state.audio.currentTime);
    if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(cur) || cur < 0) {
      setAudioProgressRatio(0);
      return;
    }
    setAudioProgressRatio(cur / dur);
  }

  function setPlayPauseVisual(isPlaying) {
    $("icon-play").style.display = isPlaying ? "none" : "";
    $("icon-pause").style.display = isPlaying ? "" : "none";
    $("btn-playpause").title = isPlaying ? "Pause" : "Play";
  }

  function updateAudioUi() {
    var hasAudio = !!state.audio;
    $("btn-playpause").disabled = !hasAudio;
    setAudioProgressEnabled(hasAudio);

    if (!hasAudio) {
      setPlayPauseVisual(false);
      setAudioProgressRatio(0);
      return;
    }

    var isPlaying = !state.audio.paused && !state.pendingAudioStart && !state.audioStartTimer;
    setPlayPauseVisual(isPlaying);
    syncAudioProgress();
  }

  function onAudioPlay() {
    var slides = state.data && state.data.slides || [];
    var cur = slides[state.slideIndex];
    if (cur) state.audioStartPromptShown[cur.id] = true;
    setAudioStartOverlayVisible(false);
    updateAudioUi();
  }

  function onAudioPause() {
    updateAudioUi();
  }

  function onAudioTimeUpdate() {
    syncCaptionToAudioTime();
    syncAudioProgress();
    if (state.cueEditor.open) updateCueCurrentTimeLabel();
  }

  function onAudioSeeked() {
    syncCaptionToAudioTime();
    syncAudioProgress();
    if (state.cueEditor.open) updateCueCurrentTimeLabel();
  }

  function onAudioEnded() {
    syncCaptionToAudioTime();
    syncAudioProgress();
    updateAudioUi();
    if (state.cueEditor.open) updateCueCurrentTimeLabel();
  }

  function onAudioMeta() {
    syncAudioProgress();
  }

  function togglePlayPause() {
    if (!state.audio) return;

    if (state.audio.paused || state.pendingAudioStart || state.audioStartTimer) {
      if (state.audioStartTimer) {
        clearTimeout(state.audioStartTimer);
        state.audioStartTimer = null;
      }
      if (state.audio.ended) state.audio.currentTime = 0;
      state.pendingAudioStart = false;
      disarmAudioUnlockListeners();
      attemptStartAudioPlayback();
      return;
    }

    state.pendingAudioStart = false;
    disarmAudioUnlockListeners();
    state.audio.pause();
    updateAudioUi();
  }

  function showSlide(i, forceReplay) {
    var slides = state.data.slides || [];
    if (!slides.length) return;
    if (i < 0 || i >= slides.length) return;

    stopInteractionAudio(false);
    state.interactionAudioMap = {};

    state.slideIndex = i;
    var slideSrc = "../slides/" + slides[i].id + ".html";
    if (forceReplay) slideSrc += "?replay=" + Date.now();
    $("slide-frame").src = slideSrc;
    updateNavButtons();
    updateMenuActiveSlide();
    if (!isModuleFirstSlide(slides[i]) || state.audioStartPromptShown[slides[i].id]) setAudioStartOverlayVisible(false);

    if (state.audioStartTimer) {
      clearTimeout(state.audioStartTimer);
      state.audioStartTimer = null;
    }
    state.pendingAudioStart = false;
    disarmAudioUnlockListeners();

    // Stop any playing audio
    if (state.audio) {
      state.audio.removeEventListener("play", onAudioPlay);
      state.audio.removeEventListener("pause", onAudioPause);
      state.audio.removeEventListener("loadedmetadata", onAudioMeta);
      state.audio.removeEventListener("durationchange", onAudioMeta);
      state.audio.removeEventListener("timeupdate", onAudioTimeUpdate);
      state.audio.removeEventListener("seeked", onAudioSeeked);
      state.audio.removeEventListener("ended", onAudioEnded);
      state.audio.pause();
      state.audio = null;
    }

    // Load slide audio
    var audioSrc = resolveSlideAudioSrc(slides[i]);
    if (audioSrc) {
      state.audio = new Audio("../" + audioSrc);
      state.audio.muted = state.muted;
      state.audio.playbackRate = state.playbackRates[state.playbackRateIndex];
      state.audio.addEventListener("play", onAudioPlay);
      state.audio.addEventListener("pause", onAudioPause);
      state.audio.addEventListener("loadedmetadata", onAudioMeta);
      state.audio.addEventListener("durationchange", onAudioMeta);
      state.audio.addEventListener("timeupdate", onAudioTimeUpdate);
      state.audio.addEventListener("seeked", onAudioSeeked);
      state.audio.addEventListener("ended", onAudioEnded);
      if (isModuleFirstSlide(slides[i]) && !state.audioStartPromptShown[slides[i].id]) {
        setAudioStartOverlayVisible(true);
      }
      armAudioUnlockListeners();
      state.audioStartTimer = setTimeout(function () {
        if (!state.audio) return;
        attemptStartAudioPlayback();
        state.audioStartTimer = null;
      }, state.voStartDelayMs);
    } else {
      setAudioStartOverlayVisible(false);
    }
    updateAudioUi();

    // Load captions
    loadCaptions(slides[i].id);
    loadInteractionAudioMap(slides[i].id);
    if (state.cueEditor.open) loadCueEditorForSlide(slides[i].id);
  }

  /* ================================================================
     Menu / TOC
     ================================================================ */

  function openMenu() {
    state.menuOpen = true;
    $("menu-overlay").classList.add("open");
  }

  function closeMenu() {
    state.menuOpen = false;
    $("menu-overlay").classList.remove("open");
  }

  function toggleMenu() {
    if (state.menuOpen) closeMenu();
    else openMenu();
  }

  function renderToc() {
    var list = $("toc-list");
    if (!list) return;

    var slides = state.data && state.data.slides || [];
    list.innerHTML = "";

    slides.forEach(function (slide, index) {
      var item = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.className = "toc-item";
      button.setAttribute("data-slide-index", String(index));
      button.textContent = slide.slide_title || slide.title || ("Slide " + (index + 1));
      button.addEventListener("click", function () {
        showSlide(index);
        closeMenu();
      });
      item.appendChild(button);
      list.appendChild(item);
    });

    updateMenuActiveSlide();
  }

  function updateMenuActiveSlide() {
    var items = document.querySelectorAll(".toc-item");
    for (var i = 0; i < items.length; i += 1) {
      var el = items[i];
      var idx = Number(el.getAttribute("data-slide-index"));
      if (idx === state.slideIndex) el.classList.add("active");
      else el.classList.remove("active");
    }
  }

  /* ================================================================
     Audio / Volume
     ================================================================ */

  function toggleMute() {
    state.muted = !state.muted;
    if (state.audio) state.audio.muted = state.muted;

    $("icon-vol-on").style.display = state.muted ? "none" : "";
    $("icon-vol-off").style.display = state.muted ? "" : "none";
  }

  function playSfx(kind) {
    var a = state.sfx[kind];
    if (!a || state.muted) return;
    try { a.currentTime = 0; a.play(); } catch (_e) {}
  }

  function formatPlaybackRate(rate) {
    var text = String(rate);
    if (text.indexOf(".") >= 0) text = text.replace(/0+$/, "").replace(/\.$/, "");
    return text + "x";
  }

  function updatePlaybackSpeedLabel() {
    var label = $("speed-label");
    if (!label) return;
    var rate = state.playbackRates[state.playbackRateIndex];
    var text = formatPlaybackRate(rate);
    label.textContent = text;
    $("btn-speed").title = "Playback speed: " + text;
  }

  function applyPlaybackRate() {
    if (!state.audio) return;
    state.audio.playbackRate = state.playbackRates[state.playbackRateIndex];
  }

  function cyclePlaybackSpeed() {
    state.playbackRateIndex = (state.playbackRateIndex + 1) % state.playbackRates.length;
    applyPlaybackRate();
    updatePlaybackSpeedLabel();
  }

  function replayCurrentSlide() {
    showSlide(state.slideIndex, true);
  }

  function resolveVoStartDelayMs(meta) {
    var raw = meta && meta.vo_start_delay_ms;
    var n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 1000;
    return Math.round(n);
  }

  function clearInteractionAudioStopTimer() {
    if (!state.interactionAudioStopTimer) return;
    clearTimeout(state.interactionAudioStopTimer);
    state.interactionAudioStopTimer = null;
  }

  function maybeResumeNarrationAfterInteraction() {
    if (!state.interactionAudioShouldResumeNarration) return;
    state.interactionAudioShouldResumeNarration = false;
    if (!state.audio) return;
    state.audio.play().catch(function () {});
  }

  function stopInteractionAudio(resumeNarration) {
    var shouldResume = resumeNarration !== false;
    clearInteractionAudioStopTimer();

    var current = state.interactionAudio;
    if (current) {
      current.pause();
      state.interactionAudio = null;
    }

    if (shouldResume) maybeResumeNarrationAfterInteraction();
    else state.interactionAudioShouldResumeNarration = false;
  }

  function normalizeInteractionClip(id, raw) {
    if (!raw || typeof raw !== "object") return null;
    var clip = { id: String(id || raw.id || "").trim() };
    if (!clip.id) return null;

    var src = String(raw.src || raw.audio || "").trim();
    if (src) clip.src = src;

    var start = Number(raw.start);
    var end = Number(raw.end);
    if (Number.isFinite(start) && start >= 0) clip.start = start;
    if (Number.isFinite(end) && end >= 0) clip.end = end;

    if (raw.pauseNarration != null) clip.pauseNarration = !!raw.pauseNarration;
    if (raw.resumeNarration != null) clip.resumeNarration = !!raw.resumeNarration;

    var volume = Number(raw.volume);
    if (Number.isFinite(volume)) clip.volume = volume;
    var playbackRate = Number(raw.playbackRate);
    if (Number.isFinite(playbackRate)) clip.playbackRate = playbackRate;

    return clip;
  }

  function normalizeInteractionAudioMap(json) {
    var out = {};
    if (!json || typeof json !== "object") return out;

    var clips = json.clips;
    if (Array.isArray(clips)) {
      for (var i = 0; i < clips.length; i += 1) {
        var fromArray = normalizeInteractionClip(clips[i] && clips[i].id, clips[i]);
        if (!fromArray) continue;
        out[fromArray.id] = fromArray;
      }
      return out;
    }

    if (clips && typeof clips === "object") {
      var keys = Object.keys(clips);
      for (var k = 0; k < keys.length; k += 1) {
        var key = keys[k];
        var fromObj = normalizeInteractionClip(key, clips[key]);
        if (!fromObj) continue;
        out[fromObj.id] = fromObj;
      }
    }
    return out;
  }

  function loadInteractionAudioMap(slideId) {
    state.interactionAudioMap = {};
    state.interactionAudioMapLoadToken += 1;
    var token = state.interactionAudioMapLoadToken;
    var candidates = resolveInteractionMapCandidates(slideId);
    if (!candidates.length) return;

    function tryFetch(at) {
      if (at >= candidates.length) return;
      fetch("../assets/interaction-audio/" + candidates[at], { cache: "no-store" })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (json) {
          if (token !== state.interactionAudioMapLoadToken) return;
          if (!json) {
            tryFetch(at + 1);
            return;
          }
          state.interactionAudioMap = normalizeInteractionAudioMap(json);
        })
        .catch(function () {
          if (token !== state.interactionAudioMapLoadToken) return;
          tryFetch(at + 1);
        });
    }

    tryFetch(0);
  }

  function playInteractionAudio(options) {
    var opts = options && typeof options === "object" ? options : {};
    var src = String(opts.src || "").trim();
    if (!src) {
      var curSlide = getCurrentSlide();
      src = resolveSlideAudioSrc(curSlide);
    }
    var url = toAssetAudioUrl(src);
    if (!url) return false;

    var start = Number(opts.start);
    if (!Number.isFinite(start) || start < 0) start = 0;
    var end = Number(opts.end);
    if (!Number.isFinite(end) || end <= start) end = null;

    var pauseNarration = opts.pauseNarration !== false;
    var resumeNarration = opts.resumeNarration !== false;
    var narrationWasPlaying = !!(
      state.audio &&
      !state.audio.paused &&
      !state.pendingAudioStart &&
      !state.audioStartTimer
    );

    stopInteractionAudio(false);

    state.interactionAudioShouldResumeNarration = false;
    if (pauseNarration && narrationWasPlaying && state.audio) {
      state.audio.pause();
      state.interactionAudioShouldResumeNarration = resumeNarration;
    }

    var channel = new Audio(url);
    var done = false;

    function finish(allowResume) {
      if (done) return;
      done = true;
      clearInteractionAudioStopTimer();
      channel.removeEventListener("timeupdate", onTimeUpdate);
      channel.removeEventListener("ended", onEnded);
      channel.removeEventListener("error", onError);
      channel.removeEventListener("loadedmetadata", onLoadedMeta);
      channel.pause();
      if (state.interactionAudio === channel) state.interactionAudio = null;
      if (allowResume !== false) maybeResumeNarrationAfterInteraction();
      else state.interactionAudioShouldResumeNarration = false;
    }

    function onEnded() { finish(true); }
    function onError() { finish(false); }
    function onTimeUpdate() {
      if (end == null) return;
      if (channel.currentTime >= end) finish(true);
    }
    function onLoadedMeta() {
      if (start > 0) {
        try { channel.currentTime = start; } catch (_e) {}
      }
      channel.play().catch(function () { finish(false); });
    }

    channel.volume = Number.isFinite(Number(opts.volume)) ? Math.max(0, Math.min(1, Number(opts.volume))) : 1;
    channel.playbackRate = Number.isFinite(Number(opts.playbackRate)) ? Math.max(0.25, Number(opts.playbackRate)) : 1;
    channel.preload = "auto";
    channel.addEventListener("loadedmetadata", onLoadedMeta);
    channel.addEventListener("timeupdate", onTimeUpdate);
    channel.addEventListener("ended", onEnded);
    channel.addEventListener("error", onError);

    state.interactionAudio = channel;
    channel.load();
    return true;
  }

  function playInteractionClip(clipId, overrides) {
    var id = String(clipId || "").trim();
    if (!id) return false;

    var clip = state.interactionAudioMap && state.interactionAudioMap[id];
    if (!clip) return false;

    var merged = {};
    Object.keys(clip).forEach(function (k) { merged[k] = clip[k]; });
    if (overrides && typeof overrides === "object") {
      Object.keys(overrides).forEach(function (k) { merged[k] = overrides[k]; });
    }
    return playInteractionAudio(merged);
  }

  /* ================================================================
     Closed Captions
     ================================================================ */

  function toggleCC() {
    state.ccEnabled = !state.ccEnabled;
    var btn = $("btn-cc");
    var overlay = $("cc-overlay");

    if (state.ccEnabled) {
      btn.classList.add("active");
      overlay.classList.remove("hidden");
      syncCaptionToAudioTime();
    } else {
      btn.classList.remove("active");
      overlay.classList.add("hidden");
    }
  }

  function parseVttTimestamp(value) {
    var raw = String(value || "").trim().replace(",", ".");
    var parts = raw.split(":");
    if (parts.length < 2 || parts.length > 3) return null;

    var h = 0;
    var m = 0;
    var s = 0;

    if (parts.length === 3) {
      h = Number(parts[0]);
      m = Number(parts[1]);
      s = Number(parts[2]);
    } else {
      m = Number(parts[0]);
      s = Number(parts[1]);
    }

    if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
    return h * 3600 + m * 60 + s;
  }

  function parseVttCues(text) {
    var lines = String(text || "").replace(/\r/g, "").split("\n");
    var cues = [];

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i].trim();
      if (!line || line === "WEBVTT") continue;

      if (line.indexOf("-->") === -1) {
        var next = lines[i + 1] ? lines[i + 1].trim() : "";
        if (next.indexOf("-->") === -1) continue;
        i += 1;
        line = next;
      }

      var times = line.split("-->");
      if (times.length !== 2) continue;

      var startToken = times[0].trim().split(/\s+/)[0];
      var endToken = times[1].trim().split(/\s+/)[0];
      var start = parseVttTimestamp(startToken);
      var end = parseVttTimestamp(endToken);
      if (start == null || end == null || end < start) continue;

      var textLines = [];
      i += 1;
      while (i < lines.length && lines[i].trim()) {
        textLines.push(lines[i].trim());
        i += 1;
      }

      var cueText = textLines.join(" ").trim();
      if (!cueText) continue;

      cues.push({ start: start, end: end, text: cueText });
    }

    return cues;
  }

  function cueIndexForTime(timeSec) {
    var cues = state.captionCues || [];
    if (!cues.length) return -1;

    var safeTime = Number(timeSec);
    if (!Number.isFinite(safeTime) || safeTime < 0) safeTime = 0;

    var active = state.activeCaptionIndex;
    if (active >= 0 && active < cues.length) {
      var activeCue = cues[active];
      if (safeTime >= activeCue.start && safeTime <= activeCue.end) return active;
    }

    for (var i = 0; i < cues.length; i += 1) {
      var cue = cues[i];
      if (safeTime >= cue.start && safeTime <= cue.end) return i;
    }

    return -1;
  }

  function uniqueCaptionCandidates(items) {
    var seen = {};
    var out = [];
    for (var i = 0; i < items.length; i += 1) {
      var key = items[i];
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(key);
    }
    return out;
  }

  function resolveCaptionCandidates(slideId) {
    var id = String(slideId || "");
    var names = [];

    if (id) names.push(id + ".vtt");

    var sldMatch = id.match(/^slide-([A-Z]{2}\d{2}_SLD_(\d{3}))$/);
    if (sldMatch) {
      var code = sldMatch[1];
      var num3 = sldMatch[2];
      var num = Number(num3);

      names.push(code + ".vtt");
      if (Number.isFinite(num)) {
        var num2 = ("0" + String(num)).slice(-2);
        names.push("slide-" + num2 + ".vtt");
      }
      names.push("slide-" + num3 + ".vtt");
    }

    return uniqueCaptionCandidates(names);
  }

  function syncCaptionToAudioTime() {
    var overlay = $("cc-overlay");
    if (!overlay) return;

    var timeSec = state.audio ? state.audio.currentTime : 0;
    var nextIndex = cueIndexForTime(timeSec);
    state.activeCaptionIndex = nextIndex;

    if (!state.ccEnabled) return;
    overlay.textContent = nextIndex >= 0 ? state.captionCues[nextIndex].text : "";
  }

  function loadCaptions(slideId) {
    var overlay = $("cc-overlay");
    overlay.textContent = "";
    state.captionCues = [];
    state.activeCaptionIndex = -1;
    state.captionLoadToken += 1;
    var token = state.captionLoadToken;
    var candidates = resolveCaptionCandidates(slideId);

    function tryFetch(at) {
      if (at >= candidates.length) {
        syncCaptionToAudioTime();
        return;
      }

      fetch("../assets/captions/" + candidates[at], { cache: "no-store" })
        .then(function (res) { return res.ok ? res.text() : ""; })
        .then(function (text) {
          if (token !== state.captionLoadToken) return;

          var cues = parseVttCues(text);
          if (cues.length) {
            state.captionCues = cues;
            syncCaptionToAudioTime();
            return;
          }

          tryFetch(at + 1);
        })
        .catch(function () {
          if (token !== state.captionLoadToken) return;
          tryFetch(at + 1);
        });
    }

    tryFetch(0);
  }

  /* ================================================================
     Knowledge Check Modal
     ================================================================ */

  function openKC() {
    var checks = state.data.quiz && state.data.quiz.knowledge_checks || [];
    if (!checks.length) return;

    state.kcQuestions = checks.map(function (q) { return Object.assign({}, q); });
    state.kcIndex = 0;
    state.kcSubmitted = false;

    state.kcQuestions.forEach(function (q) {
      if (q.shuffle_answers !== false) q._shuffled = shuffle(q.choices || []);
    });

    renderKCQuestion();
    $("kc-backdrop").classList.remove("hidden");
  }

  function renderKCQuestion() {
    var q = state.kcQuestions[state.kcIndex];
    if (!q) return;

    $("kc-progress").textContent = "Knowledge Check — Question " + (state.kcIndex + 1) + " of " + state.kcQuestions.length;
    $("kc-question").textContent = q.question || "";
    $("kc-feedback").textContent = "";
    $("kc-feedback").className = "kc-feedback";
    $("kc-submit").disabled = true;
    $("kc-continue").classList.add("hidden");
    state.kcSubmitted = false;

    var choices = q._shuffled || q.choices || [];
    var container = $("kc-choices");
    container.innerHTML = "";

    choices.forEach(function (c, idx) {
      var label = document.createElement("label");
      var input = document.createElement("input");
      input.type = "radio";
      input.name = "kc-choice";
      input.value = c;
      input.addEventListener("change", function () {
        if (!state.kcSubmitted) $("kc-submit").disabled = false;
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + c));
      container.appendChild(label);
    });
  }

  function submitKC() {
    if (state.kcSubmitted) return;
    var checked = document.querySelector('input[name="kc-choice"]:checked');
    if (!checked) return;

    state.kcSubmitted = true;
    $("kc-submit").disabled = true;

    var q = state.kcQuestions[state.kcIndex];
    var correct = String(checked.value).trim() === String(q.correct_answer || "").trim();

    var fb = $("kc-feedback");
    if (correct) {
      fb.textContent = "Correct!";
      fb.className = "kc-feedback correct";
      playSfx("correct");
    } else {
      fb.textContent = "Incorrect. The correct answer is: " + q.correct_answer;
      fb.className = "kc-feedback incorrect";
      playSfx("incorrect");
    }

    $("kc-continue").classList.remove("hidden");
  }

  function continueKC() {
    if (state.kcIndex < state.kcQuestions.length - 1) {
      state.kcIndex += 1;
      renderKCQuestion();
    } else {
      closeKC();
    }
  }

  function closeKC() {
    $("kc-backdrop").classList.add("hidden");
  }

  /* ================================================================
     Cue Editor
     ================================================================ */

  function cueEditorEls() {
    return {
      backdrop: $("cue-backdrop"),
      slideId: $("cue-slide-id"),
      source: $("cue-source"),
      currentTime: $("cue-current-time"),
      inputTime: $("cue-time"),
      inputTarget: $("cue-target"),
      inputAction: $("cue-action"),
      inputPreset: $("cue-preset"),
      inputDuration: $("cue-duration"),
      inputClassname: $("cue-classname"),
      cueList: $("cue-list"),
      output: $("cue-json-output"),
      status: $("cue-status")
    };
  }

  function isCueEditorEnabled() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      return params.get("cues") === "1" || params.get("dev") === "1";
    } catch (_e) {
      return false;
    }
  }

  function setCueEditorEnabled(enabled) {
    var btn = $("btn-cues");
    var backdrop = $("cue-backdrop");
    var shouldShow = !!enabled;

    if (btn) {
      if (shouldShow) btn.classList.remove("dev-cues");
      else btn.classList.add("dev-cues");
    }

    if (backdrop) {
      if (shouldShow) backdrop.classList.remove("dev-cues");
      else {
        backdrop.classList.add("dev-cues");
        backdrop.classList.add("hidden");
      }
    }
  }

  function getCurrentSlide() {
    var slides = state.data && state.data.slides || [];
    return slides[state.slideIndex] || null;
  }

  function toFixed2(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return "0.00";
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function cueCurrentAudioTime() {
    return state.audio ? Number(state.audio.currentTime) || 0 : 0;
  }

  function setCueStatus(message, mode) {
    var els = cueEditorEls();
    if (!els.status) return;
    els.status.textContent = message || "";
    els.status.className = "cue-status";
    if (mode === "error") els.status.classList.add("error");
    if (mode === "ok") els.status.classList.add("ok");
  }

  function updateCueCurrentTimeLabel() {
    var els = cueEditorEls();
    if (!els.currentTime) return;
    els.currentTime.textContent = toFixed2(cueCurrentAudioTime());
  }

  function normalizeCueAction(action) {
    var key = String(action || "").trim().toLowerCase();
    if (key === "addclass") key = "classadd";
    if (key === "removeclass") key = "classremove";
    if (key === "classadd") return "classAdd";
    if (key === "classremove") return "classRemove";
    if (key === "in" || key === "out" || key === "set") return key;
    return "";
  }

  function normalizeCue(raw) {
    if (!raw || typeof raw !== "object") return null;
    var at = Number(raw.at);
    if (!Number.isFinite(at) || at < 0) return null;

    var action = normalizeCueAction(raw.action || raw.type || "in");
    if (!action) return null;

    var cue = {
      at: Math.round(at * 1000) / 1000,
      action: action,
      target: String(raw.target || raw.key || "").trim()
    };

    var preset = String(raw.preset || "").trim();
    var duration = Number(raw.duration);
    var className = String(raw.className || raw.class || "").trim();

    if (preset) cue.preset = preset;
    if (Number.isFinite(duration) && duration >= 0) cue.duration = Math.round(duration * 1000) / 1000;
    if (className) cue.className = className;
    if (raw.selector) cue.selector = String(raw.selector).trim();

    return cue;
  }

  function cueToOutput(cue) {
    var out = {
      at: cue.at,
      target: cue.target,
      action: cue.action
    };
    if (cue.selector) out.selector = cue.selector;
    if (cue.preset) out.preset = cue.preset;
    if (Number.isFinite(cue.duration)) out.duration = cue.duration;
    if (cue.className) out.className = cue.className;
    return out;
  }

  function sortCueList() {
    state.cueEditor.cues.sort(function (a, b) {
      if (a.at !== b.at) return a.at - b.at;
      return String(a.target || "").localeCompare(String(b.target || ""));
    });
  }

  function cueJsonText() {
    var payload = {
      version: 1,
      followVoiceover: true,
      cues: state.cueEditor.cues.map(cueToOutput)
    };
    return JSON.stringify(payload, null, 2);
  }

  function renderCueEditor() {
    var els = cueEditorEls();
    if (!els.cueList || !els.output) return;

    if (els.slideId) els.slideId.textContent = state.cueEditor.slideId || "-";
    if (els.source) els.source.textContent = state.cueEditor.source || "new";
    if (els.currentTime) els.currentTime.textContent = toFixed2(cueCurrentAudioTime());

    els.cueList.innerHTML = "";
    state.cueEditor.cues.forEach(function (cue, index) {
      var tr = document.createElement("tr");
      var cells = [
        String(index + 1),
        toFixed2(cue.at),
        cue.action,
        cue.target || cue.selector || "",
        cue.preset || "-",
        Number.isFinite(cue.duration) ? toFixed2(cue.duration) : "-"
      ];
      cells.forEach(function (text, cellIndex) {
        var td = document.createElement("td");
        td.textContent = text;
        if (cellIndex === 2) td.className = "cue-cell-action";
        tr.appendChild(td);
      });

      var removeTd = document.createElement("td");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cue-inline-btn";
      btn.textContent = "Delete";
      btn.addEventListener("click", function () {
        state.cueEditor.cues.splice(index, 1);
        renderCueEditor();
        setCueStatus("Cue removed.", "ok");
      });
      removeTd.appendChild(btn);
      tr.appendChild(removeTd);
      els.cueList.appendChild(tr);
    });

    els.output.value = cueJsonText();
  }

  function resolveCueCandidates(slideId) {
    var id = String(slideId || "");
    var names = [];
    if (id) names.push(id + ".json");

    var sldMatch = id.match(/^slide-([A-Z]{2}\d{2}_SLD_(\d{3}))$/);
    if (sldMatch) {
      var code = sldMatch[1];
      var num3 = sldMatch[2];
      var num = Number(num3);
      names.push(code + ".json");
      if (Number.isFinite(num)) {
        var num2 = ("0" + String(num)).slice(-2);
        names.push("slide-" + num2 + ".json");
      }
      names.push("slide-" + num3 + ".json");
    }

    var out = [];
    var seen = {};
    for (var i = 0; i < names.length; i += 1) {
      if (!names[i] || seen[names[i]]) continue;
      seen[names[i]] = true;
      out.push(names[i]);
    }
    return out;
  }

  function setCueEditorSlide(slideId) {
    state.cueEditor.slideId = String(slideId || "");
    state.cueEditor.source = "new";
    state.cueEditor.cues = [];
    renderCueEditor();
  }

  function loadCueEditorForSlide(slideId) {
    setCueEditorSlide(slideId);
    var candidates = resolveCueCandidates(slideId);
    if (!candidates.length) return Promise.resolve();

    function tryFetch(at) {
      if (at >= candidates.length) {
        setCueStatus("No existing cue file found. Creating a new one.", "");
        return Promise.resolve();
      }

      var candidate = candidates[at];
      return fetch("../assets/animation-cues/" + candidate, { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) return null;
          return res.json().catch(function () { return null; });
        })
        .then(function (json) {
          if (!json || !Array.isArray(json.cues)) return tryFetch(at + 1);
          state.cueEditor.cues = json.cues.map(normalizeCue).filter(Boolean);
          sortCueList();
          state.cueEditor.source = candidate;
          renderCueEditor();
          setCueStatus("Loaded " + String(state.cueEditor.cues.length) + " cue(s).", "ok");
          return Promise.resolve();
        })
        .catch(function () {
          return tryFetch(at + 1);
        });
    }

    return tryFetch(0);
  }

  function cueCaptureNow() {
    var els = cueEditorEls();
    if (!els.inputTime) return;
    els.inputTime.value = toFixed2(cueCurrentAudioTime());
  }

  function cueAddFromForm() {
    var els = cueEditorEls();
    if (!els.inputTime || !els.inputAction || !els.inputTarget) return;

    var at = Number(els.inputTime.value);
    if (!Number.isFinite(at) || at < 0) {
      setCueStatus("Enter a valid time in seconds.", "error");
      return;
    }

    var action = normalizeCueAction(els.inputAction.value);
    if (!action) {
      setCueStatus("Action is required.", "error");
      return;
    }

    var target = String(els.inputTarget.value || "").trim();
    if (!target) {
      setCueStatus("Target is required.", "error");
      return;
    }

    var cue = {
      at: Math.round(at * 1000) / 1000,
      action: action,
      target: target
    };

    var preset = String(els.inputPreset && els.inputPreset.value || "").trim();
    if (preset && (action === "in" || action === "out")) cue.preset = preset;

    var duration = Number(els.inputDuration && els.inputDuration.value);
    if (Number.isFinite(duration) && duration >= 0) cue.duration = Math.round(duration * 1000) / 1000;

    var className = String(els.inputClassname && els.inputClassname.value || "").trim();
    if (action === "classAdd" || action === "classRemove") {
      if (!className) {
        setCueStatus("Class name is required for class actions.", "error");
        return;
      }
      cue.className = className;
    }

    state.cueEditor.cues.push(cue);
    sortCueList();
    renderCueEditor();
    setCueStatus("Cue added.", "ok");
  }

  function cueCopyJson() {
    var els = cueEditorEls();
    if (!els.output) return;
    var text = els.output.value || "";
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { setCueStatus("JSON copied to clipboard.", "ok"); })
        .catch(function () { setCueStatus("Copy failed. Select and copy manually.", "error"); });
      return;
    }

    els.output.focus();
    els.output.select();
    try {
      var ok = document.execCommand("copy");
      if (ok) setCueStatus("JSON copied to clipboard.", "ok");
      else setCueStatus("Copy failed. Select and copy manually.", "error");
    } catch (_e) {
      setCueStatus("Copy failed. Select and copy manually.", "error");
    }
  }

  function cueDownloadJson() {
    var els = cueEditorEls();
    if (!els.output) return;
    var fileName = (state.cueEditor.slideId || "slide") + ".json";
    var text = els.output.value || cueJsonText();
    var blob = new Blob([text], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    setCueStatus("Downloaded " + fileName + ".", "ok");
  }

  function cueClearAll() {
    state.cueEditor.cues = [];
    renderCueEditor();
    setCueStatus("Cleared all cues.", "ok");
  }

  function closeCueEditor() {
    var els = cueEditorEls();
    if (els.backdrop) els.backdrop.classList.add("hidden");
    state.cueEditor.open = false;
  }

  function openCueEditor() {
    var els = cueEditorEls();
    if (!els.backdrop) return;

    closeMenu();
    state.cueEditor.open = true;
    els.backdrop.classList.remove("hidden");
    cueCaptureNow();

    var cur = getCurrentSlide();
    if (cur) loadCueEditorForSlide(cur.id);
    else renderCueEditor();
  }

  /* ================================================================
     Final Quiz (reported to SCORM)
     ================================================================ */

  // Final quiz questions are full slides. The slide templates will call
  // these methods via window.CourseRuntime to report answers.

  function initFinalQuiz() {
    var fq = state.data.quiz && state.data.quiz.final_quiz;
    state.finalTotal = fq && fq.questions ? fq.questions.length : 0;
    state.finalCorrect = 0;
    state.finalAnswered = 0;
  }

  /* ================================================================
     Init
     ================================================================ */

  async function init() {
    scorm.init();
    window.addEventListener("beforeunload", function () { scorm.terminate(); });

    var res = await fetch("../data/course.data.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load course.data.json");
    state.data = await res.json();
    state.totalSlides = (state.data.slides || []).length;
    state.voStartDelayMs = resolveVoStartDelayMs(state.data.meta || {});

    // SFX
    var sfxCfg = state.data.quiz && state.data.quiz.runtime && state.data.quiz.runtime.sfx;
    if (sfxCfg && sfxCfg.correct) state.sfx.correct = new Audio("../" + sfxCfg.correct);
    if (sfxCfg && sfxCfg.incorrect) state.sfx.incorrect = new Audio("../" + sfxCfg.incorrect);

    initFinalQuiz();

    // Slide scaling
    scaleSlide();
    window.addEventListener("resize", scaleSlide);
    renderToc();

    // Navigation
    $("btn-playpause").addEventListener("click", togglePlayPause);
    $("btn-next").addEventListener("click", function () { showSlide(state.slideIndex + 1); });
    $("btn-replay").addEventListener("click", replayCurrentSlide);
    $("btn-speed").addEventListener("click", cyclePlaybackSpeed);
    $("slide-frame").addEventListener("load", syncAudioUnlockFrameListeners);
    var audioStartOverlay = $("audio-start-overlay");
    if (audioStartOverlay) {
      audioStartOverlay.addEventListener("click", function (e) {
        e.preventDefault();
        onAudioUnlockInteraction();
      });
    }

    // Volume & CC
    $("btn-volume").addEventListener("click", toggleMute);
    $("btn-cc").addEventListener("click", toggleCC);
    updatePlaybackSpeedLabel();

    // Menu
    $("btn-menu").addEventListener("click", toggleMenu);
    $("menu-overlay").addEventListener("click", function (e) {
      if (e.target === $("menu-overlay")) closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (state.cueEditor.open) {
        closeCueEditor();
        return;
      }
      if (state.menuOpen) closeMenu();
    });

    // Resources (placeholder)
    $("btn-resources").addEventListener("click", function () {
      // TODO: open resources panel
    });

    // Cue editor (dev-only)
    var cueEditorEnabled = isCueEditorEnabled();
    setCueEditorEnabled(cueEditorEnabled);
    if (cueEditorEnabled) {
      var btnCues = $("btn-cues");
      if (btnCues) btnCues.addEventListener("click", openCueEditor);
      var cueBackdrop = $("cue-backdrop");
      if (cueBackdrop) {
        cueBackdrop.addEventListener("click", function (e) {
          if (e.target === cueBackdrop) closeCueEditor();
        });
      }
      var cueClose = $("cue-close");
      if (cueClose) cueClose.addEventListener("click", closeCueEditor);
      var cueCapture = $("cue-capture");
      if (cueCapture) cueCapture.addEventListener("click", cueCaptureNow);
      var cueAdd = $("cue-add");
      if (cueAdd) cueAdd.addEventListener("click", cueAddFromForm);
      var cueSort = $("cue-sort");
      if (cueSort) {
        cueSort.addEventListener("click", function () {
          sortCueList();
          renderCueEditor();
          setCueStatus("Cues sorted.", "ok");
        });
      }
      var cueClear = $("cue-clear");
      if (cueClear) cueClear.addEventListener("click", cueClearAll);
      var cueLoad = $("cue-load");
      if (cueLoad) {
        cueLoad.addEventListener("click", function () {
          var cur = getCurrentSlide();
          if (!cur) return;
          loadCueEditorForSlide(cur.id);
        });
      }
      var cueCopy = $("cue-copy-json");
      if (cueCopy) cueCopy.addEventListener("click", cueCopyJson);
      var cueDownload = $("cue-download-json");
      if (cueDownload) cueDownload.addEventListener("click", cueDownloadJson);
    }

    // Knowledge Check modal
    $("kc-submit").addEventListener("click", submitKC);
    $("kc-continue").addEventListener("click", continueKC);
    $("kc-backdrop").addEventListener("click", function (e) {
      if (e.target === $("kc-backdrop")) closeKC();
    });

    // Public API for slides to call into
    window.CourseRuntime = {
      // Knowledge checks: slides can trigger the KC modal
      openKnowledgeCheck: openKC,

      // Interaction audio snippets for click/hover interactions in slides
      playInteractionClip: function (clipId, overrides) {
        return playInteractionClip(clipId, overrides);
      },
      playInteractionAudio: function (options) {
        return playInteractionAudio(options);
      },
      stopInteractionAudio: function () {
        stopInteractionAudio(false);
      },

      // Final quiz: slides report individual answers
      submitFinalAnswer: function (isCorrect) {
        state.finalAnswered += 1;
        if (isCorrect) state.finalCorrect += 1;

        // If all final questions answered, report to SCORM
        if (state.finalAnswered >= state.finalTotal && state.finalTotal > 0) {
          var score = pct(state.finalCorrect, state.finalTotal);
          var threshold = Number(
            state.data.quiz && state.data.quiz.final_quiz && state.data.quiz.final_quiz.passing_score != null
              ? state.data.quiz.final_quiz.passing_score
              : 80
          );
          scorm.reportFinal(score, threshold);
        }
      },

      // Legacy: direct score submission
      submitFinalQuiz: function (scorePercent) {
        var threshold = Number(
          state.data.quiz && state.data.quiz.final_quiz && state.data.quiz.final_quiz.passing_score != null
            ? state.data.quiz.final_quiz.passing_score
            : 80
        );
        scorm.reportFinal(scorePercent, threshold);
      },

      // Navigation control for slides
      nextSlide: function () { showSlide(state.slideIndex + 1); },
      prevSlide: function () { showSlide(state.slideIndex - 1); },

      // Slide can query state
      getSlideIndex: function () { return state.slideIndex; },
      getTotalSlides: function () { return state.totalSlides; },
      getAudioCurrentTime: function () { return state.audio ? Number(state.audio.currentTime) || 0 : 0; },
      getAudioDuration: function () { return state.audio ? Number(state.audio.duration) || 0 : 0; },
      isAudioPlaying: function () {
        if (!state.audio) return false;
        return !state.audio.paused && !state.pendingAudioStart && !state.audioStartTimer;
      }
    };

    showSlide(0);
  }

  init().catch(function (e) {
    console.error(e);
    document.body.innerHTML = "<pre>Player init failed. See console.</pre>";
  });
})();
