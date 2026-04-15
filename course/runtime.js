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
      // Do NOT terminate here — learner may still navigate (Review Module).
      // terminate() is called on beforeunload only.
      return true;
    },

    getValue: function (key) {
      if (!this.api) return "";
      try {
        return this.version === "2004"
          ? this.api.GetValue(key)
          : this.api.LMSGetValue(key);
      } catch (_e) { return ""; }
    },

    getLocation: function () {
      var loc = this.version === "2004"
        ? this.getValue("cmi.location")
        : this.getValue("cmi.core.lesson_location");
      return loc || "";
    },

    setLocation: function (slideId) {
      if (!this.api) return;
      if (this.version === "2004") this.setValue("cmi.location", slideId);
      else this.setValue("cmi.core.lesson_location", slideId);
    },

    setIncomplete: function () {
      if (!this.api) return;
      // Only set incomplete if the course hasn't been completed yet
      if (this.version === "2004") {
        var status = this.getValue("cmi.completion_status");
        if (status !== "completed") this.setValue("cmi.completion_status", "incomplete");
      } else {
        var status2 = this.getValue("cmi.core.lesson_status");
        if (status2 !== "passed" && status2 !== "failed") {
          this.setValue("cmi.core.lesson_status", "incomplete");
        }
      }
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
    devMode: false,
    audio: null,
    audioStartTimer: null,
    nextLockedByAudio: false,       // unlocked when VO ends
    nextLockedByInteraction: false, // controlled by sandbox-lock/unlock-next messages
    pendingKCReturn: null,          // { kcSlideId, reviewSlides } — active during review loop
    kcReviewConfig: {},             // loaded from kc-review.json
    pendingAudioStart: false,
    audioUnlockArmed: false,
    audioUnlockFrameDoc: null,
    audioStartPromptShown: {},
    interactionAudio: null,
    interactionAudioMeta: null,
    interactionAudioStopTimer: null,
    interactionAudioShouldResumeNarration: false,
    interactionAudioMap: {},
    interactionAudioMapLoadToken: 0,
    interactionFrameDoc: null,
    interactionFlow: {
      requiredIds: [],
      seen: {},
      configured: false,
      complete: false,
      finalCuePending: false,
      finalCuePlayed: false,
      finalCueSrc: "assets/audio/vo/Click_Next.mp3",
      lockNextUntilComplete: false
    },
    voStartDelayMs: 1000,
    captionCues: [],
    activeCaptionIndex: -1,
    captionLoadToken: 0,
    playbackRates: [1, 1.25, 1.5, 2],
    playbackRateIndex: 0,
    sfx: { correct: null, incorrect: null, clickNext: null },
    // Knowledge check
    kcQuestions: [],
    kcIndex: 0,
    kcSubmitted: false,
    // Final quiz (tracked across full-slide quiz questions)
    finalCorrect: 0,
    finalAnswered: 0,
    finalTotal: 0,
    activeFQIds: [],       // randomly selected FQ slide IDs for current attempt
    // TOC locking
    furthestSlide: 0,      // highest slide index the learner has reached
    quizCompleted: false,  // true after any quiz attempt — unlocks all TOC items
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
    // Underscore naming: SLD_CC01_001 | Hyphen naming: SLD-CC01-001 | Legacy: slide-CC01_SLD_001
    return /^SLD[_-][A-Z]{2}\d{2}[_-]001$/.test(id) || /_SLD_001$/.test(id);
  }

  function updateNavButtons() {
    var atEnd = state.slideIndex >= state.totalSlides - 1;
    var locked = state.nextLockedByAudio || state.nextLockedByInteraction;
    $("btn-next").disabled = atEnd || locked;
    $("btn-next").style.opacity = locked ? "0.35" : "";
  }

  function resolveSlideAudioSrc(slide) {
    if (!slide) return "";
    if (slide.audio_vo) return slide.audio_vo;

    var id = String(slide.id || "");
    // Underscore naming: SLD_CC01_001 → SLD_CC01_001_INTRO.mp3
    if (/^SLD_[A-Z]{2}\d{2}_\d{3}$/.test(id)) return "assets/audio/vo/" + id + "_INTRO.mp3";
    // Hyphen naming: SLD-CC01-001
    if (/^SLD-[A-Z]{2}\d{2}-\d{3}$/.test(id)) return "assets/audio/vo/" + id + ".mp3";
    // Legacy naming: slide-CC01_SLD_001
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
    return "./" + raw.replace(/^\/+/, "");
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

  function isLikelyInteractiveElement(node) {
    var cur = node;
    while (cur && cur !== document && cur !== document.body) {
      if (cur.nodeType !== 1) { cur = cur.parentNode; continue; }
      var tag = String(cur.tagName || "").toUpperCase();
      if (
        tag === "A" || tag === "BUTTON" || tag === "INPUT" || tag === "LABEL" ||
        tag === "SELECT" || tag === "TEXTAREA" || tag === "SUMMARY"
      ) return true;

      var role = String(cur.getAttribute && cur.getAttribute("role") || "").toLowerCase();
      if (
        role === "button" || role === "link" || role === "tab" ||
        role === "radio" || role === "option" || role === "checkbox"
      ) return true;

      if (cur.hasAttribute && cur.hasAttribute("data-card")) return true;
      if (cur.hasAttribute && cur.hasAttribute("data-choice")) return true;
      if (cur.hasAttribute && cur.hasAttribute("data-interaction-id")) return true;

      var tabIndex = Number(cur.getAttribute && cur.getAttribute("tabindex"));
      if (Number.isFinite(tabIndex) && tabIndex >= 0) return true;

      cur = cur.parentNode;
    }
    return false;
  }

  function onFrameInteractionIntent(e) {
    if (!state.interactionAudio) return;
    if (state.interactionAudioMeta && state.interactionAudioMeta.isFinalCue) return;
    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    if (!isLikelyInteractiveElement(e.target)) return;

    var shouldQueueFinal = (
      state.interactionFlow.complete &&
      !state.interactionFlow.finalCuePlayed
    );

    stopInteractionAudio(false, { queueFinalCue: shouldQueueFinal });
  }

  function setFrameInteractionStopListenersOnTarget(target, enabled) {
    if (!target || typeof target.addEventListener !== "function" || typeof target.removeEventListener !== "function") return;
    if (enabled) {
      target.addEventListener("pointerdown", onFrameInteractionIntent, true);
      target.addEventListener("click", onFrameInteractionIntent, true);
      target.addEventListener("keydown", onFrameInteractionIntent, true);
      return;
    }
    target.removeEventListener("pointerdown", onFrameInteractionIntent, true);
    target.removeEventListener("click", onFrameInteractionIntent, true);
    target.removeEventListener("keydown", onFrameInteractionIntent, true);
  }

  function syncAudioUnlockFrameListeners() {
    var frameDoc = getSlideFrameDocument();

    if (state.audioUnlockFrameDoc && state.audioUnlockFrameDoc !== frameDoc) {
      setAudioUnlockListenersOnTarget(state.audioUnlockFrameDoc, false);
    }

    state.audioUnlockFrameDoc = frameDoc;
    if (state.audioUnlockArmed && frameDoc) setAudioUnlockListenersOnTarget(frameDoc, true);

    if (state.interactionFrameDoc && state.interactionFrameDoc !== frameDoc) {
      setFrameInteractionStopListenersOnTarget(state.interactionFrameDoc, false);
    }
    state.interactionFrameDoc = frameDoc;
    if (frameDoc) setFrameInteractionStopListenersOnTarget(frameDoc, true);

    injectFQCounter(frameDoc);
  }

  function injectFQCounter(frameDoc) {
    var slides = state.data && state.data.slides || [];
    var slide  = slides[state.slideIndex];
    if (!slide || !isFQSlide(slide.id) || /[_-]SCORE$/i.test(slide.id)) return;
    if (!frameDoc) return;
    var pos = state.activeFQIds.indexOf(slide.id);
    if (pos < 0) return;
    var titleEl = frameDoc.getElementById("modal-title");
    if (titleEl) titleEl.textContent = "Question " + (pos + 1) + " of " + state.activeFQIds.length;
  }

  function isKCSlide(id) {
    return /^KC[_-]/.test(String(id || ""));
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
    var timerEl = $("audio-timer");
    if (!state.audio) {
      setAudioProgressRatio(0);
      if (timerEl) timerEl.textContent = "0:00";
      return;
    }

    var dur = Number(state.audio.duration);
    var cur = Number(state.audio.currentTime);
    if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(cur) || cur < 0) {
      setAudioProgressRatio(0);
      if (timerEl) timerEl.textContent = "0:00";
      return;
    }
    setAudioProgressRatio(cur / dur);
    if (timerEl) {
      var s = Math.floor(cur);
      timerEl.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    }
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
    state.nextLockedByAudio = false;
    updateNavButtons();

    if (maybePlayFinalNextCue()) return;

    // Play transition cue on SLD slides that are not the last slide.
    // Only fire on slides with no configured interaction flow — interactive slides
    // (card-explore, etc.) handle Click_Next themselves via maybePlayFinalNextCue()
    // after all required interactions are visited. Never fire while an interaction
    // clip is still playing.
    var slides = state.data && state.data.slides || [];
    var curSlide = slides[state.slideIndex];
    var isLastSlide = state.slideIndex >= slides.length - 1;
    var flow = state.interactionFlow;
    if (
      curSlide &&
      /^SLD[_-]/.test(curSlide.id) &&
      !isLastSlide &&
      !state.interactionAudio &&
      !(flow && flow.configured)
    ) {
      // If the slide has a custom next-cue (e.g. Click_Start_Quiz on the last
      // content slide before the quiz), play it through the interaction audio
      // channel so it can never overlap any other clip. Otherwise use the
      // standard Click_Next SFX.
      if (curSlide.audio_cue_next) {
        playInteractionAudio({
          src: curSlide.audio_cue_next,
          pauseNarration: false,
          resumeNarration: false,
          isFinalCue: true
        });
      } else {
        playSfx("clickNext");
      }
    }
  }

  function onAudioMeta() {
    syncAudioProgress();
  }

  function postMessageToSlide(msg) {
    var frame = $("slide-frame");
    if (frame && frame.contentWindow) {
      try { frame.contentWindow.postMessage(msg, "*"); } catch (_e) {}
    }
  }

  function togglePlayPause() {
    if (!state.audio) return;

    if (state.audio.paused || state.pendingAudioStart || state.audioStartTimer) {
      if (state.nextLockedByInteraction && state.audio.ended) return;
      if (state.audioStartTimer) {
        clearTimeout(state.audioStartTimer);
        state.audioStartTimer = null;
      }
      if (state.audio.ended) state.audio.currentTime = 0;
      state.pendingAudioStart = false;
      disarmAudioUnlockListeners();
      attemptStartAudioPlayback();
      postMessageToSlide({ type: "player-play-state", playing: true });
      return;
    }

    state.pendingAudioStart = false;
    disarmAudioUnlockListeners();
    state.audio.pause();
    updateAudioUi();
    postMessageToSlide({ type: "player-play-state", playing: false });
  }

  function showSlide(i, forceReplay) {
    var slides = state.data.slides || [];
    if (!slides.length) return;
    if (i < 0 || i >= slides.length) return;

    stopInteractionAudio(false);
    state.interactionAudioMap = {};
    state.interactionAudioMeta = null;
    resetInteractionFlow();

    state.slideIndex = i;
    if (i > state.furthestSlide) {
      state.furthestSlide = i;
      updateTocLock();
    }
    scorm.setLocation(slides[i].id);
    scorm.commit();
    // Reset both lock flags on every slide change
    state.nextLockedByInteraction = false;
    var slideAudio = resolveSlideAudioSrc(slides[i]);
    state.nextLockedByAudio = !!slideAudio && !state.devMode;
    var slideSrc = "./slides/" + slides[i].id + ".html";
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
      state.audio = new Audio("./" + audioSrc);
      state.audio.muted = state.muted;
      state.audio.playbackRate = state.playbackRates[state.playbackRateIndex];
      state.audio.addEventListener("play", onAudioPlay);
      state.audio.addEventListener("pause", onAudioPause);
      state.audio.addEventListener("loadedmetadata", onAudioMeta);
      state.audio.addEventListener("durationchange", onAudioMeta);
      state.audio.addEventListener("timeupdate", onAudioTimeUpdate);
      state.audio.addEventListener("seeked", onAudioSeeked);
      state.audio.addEventListener("ended", onAudioEnded);
      var needsClickUnlock = isModuleFirstSlide(slides[i]) && !state.audioStartPromptShown[slides[i].id];
      if (needsClickUnlock) {
        setAudioStartOverlayVisible(true);
      }
      armAudioUnlockListeners();
      if (!needsClickUnlock) {
        state.audioStartTimer = setTimeout(function () {
          if (!state.audio) return;
          attemptStartAudioPlayback();
          state.audioStartTimer = null;
        }, state.voStartDelayMs);
      }
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

  function isFQSlide(id) {
    return /^FQ[_-]/.test(String(id || ""));
  }

  function renderToc() {
    var list = $("toc-list");
    if (!list) return;

    var slides = state.data && state.data.slides || [];
    list.innerHTML = "";
    var fqEntryAdded = false;
    var displayNum = 0;

    slides.forEach(function (slide, index) {
      var isFQ = isFQSlide(slide.id);
      var isKC = isKCSlide(slide.id);

      // Collapse all FQ slides into a single "Final Quiz" entry
      if (isFQ) {
        if (fqEntryAdded) return;
        fqEntryAdded = true;
      }

      displayNum += 1;

      var item   = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.className = "toc-item" + (isKC || isFQ ? " toc-item--indented" : "");
      button.setAttribute("data-slide-index", String(index));
      button.setAttribute("data-is-fq", isFQ ? "true" : "false");

      var rawLabel = isFQ
        ? "Final Quiz"
        : (slide.slide_title || slide.title || ("Slide " + (index + 1)));
      button.textContent = (isKC || isFQ) ? rawLabel : displayNum + ". " + rawLabel;

      button.addEventListener("click", (function (idx, fqEntry) {
        return function () {
          if (fqEntry) { initFinalQuiz(); }
          showSlide(idx);
          closeMenu();
        };
      })(index, isFQ));

      item.appendChild(button);
      list.appendChild(item);
    });

    updateMenuActiveSlide();
    updateTocLock();
  }

  function updateMenuActiveSlide() {
    var slides = state.data && state.data.slides || [];
    var currentIsFQ = isFQSlide((slides[state.slideIndex] || {}).id);
    var items = document.querySelectorAll(".toc-item");
    for (var i = 0; i < items.length; i += 1) {
      var el = items[i];
      var idx = Number(el.getAttribute("data-slide-index"));
      var entryIsFQ = el.getAttribute("data-is-fq") === "true";
      var isActive = (idx === state.slideIndex) || (entryIsFQ && currentIsFQ);
      if (isActive) el.classList.add("active");
      else el.classList.remove("active");
    }
  }

  function updateTocLock() {
    var items = document.querySelectorAll(".toc-item");
    for (var i = 0; i < items.length; i += 1) {
      var el  = items[i];
      var idx = Number(el.getAttribute("data-slide-index"));
      var unlocked = state.devMode || state.quizCompleted || idx <= state.furthestSlide;
      el.disabled = !unlocked;
      if (unlocked) {
        el.classList.add("visited");
        el.classList.remove("toc-item--locked");
      } else {
        el.classList.remove("visited");
        el.classList.add("toc-item--locked");
      }
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

  function normalizeInteractionIdList(items) {
    if (!Array.isArray(items)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < items.length; i += 1) {
      var id = String(items[i] || "").trim();
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  function interactionRequiredContains(id) {
    var req = state.interactionFlow.requiredIds || [];
    return req.indexOf(id) >= 0;
  }

  function countSeenRequiredInteractions() {
    var req = state.interactionFlow.requiredIds || [];
    var seen = state.interactionFlow.seen || {};
    var count = 0;
    for (var i = 0; i < req.length; i += 1) {
      if (seen[req[i]]) count += 1;
    }
    return count;
  }

  function updateInteractionNextLock() {
    var flow = state.interactionFlow;
    if (!flow.lockNextUntilComplete) return;
    var shouldLock = flow.requiredIds.length > 0 && !flow.finalCuePlayed;
    state.nextLockedByInteraction = shouldLock;
    updateNavButtons();
  }

  function resetInteractionFlow() {
    var flow = state.interactionFlow;
    flow.requiredIds = [];
    flow.seen = {};
    flow.configured = false;
    flow.complete = false;
    flow.finalCuePending = false;
    flow.finalCuePlayed = false;
    flow.finalCueSrc = "assets/audio/vo/Click_Next.mp3";
    flow.lockNextUntilComplete = false;
  }

  function configureInteractionFlow(config) {
    var cfg = config && typeof config === "object" ? config : {};
    var flow = state.interactionFlow;
    var requiredIds = normalizeInteractionIdList(cfg.requiredIds);
    var finalCueSrc = String(cfg.finalCueSrc || "assets/audio/vo/Click_Next.mp3").trim();
    if (!finalCueSrc) finalCueSrc = "assets/audio/vo/Click_Next.mp3";

    flow.requiredIds = requiredIds;
    flow.seen = {};
    flow.configured = requiredIds.length > 0;
    flow.complete = requiredIds.length === 0;
    flow.finalCuePending = false;
    flow.finalCuePlayed = false;
    flow.finalCueSrc = finalCueSrc;
    flow.lockNextUntilComplete = cfg.lockNextUntilComplete !== false && requiredIds.length > 0;

    updateInteractionNextLock();
  }

  function configureInteractionFlowFromMap(json, clipsMap) {
    if (state.interactionFlow.configured) return;
    var data = json && typeof json === "object" ? json : {};
    var requiredIds = normalizeInteractionIdList(data.requiredInteractions);
    if (!requiredIds.length) requiredIds = normalizeInteractionIdList(Object.keys(clipsMap || {}));
    if (!requiredIds.length) return;

    configureInteractionFlow({
      requiredIds: requiredIds,
      finalCueSrc: data.finalCueSrc || data.nextCueSrc || data.clickNextCue || "assets/audio/vo/Click_Next.mp3",
      lockNextUntilComplete: data.lockNextUntilComplete !== false
    });
  }

  function maybePlayFinalNextCue() {
    var flow = state.interactionFlow;
    if (!flow.finalCuePending || flow.finalCuePlayed || !flow.complete) return false;
    if (state.interactionAudio) return false;
    if (state.audio && !state.audio.paused && !state.pendingAudioStart && !state.audioStartTimer) return false;

    flow.finalCuePending = false;
    flow.finalCuePlayed = true;
    updateInteractionNextLock();
    playInteractionAudio({
      src: flow.finalCueSrc,
      pauseNarration: false,
      resumeNarration: false,
      isFinalCue: true
    });
    return true;
  }

  function markInteractionVisited(id, options) {
    var key = String(id || "").trim();
    if (!key) return false;
    if (!interactionRequiredContains(key)) return false;

    var flow = state.interactionFlow;
    flow.seen[key] = true;
    var seenCount = countSeenRequiredInteractions();
    var justCompleted = false;
    if (!flow.complete && flow.requiredIds.length > 0 && seenCount >= flow.requiredIds.length) {
      flow.complete = true;
      flow.finalCuePending = true;
      justCompleted = true;
    }

    postMessageToSlide({
      type: "player-interaction-progress",
      id: key,
      seen: seenCount,
      total: flow.requiredIds.length,
      complete: flow.complete
    });

    if (justCompleted) {
      postMessageToSlide({
        type: "player-interactions-complete",
        total: flow.requiredIds.length
      });
    }

    if (justCompleted && !(options && options.deferFinalCue)) {
      maybePlayFinalNextCue();
    }

    return justCompleted;
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

  function stopInteractionAudio(resumeNarration, options) {
    var shouldResume = resumeNarration !== false;
    var opts = options && typeof options === "object" ? options : {};
    clearInteractionAudioStopTimer();

    var current = state.interactionAudio;
    var wasPlaying = !!current;
    if (current) {
      current.pause();
      state.interactionAudio = null;
      state.interactionAudioMeta = null;
    }

    if (shouldResume) maybeResumeNarrationAfterInteraction();
    else state.interactionAudioShouldResumeNarration = false;

    if (opts.queueFinalCue && wasPlaying) {
      state.interactionFlow.finalCuePending = true;
      maybePlayFinalNextCue();
    }
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
      fetch("./assets/interaction-audio/" + candidates[at], { cache: "no-store" })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (json) {
          if (token !== state.interactionAudioMapLoadToken) return;
          if (!json) {
            tryFetch(at + 1);
            return;
          }
          state.interactionAudioMap = normalizeInteractionAudioMap(json);
          configureInteractionFlowFromMap(json, state.interactionAudioMap);
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
    var isFinalCue = opts.isFinalCue === true;
    var interactionId = String(opts.interactionId || opts.id || "").trim();
    var justCompleted = false;

    if (!isFinalCue && state.interactionAudioMeta && state.interactionAudioMeta.isFinalCue) {
      return true;
    }

    if (!isFinalCue && interactionId) {
      justCompleted = markInteractionVisited(interactionId, { deferFinalCue: true });
    }

    if (
      !isFinalCue &&
      state.interactionFlow.complete &&
      !state.interactionFlow.finalCuePlayed &&
      state.interactionAudio
    ) {
      stopInteractionAudio(false, { queueFinalCue: true });
      return true;
    }

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
      if (state.interactionAudio === channel) {
        state.interactionAudio = null;
        state.interactionAudioMeta = null;
      }
      if (allowResume !== false && !maybePlayFinalNextCue()) maybeResumeNarrationAfterInteraction();
      else if (allowResume === false) state.interactionAudioShouldResumeNarration = false;
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
    state.interactionAudioMeta = {
      isFinalCue: isFinalCue,
      interactionId: interactionId
    };
    channel.load();

    if (justCompleted) state.interactionFlow.finalCuePending = true;
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
    merged.interactionId = id;
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

    if (id) {
      names.push(id + "_INTRO.vtt");
      names.push(id + ".vtt");
    }

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

      fetch("./assets/captions/" + candidates[at], { cache: "no-store" })
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

  function isDevMode() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var val = params.get("dev");
      return val === "1" || val === "true";
    } catch (_e) {
      return false;
    }
  }

  function isCueEditorEnabled() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      return params.get("cues") === "1" || isDevMode();
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
      return fetch("./assets/animation-cues/" + candidate, { cache: "no-store" })
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
    var slides = state.data && state.data.slides || [];
    var allFQIds = [];
    slides.forEach(function (s) {
      if (isFQSlide(s.id) && !/[_-]SCORE$/i.test(s.id)) allFQIds.push(s.id);
    });
    var shuffled       = shuffle(allFQIds);
    state.activeFQIds  = shuffled.slice(0, Math.min(5, shuffled.length));
    state.finalTotal   = state.activeFQIds.length;
    state.finalCorrect  = 0;
    state.finalAnswered = 0;
  }

  function getNextSlideIndex(fromIndex) {
    var slides = state.data && state.data.slides || [];
    var nextI  = fromIndex + 1;
    while (nextI < slides.length) {
      var s = slides[nextI];
      if (isFQSlide(s.id) && !/[_-]SCORE$/i.test(s.id)) {
        if (state.activeFQIds.indexOf(s.id) >= 0) return nextI;
        nextI++;
      } else {
        return nextI;
      }
    }
    return nextI;
  }

  /* ================================================================
     Init
     ================================================================ */

  async function init() {
    scorm.init();
    window.addEventListener("beforeunload", function () { scorm.terminate(); });

    var res = await fetch("./data/course.data.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load course.data.json");
    state.data = await res.json();
    state.totalSlides = (state.data.slides || []).length;
    state.voStartDelayMs = resolveVoStartDelayMs(state.data.meta || {});

    // KC review config — non-fatal if missing
    try {
      var kcRes = await fetch("./data/kc-review.json", { cache: "no-store" });
      if (kcRes.ok) state.kcReviewConfig = await kcRes.json();
    } catch (_e) {}

    // SFX
    var sfxCfg = state.data.quiz && state.data.quiz.runtime && state.data.quiz.runtime.sfx;
    if (sfxCfg && sfxCfg.correct) state.sfx.correct = new Audio("./" + sfxCfg.correct);
    if (sfxCfg && sfxCfg.incorrect) state.sfx.incorrect = new Audio("./" + sfxCfg.incorrect);
    state.sfx.clickNext = new Audio("./assets/audio/vo/Click_Next.mp3");

    initFinalQuiz();

    // Slide scaling
    scaleSlide();
    window.addEventListener("resize", scaleSlide);
    renderToc();

    // Messages from slide iframes
    window.addEventListener("message", function (e) {
      if (!e.data || typeof e.data.type !== "string") return;
      switch (e.data.type) {
        case "sandbox-lock-next":
          state.nextLockedByInteraction = true;
          updateNavButtons();
          break;
        case "sandbox-unlock-next":
          state.nextLockedByInteraction = false;
          updateInteractionNextLock();
          updateNavButtons();
          break;
        case "sandbox-configure-interactions":
          configureInteractionFlow({
            requiredIds: e.data.requiredIds,
            finalCueSrc: e.data.finalCueSrc,
            lockNextUntilComplete: e.data.lockNextUntilComplete
          });
          break;
        case "sandbox-mark-interaction":
          if (e.data.id) markInteractionVisited(e.data.id);
          break;
        case "sandbox-play-interaction":
          if (e.data.clipId) {
            playInteractionClip(e.data.clipId, e.data.overrides);
          } else {
            playInteractionAudio({
              src: e.data.src,
              start: e.data.start,
              end: e.data.end,
              pauseNarration: e.data.pauseNarration,
              resumeNarration: e.data.resumeNarration,
              volume: e.data.volume,
              playbackRate: e.data.playbackRate,
              interactionId: e.data.id
            });
          }
          break;
        case "sandbox-stop-interaction-audio":
          stopInteractionAudio(false);
          break;
        case "sandbox-swap-audio":
          // Slide requests a mid-slide audio swap (e.g. SLD-CC01-008 part 2).
          // Replace state.audio so the player's progress bar / play / speed all work.
          if (e.data.src) {
            if (state.audio) {
              state.audio.removeEventListener("play",            onAudioPlay);
              state.audio.removeEventListener("pause",           onAudioPause);
              state.audio.removeEventListener("loadedmetadata",  onAudioMeta);
              state.audio.removeEventListener("durationchange",  onAudioMeta);
              state.audio.removeEventListener("timeupdate",      onAudioTimeUpdate);
              state.audio.removeEventListener("seeked",          onAudioSeeked);
              state.audio.removeEventListener("ended",           onAudioEnded);
              state.audio.pause();
              state.audio = null;
            }
            state.audio = new Audio("./" + e.data.src);
            state.audio.muted        = state.muted;
            state.audio.playbackRate = state.playbackRates[state.playbackRateIndex];
            state.audio.addEventListener("play",            onAudioPlay);
            state.audio.addEventListener("pause",           onAudioPause);
            state.audio.addEventListener("loadedmetadata",  onAudioMeta);
            state.audio.addEventListener("durationchange",  onAudioMeta);
            state.audio.addEventListener("timeupdate",      onAudioTimeUpdate);
            state.audio.addEventListener("seeked",          onAudioSeeked);
            state.audio.addEventListener("ended",           onAudioEnded);
            // Lock Next for swapped audio and release both locks when it ends.
            // This is belt-and-suspenders alongside the slide's sandbox-unlock-next message.
            // endCue: play a closing audio clip after the swapped audio ends (e.g. "Click Next").
            var swapEndCue = e.data.endCue || null;
            state.nextLockedByAudio = true;
            state.audio.addEventListener("ended", function onSwapEnded() {
              state.nextLockedByInteraction = false;
              state.nextLockedByAudio = false;
              updateNavButtons();
              if (swapEndCue) playInteractionAudio({ src: swapEndCue, pauseNarration: false });
            }, { once: true });
            updateNavButtons();
            updateAudioUi();
            attemptStartAudioPlayback();
          }
          break;
        case "sandbox-next":
          if (typeof e.data.correct === 'boolean') {
            var curSlide = (state.data.slides || [])[state.slideIndex];
            if (curSlide && isFQSlide(curSlide.id) && !/[_-]SCORE$/i.test(curSlide.id)) {
              state.finalAnswered += 1;
              if (e.data.correct) state.finalCorrect += 1;
            }
          }
          var snNext = getNextSlideIndex(state.slideIndex);
          if (snNext < state.totalSlides) showSlide(snNext);
          break;
        case "sandbox-review-module":
          state.quizCompleted = true;
          updateTocLock();
          openMenu();
          break;
        case "sandbox-goto":
          if (e.data.slideId) {
            var slides = state.data && state.data.slides || [];
            for (var gi = 0; gi < slides.length; gi++) {
              if (slides[gi].id === e.data.slideId) { showSlide(gi); break; }
            }
          } else if (e.data.target === 'start') {
            state.finalAnswered = 0;
            state.finalCorrect = 0;
            showSlide(0);
          }
          break;
        case "sandbox-start-review":
          if (e.data.kcSlideId && state.kcReviewConfig[e.data.kcSlideId]) {
            var reviewSlides = state.kcReviewConfig[e.data.kcSlideId];
            state.pendingKCReturn = { kcSlideId: e.data.kcSlideId, reviewSlides: reviewSlides };
            var firstReviewId = reviewSlides[0];
            var allSlides = state.data && state.data.slides || [];
            for (var ri = 0; ri < allSlides.length; ri++) {
              if (allSlides[ri].id === firstReviewId) { showSlide(ri); break; }
            }
          }
          break;
      }
    });

    // Navigation
    $("btn-playpause").addEventListener("click", togglePlayPause);
    $("btn-next").addEventListener("click", function () {
      if (state.pendingKCReturn) {
        var allSlides = state.data && state.data.slides || [];
        var currentId = allSlides[state.slideIndex] && allSlides[state.slideIndex].id;
        var reviewSlides = state.pendingKCReturn.reviewSlides;
        var pos = reviewSlides.indexOf(currentId);
        if (pos >= 0) {
          if (pos === reviewSlides.length - 1) {
            // Last review slide — return to KC with force replay (reshuffles answers)
            var kcId = state.pendingKCReturn.kcSlideId;
            state.pendingKCReturn = null;
            for (var ki = 0; ki < allSlides.length; ki++) {
              if (allSlides[ki].id === kcId) { showSlide(ki, true); return; }
            }
          } else {
            // More review slides — advance to next one in the review list
            var nextReviewId = reviewSlides[pos + 1];
            for (var ni = 0; ni < allSlides.length; ni++) {
              if (allSlides[ni].id === nextReviewId) { showSlide(ni); return; }
            }
          }
        }
      }
      showSlide(getNextSlideIndex(state.slideIndex));
    });
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
      configureInteractions: function (config) {
        configureInteractionFlow(config || {});
      },
      markInteractionVisited: function (id) {
        return markInteractionVisited(id);
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
      goToSlideId: function (slideId) {
        var slides = state.data && state.data.slides || [];
        for (var i = 0; i < slides.length; i++) {
          if (slides[i].id === slideId) { showSlide(i); return; }
        }
      },

      // Slide can query state
      getSlideIndex: function () { return state.slideIndex; },
      getTotalSlides: function () { return state.totalSlides; },
      getAudioCurrentTime: function () { return state.audio ? Number(state.audio.currentTime) || 0 : 0; },
      getAudioDuration: function () { return state.audio ? Number(state.audio.duration) || 0 : 0; },
      isAudioPlaying: function () {
        if (!state.audio) return false;
        return !state.audio.paused && !state.pendingAudioStart && !state.audioStartTimer;
      },

      getFinalResults: function () {
        var answered = state.finalAnswered;
        var total    = state.finalTotal > 0 ? state.finalTotal : (answered > 0 ? answered : 10);
        return { correct: state.finalCorrect, answered: answered, total: total };
      }
    };

    // Dev mode setup
    state.devMode = isDevMode();
    if (state.devMode) {
      // Unlock all TOC items and open the menu immediately
      state.furthestSlide = (state.data && state.data.slides || []).length - 1;
      updateTocLock();
      openMenu();
      // Scrubbing on progress bar
      var progressBar = $("audio-progress");
      if (progressBar) {
        progressBar.classList.add("dev-scrub");
        progressBar.title = "Click to seek";
        progressBar.addEventListener("click", function (e) {
          if (!state.audio || !state.audio.duration) return;
          var rect = progressBar.getBoundingClientRect();
          var frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          state.audio.currentTime = frac * state.audio.duration;
        });
      }
      // Timestamp overlay
      var devTs = $("dev-timestamp");
      if (devTs) {
        devTs.classList.remove("dev-cues");
        (function tickDevTs() {
          var t = state.audio ? Number(state.audio.currentTime) || 0 : 0;
          var m = Math.floor(t / 60);
          var s = (t - m * 60).toFixed(2);
          devTs.textContent = (m > 0 ? m + "m " : "") + s + "s";
          requestAnimationFrame(tickDevTs);
        })();
      }
    }

    // Bookmark: mark incomplete (won't overwrite a prior "completed" status)
    scorm.setIncomplete();

    // Resume from bookmark if one exists
    var bookmark   = scorm.getLocation();
    var startIndex = 0;
    if (bookmark) {
      var allSlides = state.data && state.data.slides || [];
      for (var bi = 0; bi < allSlides.length; bi++) {
        if (allSlides[bi].id === bookmark) {
          if (/[_-]SCORE$/i.test(bookmark)) {
            // Returning to score slide — unlock everything
            startIndex = bi;
            state.furthestSlide = allSlides.length - 1;
            state.quizCompleted = true;
          } else if (isFQSlide(bookmark)) {
            // Mid-quiz — restart from first FQ slide
            for (var fi = 0; fi < allSlides.length; fi++) {
              if (isFQSlide(allSlides[fi].id) && !/[_-]SCORE$/i.test(allSlides[fi].id)) {
                startIndex = fi; break;
              }
            }
            state.furthestSlide = startIndex;
          } else {
            startIndex = bi;
            state.furthestSlide = bi;
          }
          break;
        }
      }
    }

    showSlide(startIndex);
  }

  init().catch(function (e) {
    console.error(e);
    document.body.innerHTML = "<pre>Player init failed. See console.</pre>";
  });
})();
