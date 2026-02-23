/**
 * Sandbox Runtime
 * Lightweight runtime for testing slides with audio, captions, and animation cues.
 * Mimics the Player's CourseRuntime so slides work in both environments.
 */

(function () {
  'use strict';

  const SandboxRuntime = {
    // State
    currentSlideId: null,
    voAudio: null,
    interactionAudio: null,
    captions: [],
    animationCues: [],
    isPlaying: false,

    // DOM elements (injected into slide iframe)
    captionContainer: null,
    controlsContainer: null,

    /**
     * Initialize the runtime for a slide
     * @param {string} slideId - e.g., "SLD-CC01-004"
     * @param {object} options - { autoplay: false, showControls: true }
     */
    init: function (slideId, options = {}) {
      this.currentSlideId = slideId;
      this.options = {
        autoplay: options.autoplay || false,
        showControls: options.showControls === true, // Default to false - toolbar handles controls
        basePath: options.basePath || '../'
      };

      this.voAudio = new Audio();
      this.interactionAudio = new Audio();
      this.captions = [];
      this.animationCues = [];
      this.isPlaying = false;
      this.captionsEnabled = true;

      this.injectUI();
      this.loadAssets();
      this.setupEventListeners();

      console.log(`[SandboxRuntime] Initialized for ${slideId}`);
    },

    /**
     * Inject caption container and controls into the slide
     */
    injectUI: function () {
      // Caption container
      this.captionContainer = document.createElement('div');
      this.captionContainer.id = 'sandbox-captions';
      this.captionContainer.setAttribute('role', 'region');
      this.captionContainer.setAttribute('aria-live', 'polite');
      this.captionContainer.setAttribute('aria-label', 'Captions');
      Object.assign(this.captionContainer.style, {
        position: 'fixed',
        bottom: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: '80%',
        padding: '12px 24px',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        color: '#fff',
        fontSize: '20px',
        lineHeight: '1.4',
        borderRadius: '4px',
        textAlign: 'center',
        fontFamily: "'Porsche Next TT', Arial, sans-serif",
        zIndex: '1000',
        display: 'none',
        pointerEvents: 'none'
      });
      document.body.appendChild(this.captionContainer);

      // Controls container
      if (this.options.showControls) {
        this.controlsContainer = document.createElement('div');
        this.controlsContainer.id = 'sandbox-controls';
        Object.assign(this.controlsContainer.style, {
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 20px',
          backgroundColor: 'rgba(42, 42, 46, 0.95)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: '1001',
          fontFamily: "'Porsche Next TT', Arial, sans-serif"
        });

        this.controlsContainer.innerHTML = `
          <button id="sandbox-play-btn" style="
            width: 40px; height: 40px; border-radius: 50%;
            background: #d5001c; border: none; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            color: #fff; font-size: 16px;
          " title="Play/Pause">▶</button>
          <div id="sandbox-progress-wrap" style="
            width: 200px; height: 6px; background: rgba(255,255,255,0.2);
            border-radius: 3px; cursor: pointer; position: relative;
          ">
            <div id="sandbox-progress-bar" style="
              width: 0%; height: 100%; background: #d5001c;
              border-radius: 3px; transition: width 0.1s;
            "></div>
          </div>
          <span id="sandbox-time" style="
            color: rgba(255,255,255,0.7); font-size: 12px; min-width: 80px;
          ">0:00 / 0:00</span>
          <button id="sandbox-cc-btn" style="
            padding: 6px 10px; border-radius: 4px;
            background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
            cursor: pointer; color: #fff; font-size: 12px;
          " title="Toggle Captions">CC</button>
        `;

        document.body.appendChild(this.controlsContainer);
      }
    },

    /**
     * Load audio, captions, and animation cues for the current slide
     */
    loadAssets: async function () {
      const slideId = this.currentSlideId;
      const basePath = this.options.basePath;

      // Load VO audio
      const voPath = `${basePath}audio/vo/${slideId}.mp3`;
      this.voAudio.src = voPath;
      this.voAudio.preload = 'auto';

      // Load captions (VTT)
      const captionPath = `${basePath}captions/${slideId}.vtt`;
      try {
        const response = await fetch(captionPath);
        if (response.ok) {
          const vttText = await response.text();
          this.captions = this.parseVTT(vttText);
          console.log(`[SandboxRuntime] Loaded ${this.captions.length} caption cues`);
        } else {
          console.warn(`[SandboxRuntime] Caption file not found: ${captionPath} (${response.status})`);
        }
      } catch (e) {
        console.error(`[SandboxRuntime] Failed to load captions from ${captionPath}`);
        console.error(`[SandboxRuntime] If running locally, start a server: npx serve .`);
        console.error(e);
      }

      // Load animation cues (JSON)
      const cuePath = `${basePath}animation-cues/${slideId}.json`;
      try {
        const response = await fetch(cuePath);
        if (response.ok) {
          this.animationCues = await response.json();
          console.log(`[SandboxRuntime] Loaded ${this.animationCues.length} animation cues`);
        }
      } catch (e) {
        console.log(`[SandboxRuntime] No animation cues found at ${cuePath}`);
      }

      // Autoplay if enabled
      if (this.options.autoplay) {
        this.voAudio.addEventListener('canplaythrough', () => this.play(), { once: true });
      }
    },

    /**
     * Parse VTT file content into cue objects
     */
    parseVTT: function (vttText) {
      const cues = [];
      const lines = vttText.split('\n');
      let i = 0;

      // Skip header
      while (i < lines.length && !lines[i].includes('-->')) {
        i++;
      }

      while (i < lines.length) {
        const line = lines[i].trim();

        if (line.includes('-->')) {
          const [startStr, endStr] = line.split('-->').map(s => s.trim());
          const start = this.parseTimestamp(startStr);
          const end = this.parseTimestamp(endStr);

          // Collect text lines
          i++;
          let text = '';
          while (i < lines.length && lines[i].trim() !== '') {
            text += (text ? ' ' : '') + lines[i].trim();
            i++;
          }

          if (text) {
            cues.push({ start, end, text });
          }
        }
        i++;
      }

      return cues;
    },

    /**
     * Parse VTT timestamp to seconds
     */
    parseTimestamp: function (ts) {
      const parts = ts.split(':');
      if (parts.length === 3) {
        const [h, m, s] = parts;
        return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s.replace(',', '.'));
      } else if (parts.length === 2) {
        const [m, s] = parts;
        return parseInt(m) * 60 + parseFloat(s.replace(',', '.'));
      }
      return parseFloat(ts.replace(',', '.'));
    },

    /**
     * Setup event listeners
     */
    setupEventListeners: function () {
      // Audio time update
      this.voAudio.addEventListener('timeupdate', () => this.onTimeUpdate());
      this.voAudio.addEventListener('ended', () => this.onEnded());
      this.voAudio.addEventListener('loadedmetadata', () => {
        this.updateTimeDisplay();
        this.sendToParent();
      });

      // Listen for messages from parent (toolbar controls)
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'sandbox-control') {
          this.handleParentMessage(e.data);
        }
      });

      // Controls
      if (this.options.showControls) {
        const playBtn = document.getElementById('sandbox-play-btn');
        const progressWrap = document.getElementById('sandbox-progress-wrap');
        const ccBtn = document.getElementById('sandbox-cc-btn');

        playBtn?.addEventListener('click', () => this.togglePlayPause());

        progressWrap?.addEventListener('click', (e) => {
          const rect = progressWrap.getBoundingClientRect();
          const percent = (e.clientX - rect.left) / rect.width;
          this.voAudio.currentTime = percent * this.voAudio.duration;
        });

        ccBtn?.addEventListener('click', () => {
          this.captionsEnabled = !this.captionsEnabled;
          ccBtn.style.background = this.captionsEnabled ? '#d5001c' : 'rgba(255,255,255,0.1)';
          if (!this.captionsEnabled) {
            this.captionContainer.style.display = 'none';
          }
        });

        this.captionsEnabled = true;
      }
    },

    /**
     * Play VO audio
     */
    play: function () {
      this.voAudio.play();
      this.isPlaying = true;
      this.updatePlayButton();
    },

    /**
     * Pause VO audio
     */
    pause: function () {
      this.voAudio.pause();
      this.isPlaying = false;
      this.updatePlayButton();
    },

    /**
     * Toggle play/pause
     */
    togglePlayPause: function () {
      if (this.isPlaying) {
        this.pause();
      } else {
        this.play();
      }
    },

    /**
     * Update play button icon
     */
    updatePlayButton: function () {
      const playBtn = document.getElementById('sandbox-play-btn');
      if (playBtn) {
        playBtn.textContent = this.isPlaying ? '⏸' : '▶';
      }
    },

    /**
     * Handle time update - captions and animation cues
     */
    onTimeUpdate: function () {
      const currentTime = this.voAudio.currentTime;

      // Send update to parent frame
      this.sendToParent();

      // Update progress bar (if local controls shown)
      if (this.voAudio.duration && this.options.showControls) {
        const percent = (currentTime / this.voAudio.duration) * 100;
        const progressBar = document.getElementById('sandbox-progress-bar');
        if (progressBar) {
          progressBar.style.width = `${percent}%`;
        }
      }

      this.updateTimeDisplay();

      // Update captions
      if (this.captionsEnabled) {
        const activeCue = this.captions.find(
          cue => currentTime >= cue.start && currentTime < cue.end
        );

        if (activeCue) {
          this.captionContainer.textContent = activeCue.text;
          this.captionContainer.style.display = 'block';
        } else {
          this.captionContainer.style.display = 'none';
        }
      }

      // Trigger animation cues
      this.animationCues.forEach(cue => {
        if (!cue.triggered && currentTime >= cue.time) {
          cue.triggered = true;
          this.triggerAnimation(cue);
        }
      });
    },

    /**
     * Update time display
     */
    updateTimeDisplay: function () {
      const timeEl = document.getElementById('sandbox-time');
      if (timeEl && this.voAudio.duration) {
        const current = this.formatTime(this.voAudio.currentTime);
        const total = this.formatTime(this.voAudio.duration);
        timeEl.textContent = `${current} / ${total}`;
      }
    },

    /**
     * Format seconds to M:SS
     */
    formatTime: function (seconds) {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    },

    /**
     * Handle audio ended
     */
    onEnded: function () {
      this.isPlaying = false;
      this.updatePlayButton();
      this.sendToParent();
      console.log('[SandboxRuntime] VO ended');
    },

    /**
     * Trigger an animation cue
     */
    triggerAnimation: function (cue) {
      console.log(`[SandboxRuntime] Animation cue: ${cue.target} - ${cue.animation}`);

      const element = document.querySelector(cue.target);
      if (!element) {
        console.warn(`[SandboxRuntime] Target not found: ${cue.target}`);
        return;
      }

      // Use GSAP if available
      if (window.gsap) {
        const animations = {
          fadeIn: { opacity: 1, duration: 0.5 },
          fadeOut: { opacity: 0, duration: 0.5 },
          slideUp: { y: 0, opacity: 1, duration: 0.5 },
          slideDown: { y: 20, opacity: 0, duration: 0.5 },
          slideRight: { x: 0, opacity: 1, duration: 0.5 },
          slideLeft: { x: -30, opacity: 0, duration: 0.5 },
          scaleIn: { scale: 1, opacity: 1, duration: 0.3 },
          highlight: {
            keyframes: [
              { boxShadow: '0 0 0 4px rgba(213, 0, 28, 0.5)', duration: 0.2 },
              { boxShadow: '0 0 0 0px rgba(213, 0, 28, 0)', duration: 0.3, delay: 0.5 }
            ]
          }
        };

        const animConfig = animations[cue.animation] || cue.animation;
        gsap.to(element, animConfig);
      } else {
        // Fallback: add CSS class
        element.classList.add(`animate-${cue.animation}`);
      }
    },

    /**
     * Play an interaction audio clip
     * @param {string} clipId - e.g., "technical-expertise" or full filename
     */
    playInteractionClip: function (clipId) {
      const basePath = this.options.basePath;
      const slideId = this.currentSlideId;

      // Try slide-specific clip first, then generic
      let clipPath = `${basePath}audio/interaction/${slideId}-${clipId}.mp3`;

      this.interactionAudio.src = clipPath;
      this.interactionAudio.play().catch(() => {
        // Try without slide prefix
        clipPath = `${basePath}audio/interaction/${clipId}.mp3`;
        this.interactionAudio.src = clipPath;
        this.interactionAudio.play().catch(e => {
          console.warn(`[SandboxRuntime] Could not play interaction clip: ${clipId}`, e);
        });
      });
    },

    /**
     * Reset animation cue triggers (for replay)
     */
    reset: function () {
      this.animationCues.forEach(cue => cue.triggered = false);
      this.voAudio.currentTime = 0;
      this.captionContainer.style.display = 'none';
    },

    /**
     * Handle messages from parent frame (toolbar controls)
     */
    handleParentMessage: function (data) {
      switch (data.action) {
        case 'play':
          this.play();
          break;
        case 'pause':
          this.pause();
          break;
        case 'seek':
          if (data.percent !== undefined && this.voAudio.duration) {
            this.voAudio.currentTime = data.percent * this.voAudio.duration;
          }
          break;
        case 'toggleCaptions':
          this.captionsEnabled = data.enabled !== false;
          if (!this.captionsEnabled) {
            this.captionContainer.style.display = 'none';
          }
          break;
      }
    },

    /**
     * Send audio state to parent frame
     */
    sendToParent: function () {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'sandbox-audio-update',
          currentTime: this.voAudio.currentTime,
          duration: this.voAudio.duration || 0,
          playing: this.isPlaying
        }, '*');
      }
    }
  };

  // Expose globally
  window.SandboxRuntime = SandboxRuntime;

  // Also expose playInteractionClip for easy access from slides
  window.playInteractionClip = function (clipId) {
    SandboxRuntime.playInteractionClip(clipId);
  };

})();
