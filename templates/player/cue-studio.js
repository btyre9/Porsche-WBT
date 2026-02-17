(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  var state = {
    data: null,
    slide: null,
    audio: null,
    cues: [],
    cueSource: "new",
    pickMode: false,
    highlightEl: null,
    highlightPrevOutline: "",
    highlightPrevOutlineOffset: ""
  };

  function setStatus(message, mode) {
    var el = $("studio-status");
    if (!el) return;
    el.textContent = message || "";
    el.className = "";
    if (mode) el.classList.add(mode);
  }

  function toFixed2(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) n = 0;
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function escapeCss(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function clearHighlight() {
    if (!state.highlightEl) return;
    state.highlightEl.style.outline = state.highlightPrevOutline;
    state.highlightEl.style.outlineOffset = state.highlightPrevOutlineOffset;
    state.highlightEl = null;
  }

  function highlightElement(el) {
    clearHighlight();
    if (!el || !el.style) return;
    state.highlightEl = el;
    state.highlightPrevOutline = el.style.outline || "";
    state.highlightPrevOutlineOffset = el.style.outlineOffset || "";
    el.style.outline = "3px solid #d5001c";
    el.style.outlineOffset = "2px";
  }

  function selectorFromElement(el) {
    if (!el || !el.ownerDocument) return "";

    var animKey = el.getAttribute("data-anim-key");
    if (animKey) return '[data-anim-key="' + String(animKey).replace(/"/g, '\\"') + '"]';

    if (el.id) return "#" + escapeCss(el.id);

    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1 && cur.tagName.toLowerCase() !== "html") {
      var part = cur.tagName.toLowerCase();
      var classList = cur.classList;
      if (classList && classList.length > 0) {
        part += "." + escapeCss(classList[0]);
      }

      var parent = cur.parentElement;
      if (parent) {
        var siblings = parent.children;
        var sameTagCount = 0;
        var sameTagIndex = 0;
        for (var i = 0; i < siblings.length; i += 1) {
          if (siblings[i].tagName === cur.tagName) {
            sameTagCount += 1;
            if (siblings[i] === cur) sameTagIndex = sameTagCount;
          }
        }
        if (sameTagCount > 1 && sameTagIndex > 0) part += ":nth-of-type(" + sameTagIndex + ")";
      }

      parts.unshift(part);
      cur = cur.parentElement;
      if (parts.length >= 6) break;
    }

    return parts.join(" > ");
  }

  function setPickMode(enabled) {
    state.pickMode = !!enabled;
    var btn = $("btn-pick-mode");
    if (!btn) return;
    if (state.pickMode) {
      btn.textContent = "Picking... Click an element";
      btn.classList.add("btn-primary");
    } else {
      btn.textContent = "Pick From Slide";
      btn.classList.add("btn-primary");
    }
  }

  function updateAudioDisplay() {
    var cur = state.audio ? Number(state.audio.currentTime) || 0 : 0;
    var dur = state.audio ? Number(state.audio.duration) || 0 : 0;
    var timeEl = $("audio-time");
    var seek = $("audio-seek");
    if (timeEl) timeEl.textContent = toFixed2(cur) + " / " + toFixed2(dur);
    if (seek) {
      seek.max = String(dur > 0 ? dur : 0);
      seek.value = String(cur);
    }
  }

  function resolveSlideAudioSrc(slide) {
    if (!slide) return "";
    if (slide.audio_vo) return slide.audio_vo;

    var id = String(slide.id || "");
    var m = id.match(/^slide-([A-Z]{2}\d{2}_SLD_\d{3})$/);
    if (m) return "assets/audio/vo/" + m[1] + ".mp3";
    return "";
  }

  function stopAudio() {
    if (!state.audio) return;
    state.audio.pause();
    state.audio = null;
    updateAudioDisplay();
  }

  function loadAudio(slide) {
    stopAudio();
    var audioPath = resolveSlideAudioSrc(slide);
    $("status-audio").textContent = audioPath || "(none)";
    if (!audioPath) return;

    var audio = new Audio("../" + audioPath);
    state.audio = audio;
    audio.addEventListener("loadedmetadata", updateAudioDisplay);
    audio.addEventListener("timeupdate", updateAudioDisplay);
    audio.addEventListener("seeked", updateAudioDisplay);
    audio.addEventListener("ended", updateAudioDisplay);
    audio.addEventListener("error", function () {
      setStatus("Could not load audio: " + audioPath, "error");
    });
    audio.preload = "auto";
    updateAudioDisplay();
  }

  function cueToOutput(cue) {
    var out = {
      at: cue.at,
      action: cue.action
    };
    if (cue.target) out.target = cue.target;
    else out.selector = cue.selector;
    if (cue.preset) out.preset = cue.preset;
    if (Number.isFinite(cue.duration)) out.duration = cue.duration;
    return out;
  }

  function cueJsonText() {
    return JSON.stringify({
      version: 1,
      followVoiceover: true,
      cues: state.cues.map(cueToOutput)
    }, null, 2);
  }

  function renderCues() {
    var list = $("cue-list");
    var output = $("cue-json-output");
    if (!list || !output) return;

    list.innerHTML = "";
    for (var i = 0; i < state.cues.length; i += 1) {
      (function (index) {
        var cue = state.cues[index];
        var tr = document.createElement("tr");
        var values = [
          String(index + 1),
          toFixed2(cue.at),
          cue.action,
          cue.target || cue.selector || "",
          cue.preset || "-",
          Number.isFinite(cue.duration) ? toFixed2(cue.duration) : "-"
        ];
        for (var c = 0; c < values.length; c += 1) {
          var td = document.createElement("td");
          td.textContent = values[c];
          tr.appendChild(td);
        }
        var removeTd = document.createElement("td");
        var btn = document.createElement("button");
        btn.textContent = "x";
        btn.addEventListener("click", function () {
          state.cues.splice(index, 1);
          renderCues();
          setStatus("Cue removed.", "ok");
        });
        removeTd.appendChild(btn);
        tr.appendChild(removeTd);
        list.appendChild(tr);
      })(i);
    }

    output.value = cueJsonText();
  }

  function sortCues() {
    state.cues.sort(function (a, b) {
      if (a.at !== b.at) return a.at - b.at;
      return (a.target || a.selector || "").localeCompare(b.target || b.selector || "");
    });
  }

  function resolveCueCandidates(slideId) {
    var id = String(slideId || "");
    var names = [];
    if (id) names.push(id + ".json");

    var m = id.match(/^slide-([A-Z]{2}\d{2}_SLD_(\d{3}))$/);
    if (m) {
      var code = m[1];
      var num3 = m[2];
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

  function normalizeIncomingCue(raw) {
    if (!raw || typeof raw !== "object") return null;
    var at = Number(raw.at);
    if (!Number.isFinite(at) || at < 0) return null;
    var action = String(raw.action || raw.type || "in");
    if (action !== "in" && action !== "out") return null;

    var cue = {
      at: Math.round(at * 1000) / 1000,
      action: action
    };

    if (raw.target) cue.target = String(raw.target).trim();
    if (raw.selector) cue.selector = String(raw.selector).trim();
    if (!cue.target && !cue.selector) return null;

    var preset = String(raw.preset || "").trim();
    if (preset) cue.preset = preset;
    var duration = Number(raw.duration);
    if (Number.isFinite(duration) && duration >= 0) cue.duration = Math.round(duration * 1000) / 1000;
    return cue;
  }

  function loadExistingCues(slideId) {
    state.cues = [];
    state.cueSource = "new";
    renderCues();

    var candidates = resolveCueCandidates(slideId);
    function tryFetch(index) {
      if (index >= candidates.length) {
        setStatus("No existing cue file found for this slide.", "");
        return Promise.resolve();
      }
      return fetch("../assets/animation-cues/" + candidates[index], { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) return null;
          return res.json().catch(function () { return null; });
        })
        .then(function (json) {
          if (!json || !Array.isArray(json.cues)) return tryFetch(index + 1);
          state.cues = json.cues.map(normalizeIncomingCue).filter(Boolean);
          sortCues();
          state.cueSource = candidates[index];
          renderCues();
          setStatus("Loaded " + String(state.cues.length) + " cue(s) from " + candidates[index] + ".", "ok");
          return Promise.resolve();
        })
        .catch(function () { return tryFetch(index + 1); });
    }

    return tryFetch(0);
  }

  function setupFramePicker() {
    clearHighlight();
    var frame = $("slide-frame");
    if (!frame) return;
    var doc;
    try {
      doc = frame.contentDocument || null;
    } catch (_e) {
      doc = null;
    }
    if (!doc) return;

    doc.addEventListener("click", function (e) {
      if (!state.pickMode) return;
      e.preventDefault();
      e.stopPropagation();
      var target = e.target;
      if (!target || target.nodeType !== 1) return;
      var selector = selectorFromElement(target);
      $("cue-selector").value = selector;
      $("status-element").textContent = selector || "(none)";
      highlightElement(target);
      setPickMode(false);
      setStatus("Element selected.", "ok");
    }, true);
  }

  function loadSlide(slideId) {
    if (!state.data || !Array.isArray(state.data.slides)) return;
    var found = null;
    for (var i = 0; i < state.data.slides.length; i += 1) {
      if (state.data.slides[i].id === slideId) {
        found = state.data.slides[i];
        break;
      }
    }
    if (!found) return;

    state.slide = found;
    $("status-slide-id").textContent = found.id;
    $("status-element").textContent = "none";
    $("cue-selector").value = "";
    setPickMode(false);
    clearHighlight();

    $("slide-frame").src = "../slides/" + found.id + ".html?studio=" + Date.now();
    loadAudio(found);
    loadExistingCues(found.id);
  }

  function populateSlideSelect() {
    var select = $("slide-select");
    if (!select || !state.data || !Array.isArray(state.data.slides)) return;
    select.innerHTML = "";
    for (var i = 0; i < state.data.slides.length; i += 1) {
      var s = state.data.slides[i];
      var opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.id + " - " + (s.slide_title || s.id);
      select.appendChild(opt);
    }
  }

  function selectorToTarget(selector) {
    var m = String(selector || "").trim().match(/^\[data-anim-key=(['"])(.+)\1\]$/);
    return m ? m[2] : "";
  }

  function addCue() {
    var selectorValue = String($("cue-selector").value || "").trim();
    if (!selectorValue) {
      setStatus("Select an element first (Pick From Slide).", "error");
      return;
    }

    var at = Number($("cue-time").value);
    if (!Number.isFinite(at) || at < 0) {
      setStatus("Cue time must be a valid number.", "error");
      return;
    }

    var action = String($("cue-action").value || "in");
    if (action !== "in" && action !== "out") action = "in";

    var cue = {
      at: Math.round(at * 1000) / 1000,
      action: action,
      preset: String($("cue-preset").value || "fade")
    };

    var target = selectorToTarget(selectorValue);
    if (target) cue.target = target;
    else cue.selector = selectorValue;

    var duration = Number($("cue-duration").value);
    if (Number.isFinite(duration) && duration >= 0) cue.duration = Math.round(duration * 1000) / 1000;

    state.cues.push(cue);
    sortCues();
    renderCues();
    setStatus("Cue added.", "ok");
  }

  function captureTime() {
    var cur = state.audio ? Number(state.audio.currentTime) || 0 : 0;
    $("cue-time").value = toFixed2(cur);
  }

  function copyJson() {
    var text = cueJsonText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { setStatus("JSON copied.", "ok"); })
        .catch(function () { setStatus("Copy failed. Use Download JSON.", "error"); });
      return;
    }
    setStatus("Clipboard not available. Use Download JSON.", "error");
  }

  function downloadJson() {
    var name = (state.slide ? state.slide.id : "slide") + ".json";
    var blob = new Blob([cueJsonText()], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    setStatus("Downloaded " + name + ".", "ok");
  }

  function bindUi() {
    $("btn-load-slide").addEventListener("click", function () {
      loadSlide($("slide-select").value);
    });
    $("slide-select").addEventListener("change", function () {
      loadSlide($("slide-select").value);
    });
    $("slide-frame").addEventListener("load", setupFramePicker);

    $("btn-open-player").addEventListener("click", function () {
      window.open("./", "_blank");
    });
    $("btn-open-player-cues").addEventListener("click", function () {
      window.open("./?cues=1", "_blank");
    });

    $("btn-pick-mode").addEventListener("click", function () {
      setPickMode(!state.pickMode);
      setStatus(state.pickMode ? "Click an element on the slide." : "", "");
    });

    $("btn-audio-play").addEventListener("click", function () {
      if (!state.audio) return;
      state.audio.play().catch(function () {
        setStatus("Audio playback blocked. Click Play again.", "error");
      });
    });
    $("btn-audio-pause").addEventListener("click", function () {
      if (state.audio) state.audio.pause();
    });
    $("btn-capture-time").addEventListener("click", captureTime);
    $("audio-seek").addEventListener("input", function () {
      if (!state.audio) return;
      var t = Number($("audio-seek").value);
      if (Number.isFinite(t) && t >= 0) state.audio.currentTime = t;
    });

    $("btn-add-cue").addEventListener("click", addCue);
    $("btn-sort-cues").addEventListener("click", function () {
      sortCues();
      renderCues();
      setStatus("Cues sorted.", "ok");
    });
    $("btn-clear-cues").addEventListener("click", function () {
      state.cues = [];
      renderCues();
      setStatus("All cues cleared.", "ok");
    });
    $("btn-reload-cues").addEventListener("click", function () {
      if (!state.slide) return;
      loadExistingCues(state.slide.id);
    });
    $("btn-copy-json").addEventListener("click", copyJson);
    $("btn-download-json").addEventListener("click", downloadJson);
  }

  function init() {
    fetch("../data/course.data.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("Could not load course.data.json");
        return res.json();
      })
      .then(function (data) {
        state.data = data;
        populateSlideSelect();
        bindUi();
        var firstId = state.data.slides && state.data.slides[0] && state.data.slides[0].id;
        if (firstId) {
          $("slide-select").value = firstId;
          loadSlide(firstId);
        } else {
          setStatus("No slides found in course data.", "error");
        }
      })
      .catch(function (err) {
        console.error(err);
        setStatus("Cue Studio failed to initialize: " + err.message, "error");
      });
  }

  init();
})();
