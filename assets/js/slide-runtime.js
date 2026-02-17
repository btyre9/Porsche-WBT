/* global gsap */
(function () {
  "use strict";

  var PRESETS = {};
  var EPS = 0.02;
  var SKIP_STYLE_KEYS = {
    duration: true,
    ease: true,
    delay: true,
    stagger: true,
    overwrite: true,
    onComplete: true,
    onStart: true
  };

  function registerPreset(names, preset) {
    for (var i = 0; i < names.length; i += 1) {
      PRESETS[names[i]] = preset;
    }
  }

  registerPreset(["fade", "fadein", "FadeIn"], {
    in: {
      from: { opacity: 0, y: 16 },
      to: { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }
    },
    out: {
      to: { opacity: 0, y: -10, duration: 0.35, ease: "power1.in" }
    }
  });

  registerPreset(["fadeup", "slideup", "SlideUp"], {
    in: {
      from: { opacity: 0, y: 32 },
      to: { opacity: 1, y: 0, duration: 0.65, ease: "power2.out" }
    },
    out: {
      to: { opacity: 0, y: -26, duration: 0.35, ease: "power1.in" }
    }
  });

  registerPreset(["fadedown", "slidedown"], {
    in: {
      from: { opacity: 0, y: -32 },
      to: { opacity: 1, y: 0, duration: 0.65, ease: "power2.out" }
    },
    out: {
      to: { opacity: 0, y: 26, duration: 0.35, ease: "power1.in" }
    }
  });

  registerPreset(["slideleft"], {
    in: {
      from: { opacity: 0, x: 48 },
      to: { opacity: 1, x: 0, duration: 0.65, ease: "power2.out" }
    },
    out: {
      to: { opacity: 0, x: -48, duration: 0.35, ease: "power1.in" }
    }
  });

  registerPreset(["slideright"], {
    in: {
      from: { opacity: 0, x: -48 },
      to: { opacity: 1, x: 0, duration: 0.65, ease: "power2.out" }
    },
    out: {
      to: { opacity: 0, x: 48, duration: 0.35, ease: "power1.in" }
    }
  });

  registerPreset(["scalein", "ScaleIn"], {
    in: {
      from: { opacity: 0, scale: 0.94 },
      to: { opacity: 1, scale: 1, duration: 0.55, ease: "power1.out" }
    },
    out: {
      to: { opacity: 0, scale: 0.97, duration: 0.3, ease: "power1.in" }
    }
  });

  registerPreset(["scaleout"], {
    in: {
      from: { opacity: 0, scale: 1.06 },
      to: { opacity: 1, scale: 1, duration: 0.5, ease: "power1.out" }
    },
    out: {
      to: { opacity: 0, scale: 1.06, duration: 0.3, ease: "power1.in" }
    }
  });

  function hasGsap() {
    return !!window.gsap;
  }

  function copyObject(value) {
    var out = {};
    if (!value || typeof value !== "object") return out;
    for (var k in value) {
      if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
      out[k] = value[k];
    }
    return out;
  }

  function mergeObjects(base, extra) {
    var out = copyObject(base);
    if (!extra || typeof extra !== "object") return out;
    for (var k in extra) {
      if (!Object.prototype.hasOwnProperty.call(extra, k)) continue;
      out[k] = extra[k];
    }
    return out;
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizePresetKey(name) {
    return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function getPreset(name) {
    var raw = String(name || "").trim();
    if (!raw) return PRESETS.fade;
    if (PRESETS[raw]) return PRESETS[raw];
    var normalized = normalizePresetKey(raw);
    if (PRESETS[normalized]) return PRESETS[normalized];
    return PRESETS.fade;
  }

  function getPresetPhase(presetName, action) {
    var preset = getPreset(presetName);
    if (action === "out") return preset.out || { to: { opacity: 0, duration: 0.35, ease: "power1.in" } };
    return preset.in || { from: { opacity: 0 }, to: { opacity: 1, duration: 0.5, ease: "power1.out" } };
  }

  function applyVarsWithoutGsap(node, vars) {
    if (!node || !node.style || !vars) return;

    var transforms = [];
    if (vars.x != null) transforms.push("translateX(" + String(vars.x) + "px)");
    if (vars.y != null) transforms.push("translateY(" + String(vars.y) + "px)");
    if (vars.scale != null) transforms.push("scale(" + String(vars.scale) + ")");
    if (vars.rotate != null) transforms.push("rotate(" + String(vars.rotate) + "deg)");
    if (transforms.length) node.style.transform = transforms.join(" ");

    for (var key in vars) {
      if (!Object.prototype.hasOwnProperty.call(vars, key)) continue;
      if (SKIP_STYLE_KEYS[key]) continue;
      if (key === "x" || key === "y" || key === "scale" || key === "rotate") continue;
      if (key === "autoAlpha") {
        var alpha = Number(vars[key]);
        node.style.opacity = String(alpha);
        node.style.visibility = alpha <= 0 ? "hidden" : "visible";
        continue;
      }
      if (key === "clearProps") continue;
      node.style[key] = String(vars[key]);
    }
  }

  function setNodesToVars(nodes, vars) {
    if (!nodes || !nodes.length || !vars) return;
    if (hasGsap()) {
      gsap.set(nodes, vars);
      return;
    }
    for (var i = 0; i < nodes.length; i += 1) applyVarsWithoutGsap(nodes[i], vars);
  }

  function animateNodesIn(nodes, fromVars, toVars) {
    if (!nodes || !nodes.length) return;
    if (hasGsap()) {
      gsap.killTweensOf(nodes);
      gsap.fromTo(nodes, fromVars, toVars);
      return;
    }
    for (var i = 0; i < nodes.length; i += 1) applyVarsWithoutGsap(nodes[i], toVars);
  }

  function animateNodesOut(nodes, toVars) {
    if (!nodes || !nodes.length) return;
    if (hasGsap()) {
      gsap.killTweensOf(nodes);
      gsap.to(nodes, toVars);
      return;
    }
    for (var i = 0; i < nodes.length; i += 1) applyVarsWithoutGsap(nodes[i], toVars);
  }

  function runIntroAnimations(root) {
    if (!root) return;

    var rootPreset = root.getAttribute("data-intro-animation");
    var targets = root.querySelectorAll("[data-anim-item]");
    if (!targets.length) targets = [root];
    if (!hasGsap()) return;

    var byPreset = {};
    for (var i = 0; i < targets.length; i += 1) {
      var el = targets[i];
      var ownPreset = el.getAttribute("data-anim-preset");
      var presetName = ownPreset || rootPreset || "FadeIn";
      if (!byPreset[presetName]) byPreset[presetName] = [];
      byPreset[presetName].push(el);
    }

    Object.keys(byPreset).forEach(function (presetName) {
      var set = byPreset[presetName];
      var phase = getPresetPhase(presetName, "in");
      var toVars = mergeObjects({ stagger: 0.12, delay: 0.08 }, phase.to);
      gsap.fromTo(set, phase.from, toVars);
    });
  }

  function uniqueList(items) {
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

  function resolveCueSheetCandidates(slideId) {
    var id = String(slideId || "");
    var names = [];
    if (id) names.push(id + ".json");

    var match = id.match(/^slide-([A-Z]{2}\d{2}_SLD_(\d{3}))$/);
    if (match) {
      var code = match[1];
      var num3 = match[2];
      var num = Number(num3);
      names.push(code + ".json");
      if (Number.isFinite(num)) {
        var num2 = ("0" + String(num)).slice(-2);
        names.push("slide-" + num2 + ".json");
      }
      names.push("slide-" + num3 + ".json");
    }

    return uniqueList(names);
  }

  function loadCueSheet(slideId) {
    var candidates = resolveCueSheetCandidates(slideId);
    if (!candidates.length || typeof fetch !== "function") return Promise.resolve(null);

    function tryFetch(index) {
      if (index >= candidates.length) return Promise.resolve(null);

      var path = "../assets/animation-cues/" + candidates[index];
      return fetch(path, { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) return null;
          return res.json().catch(function () { return null; });
        })
        .then(function (json) {
          if (json) return json;
          return tryFetch(index + 1);
        })
        .catch(function () {
          return tryFetch(index + 1);
        });
    }

    return tryFetch(0);
  }

  function normalizeCue(rawCue) {
    if (!rawCue || typeof rawCue !== "object") return null;

    var at = toNumber(rawCue.at != null ? rawCue.at : rawCue.time, null);
    if (!Number.isFinite(at) || at < 0) return null;

    var actionRaw = String(rawCue.action || rawCue.type || "in").trim().toLowerCase();
    var action = actionRaw;
    if (action === "addclass") action = "classadd";
    if (action === "removeclass") action = "classremove";
    if (!/^(in|out|set|classadd|classremove)$/.test(action)) return null;

    var target = String(rawCue.target || rawCue.key || "").trim();
    var selector = String(rawCue.selector || "").trim();
    if (!target && !selector) return null;

    return {
      at: at,
      action: action,
      target: target,
      selector: selector,
      preset: String(rawCue.preset || rawCue.animation || "").trim(),
      duration: toNumber(rawCue.duration, null),
      delay: toNumber(rawCue.delay, null),
      stagger: toNumber(rawCue.stagger, null),
      ease: String(rawCue.ease || "").trim(),
      className: String(rawCue.className || rawCue.class || "").trim(),
      from: rawCue.from && typeof rawCue.from === "object" ? rawCue.from : null,
      to: rawCue.to && typeof rawCue.to === "object" ? rawCue.to : null,
      set: rawCue.set && typeof rawCue.set === "object" ? rawCue.set : null,
      _targets: []
    };
  }

  function normalizeCueSheet(rawSheet) {
    var sheet = rawSheet;
    if (!sheet || typeof sheet !== "object") return null;

    var source = Array.isArray(sheet) ? sheet : sheet.cues;
    if (!Array.isArray(source)) return null;

    var cues = [];
    for (var i = 0; i < source.length; i += 1) {
      var cue = normalizeCue(source[i]);
      if (cue) cues.push(cue);
    }
    cues.sort(function (a, b) { return a.at - b.at; });

    return {
      followVoiceover: sheet.followVoiceover !== false,
      pollMs: Math.max(16, Math.min(250, Math.round(toNumber(sheet.pollMs, 33)))),
      cues: cues
    };
  }

  function escapeAttrValue(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  }

  function resolveCueTargets(root, cue) {
    if (!root || !cue) return [];
    var nodes = [];
    var nodeList = null;
    var i = 0;

    if (cue.selector) {
      try {
        nodeList = root.querySelectorAll(cue.selector);
      } catch (_e) {
        nodeList = [];
      }
      for (i = 0; i < nodeList.length; i += 1) nodes.push(nodeList[i]);
      return nodes;
    }

    if (cue.target) {
      var selector = '[data-anim-key="' + escapeAttrValue(cue.target) + '"]';
      nodeList = root.querySelectorAll(selector);
      for (i = 0; i < nodeList.length; i += 1) nodes.push(nodeList[i]);
    }

    return nodes;
  }

  function applyCueTiming(overrides, cue) {
    var out = copyObject(overrides);
    if (Number.isFinite(cue.duration)) out.duration = cue.duration;
    if (Number.isFinite(cue.delay)) out.delay = cue.delay;
    if (Number.isFinite(cue.stagger)) out.stagger = cue.stagger;
    if (cue.ease) out.ease = cue.ease;
    return out;
  }

  function rememberNode(engine, node) {
    if (!node || engine.baseStyles.has(node)) return;
    engine.baseStyles.set(node, node.getAttribute("style"));
    engine.nodes.push(node);
  }

  function collectCueTargets(engine) {
    for (var i = 0; i < engine.sheet.cues.length; i += 1) {
      var cue = engine.sheet.cues[i];
      cue._targets = resolveCueTargets(engine.root, cue);
      for (var j = 0; j < cue._targets.length; j += 1) rememberNode(engine, cue._targets[j]);
    }
  }

  function restoreNodeStyles(engine) {
    for (var i = 0; i < engine.nodes.length; i += 1) {
      var node = engine.nodes[i];
      var baseStyle = engine.baseStyles.get(node);
      if (baseStyle == null) node.removeAttribute("style");
      else node.setAttribute("style", baseStyle);
    }
  }

  function applyInitialCueStates(engine) {
    var firstInCueByNode = new Map();
    for (var i = 0; i < engine.sheet.cues.length; i += 1) {
      var cue = engine.sheet.cues[i];
      if (cue.action !== "in") continue;
      for (var j = 0; j < cue._targets.length; j += 1) {
        var node = cue._targets[j];
        if (!firstInCueByNode.has(node)) firstInCueByNode.set(node, cue);
      }
    }

    var nodes = Array.from(firstInCueByNode.keys());
    for (var k = 0; k < nodes.length; k += 1) {
      var targetNode = nodes[k];
      var firstCue = firstInCueByNode.get(targetNode);
      var phase = getPresetPhase(firstCue.preset, "in");
      var fromVars = mergeObjects(phase.from, firstCue.from || {});
      setNodesToVars([targetNode], fromVars);
    }
  }

  function applyCue(engine, cue) {
    var targets = cue._targets || [];
    if (!targets.length) return;

    if (cue.action === "classadd" || cue.action === "classremove") {
      if (!cue.className) return;
      for (var i = 0; i < targets.length; i += 1) {
        if (cue.action === "classadd") targets[i].classList.add(cue.className);
        else targets[i].classList.remove(cue.className);
      }
      return;
    }

    if (cue.action === "set") {
      var setVars = cue.set || cue.to || cue.from;
      if (!setVars) return;
      setNodesToVars(targets, setVars);
      return;
    }

    var phase = getPresetPhase(cue.preset, cue.action);
    if (cue.action === "out") {
      var outVars = applyCueTiming(mergeObjects(phase.to, cue.to || {}), cue);
      animateNodesOut(targets, outVars);
      return;
    }

    var fromVars = mergeObjects(phase.from, cue.from || {});
    var toVars = applyCueTiming(mergeObjects(phase.to, cue.to || {}), cue);
    animateNodesIn(targets, fromVars, toVars);
  }

  function getVoiceoverTimeSec() {
    try {
      if (window.parent && window.parent.CourseRuntime && typeof window.parent.CourseRuntime.getAudioCurrentTime === "function") {
        var t = Number(window.parent.CourseRuntime.getAudioCurrentTime());
        if (Number.isFinite(t) && t >= 0) return t;
      }
    } catch (_e) {}
    return null;
  }

  function getClockTimeSec(engine) {
    if (engine.sheet.followVoiceover) {
      var voTime = getVoiceoverTimeSec();
      if (voTime != null) return voTime;
    }
    return (Date.now() - engine.localStartMs) / 1000;
  }

  function processCuesUntil(engine, clockTimeSec) {
    while (
      engine.nextCueIndex < engine.sheet.cues.length &&
      engine.sheet.cues[engine.nextCueIndex].at <= clockTimeSec + EPS
    ) {
      applyCue(engine, engine.sheet.cues[engine.nextCueIndex]);
      engine.nextCueIndex += 1;
    }
    engine.lastClockSec = clockTimeSec;
  }

  function resetCueEngine(engine, seekToSec) {
    restoreNodeStyles(engine);
    applyInitialCueStates(engine);
    engine.nextCueIndex = 0;
    engine.lastClockSec = 0;
    processCuesUntil(engine, seekToSec);
  }

  function tickCueEngine(engine) {
    var nowSec = getClockTimeSec(engine);
    if (!Number.isFinite(nowSec) || nowSec < 0) nowSec = 0;

    if (nowSec + EPS < engine.lastClockSec) {
      resetCueEngine(engine, nowSec);
    } else {
      processCuesUntil(engine, nowSec);
    }

    engine.rafId = window.requestAnimationFrame(function () {
      tickCueEngine(engine);
    });
  }

  function startCueEngine(root, sheet) {
    var engine = {
      root: root,
      sheet: sheet,
      localStartMs: Date.now(),
      lastClockSec: 0,
      nextCueIndex: 0,
      rafId: 0,
      nodes: [],
      baseStyles: new Map()
    };

    collectCueTargets(engine);
    if (!engine.nodes.length || !engine.sheet.cues.length) return false;
    resetCueEngine(engine, 0);
    tickCueEngine(engine);

    window.addEventListener("beforeunload", function () {
      if (engine.rafId) window.cancelAnimationFrame(engine.rafId);
    }, { once: true });

    return true;
  }

  function shouldUseCueSheet(root) {
    return !!(root && root.hasAttribute("data-vo-cues"));
  }

  function initSlideRuntime() {
    var root = document.querySelector("[data-slide-id]");
    if (!root) return;

    if (!shouldUseCueSheet(root)) {
      runIntroAnimations(root);
      return;
    }

    var slideId = String(root.getAttribute("data-slide-id") || "").trim();
    loadCueSheet(slideId)
      .then(function (rawSheet) {
        var sheet = normalizeCueSheet(rawSheet);
        if (!sheet || !sheet.cues.length) {
          runIntroAnimations(root);
          return;
        }
        var started = startCueEngine(root, sheet);
        if (!started) runIntroAnimations(root);
      })
      .catch(function () {
        runIntroAnimations(root);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSlideRuntime, { once: true });
  } else {
    initSlideRuntime();
  }
})();
