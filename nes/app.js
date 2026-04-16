(function () {
  "use strict";

  const state = {
    powerOn: false,
    muted: false,
    paused: false,
    romName: "",
    romBinaryString: null,
    nes: null,
    demoMode: false,
    frameHandle: null,
    audioContext: null,
    audioGain: null,
    scriptNode: null,
    audioQueueL: [],
    audioQueueR: [],
    audioReadIndex: 0,
    audioTargetBuffer: 4096,
    audioMaxBuffer: 12288,
    imageData: null,
    frameBuffer32: null,
    gamepadLoopHandle: null,
    crtMode: "on",
    noSignalTick: 0,
    saveSlot: 1,
    currentRomKey: "",
    cartridgeInserted: false,
    emulationAccumulator: 0,
    lastFrameTime: 0,
    frameDurationMs: 1000 / 60,
    maxCatchUpFrames: 6,
    booting: false,
    bootAnimStart: 0,
    bootAnimDuration: 850
  };

  const SCREEN_W = 256;
  const SCREEN_H = 240;
  const FRAME_PIXELS = SCREEN_W * SCREEN_H;

  const BTN = {
    A: jsnes.Controller.BUTTON_A,
    B: jsnes.Controller.BUTTON_B,
    SELECT: jsnes.Controller.BUTTON_SELECT,
    START: jsnes.Controller.BUTTON_START,
    UP: jsnes.Controller.BUTTON_UP,
    DOWN: jsnes.Controller.BUTTON_DOWN,
    LEFT: jsnes.Controller.BUTTON_LEFT,
    RIGHT: jsnes.Controller.BUTTON_RIGHT
  };

  const LOCAL_ART_MAP = {
    "super mario bros": "super-mario-bros.png",
    "super mario bros 2": "super-mario-bros-2.png",
    "super mario bros 3": "super-mario-bros-3.png",
    "the legend of zelda": "the-legend-of-zelda.png",
    "zelda": "the-legend-of-zelda.png",
    "zelda ii the adventure of link": "zelda-ii-the-adventure-of-link.png",
    "mega man": "mega-man.png",
    "mega man 2": "mega-man-2.png",
    "mega man 3": "mega-man-3.png",
    "metroid": "metroid.png",
    "castlevania": "castlevania.png",
    "contra": "contra.png",
    "duck hunt": "duck-hunt.png",
    "excitebike": "excitebike.png",
    "kid icarus": "kid-icarus.png",
    "ninja gaiden": "ninja-gaiden.png",
    "punch out": "punch-out.png",
    "spy_vs_spy": "spy-vs-spy.png",
    "mike tysons punch out": "punch-out.png",
    "tetris": "tetris.png"
  };

  const els = {
    powerBtn: document.getElementById("powerBtn"),
    deckPowerBtn: document.getElementById("deckPowerBtn"),
    muteBtn: document.getElementById("muteBtn"),
    fullscreenBtn: document.getElementById("fullscreenBtn"),
    insertBtn: document.getElementById("insertBtn"),
    ejectBtn: document.getElementById("ejectBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    demoBtn: document.getElementById("demoBtn"),
    deckResetBtn: document.getElementById("deckResetBtn"),
    romInput: document.getElementById("romInput"),
    stickerInput: document.getElementById("stickerInput"),
    cartStickerImg: document.getElementById("cartStickerImg"),
    cartStickerPlaceholder: document.getElementById("cartStickerPlaceholder"),
    cartTitle: document.getElementById("cartTitle"),
    cartLabel: document.getElementById("cartLabel"),
    modeLabel: document.getElementById("modeLabel"),
    stateLabel: document.getElementById("stateLabel"),
    rendererLabel: document.getElementById("rendererLabel"),
    tvModeLabel: document.getElementById("tvModeLabel"),
    cartStickerImgPreview: document.getElementById("cartStickerImgPreview"),
    cartStickerPlaceholderPreview: document.getElementById("cartStickerPlaceholderPreview"),
    cartTitlePreview: document.getElementById("cartTitlePreview"),
    soundStatus: document.getElementById("soundStatus"),
    audioLabel: document.getElementById("audioLabel"),
    screenMessage: document.getElementById("screenMessage"),
    powerLed: document.getElementById("powerLed"),
    tvStatus: document.getElementById("tvStatus")
  };

  if (!document.getElementById("tvCanvas")) {
    console.error("Missing #tvCanvas element.");
    return;
  }

  const tvCanvas = document.getElementById("tvCanvas");
  tvCanvas.width = SCREEN_W;
  tvCanvas.height = SCREEN_H;

  const ctx = tvCanvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const nesConsoleImg = document.getElementById("nesConsoleImg");
  const powerHotspot = document.getElementById("powerHotspot");
  const resetHotspot = document.getElementById("resetHotspot");

  function safeText(name) {
    return String(name || "").replace(/\.[^.]+$/, "");
  }

  function getCleanGameName(name) {
    return String(name || "")
      .replace(/\.[^.]+$/, "")
      .replace(/\(.*?\)/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function slugifyGameName(name) {
    return getCleanGameName(name)
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/'/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function getRomStorageKey() {
    const base = state.romName ? slugifyGameName(state.romName) : "unknown-rom";
    return "rafftech-nes-" + base;
  }

  function getSaveStateKey(slot = 1) {
    return getRomStorageKey() + "-savestate-" + slot;
  }

  function getBatteryKey() {
    return getRomStorageKey() + "-battery";
  }

  function uint8ToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToUint8(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function saveStateToLocal(slot = 1) {
    if (!state.nes) {
      showMessage("No game running to save.", false);
      return;
    }

    try {
      const snapshot = state.nes.toJSON();
      localStorage.setItem(getSaveStateKey(slot), JSON.stringify(snapshot));
      showMessage("Saved state to slot <b>" + slot + "</b>.", false);
    } catch (e) {
      console.error(e);
      showMessage("Could not save state.", true);
    }
  }

  function loadStateFromLocal(slot = 1) {
    if (!state.nes) {
      showMessage("Start a game before loading a state.", false);
      return;
    }

    try {
      const raw = localStorage.getItem(getSaveStateKey(slot));
      if (!raw) {
        showMessage("No saved state found in slot <b>" + slot + "</b>.", false);
        return;
      }

      const snapshot = JSON.parse(raw);
      state.nes.fromJSON(snapshot);
      showMessage("Loaded state from slot <b>" + slot + "</b>.", false);
    } catch (e) {
      console.error(e);
      showMessage("Could not load state.", true);
    }
  }

  function saveBatteryRamToLocal(data) {
    try {
      let bytes = data;
      if (!(bytes instanceof Uint8Array)) {
        bytes = new Uint8Array(data);
      }
      localStorage.setItem(getBatteryKey(), uint8ToBase64(bytes));
    } catch (e) {
      console.warn("Battery save failed:", e);
    }
  }

  function loadBatteryRamFromLocal() {
    try {
      const raw = localStorage.getItem(getBatteryKey());
      if (!raw) return null;
      return base64ToUint8(raw);
    } catch (e) {
      console.warn("Battery load failed:", e);
      return null;
    }
  }

  function setDefaultCartridgeArt() {
    if (els.cartStickerImg) {
      els.cartStickerImg.style.display = "none";
      els.cartStickerImg.removeAttribute("src");
    }
    if (els.cartStickerPlaceholder) {
      els.cartStickerPlaceholder.style.display = "flex";
    }

    if (els.cartStickerImgPreview) {
      els.cartStickerImgPreview.style.display = "none";
      els.cartStickerImgPreview.removeAttribute("src");
    }
    if (els.cartStickerPlaceholderPreview) {
      els.cartStickerPlaceholderPreview.style.display = "flex";
    }
    if (els.cartTitlePreview) {
      els.cartTitlePreview.textContent = "NO CART";
    }
  }

  function applyCartridgeArtFromPath(path) {
    const img = new Image();

    img.onload = () => {
      if (els.cartStickerImg) {
        els.cartStickerImg.src = path;
        els.cartStickerImg.style.display = "block";
      }
      if (els.cartStickerPlaceholder) {
        els.cartStickerPlaceholder.style.display = "none";
      }

      if (els.cartStickerImgPreview) {
        els.cartStickerImgPreview.src = path;
        els.cartStickerImgPreview.style.display = "block";
      }
      if (els.cartStickerPlaceholderPreview) {
        els.cartStickerPlaceholderPreview.style.display = "none";
      }
    };

    img.onerror = () => {
      const fallback = new Image();

      fallback.onload = () => {
        if (els.cartStickerImg) {
          els.cartStickerImg.src = "art/default.png";
          els.cartStickerImg.style.display = "block";
        }
        if (els.cartStickerPlaceholder) {
          els.cartStickerPlaceholder.style.display = "none";
        }

        if (els.cartStickerImgPreview) {
          els.cartStickerImgPreview.src = "art/default.png";
          els.cartStickerImgPreview.style.display = "block";
        }
        if (els.cartStickerPlaceholderPreview) {
          els.cartStickerPlaceholderPreview.style.display = "none";
        }
      };

      fallback.onerror = () => {
        setDefaultCartridgeArt();
      };

      fallback.src = "art/default.png";
    };

    img.src = path;
  }

  function loadLocalCartridgeArt(gameName) {
    const clean = getCleanGameName(gameName).toLowerCase();
    const mappedFile = LOCAL_ART_MAP[clean];

    if (mappedFile) {
      applyCartridgeArtFromPath("art/" + mappedFile);
      return;
    }

    const slug = slugifyGameName(gameName);
    applyCartridgeArtFromPath("art/" + slug + ".png");
  }

  function showMessage(text, sticky = false) {
    if (!els.screenMessage) return;

    els.screenMessage.innerHTML = text;
    els.screenMessage.classList.remove("hidden");

    if (!sticky) {
      clearTimeout(showMessage._timer);
      showMessage._timer = setTimeout(() => {
        if (state.powerOn && (state.romBinaryString || state.demoMode)) {
          els.screenMessage.classList.add("hidden");
        }
      }, 1800);
    }
  }

  function applyCrtMode() {
    document.body.classList.remove("crt-off", "crt-on", "crt-strong");

    if (state.crtMode === "off") {
      document.body.classList.add("crt-off");
    } else if (state.crtMode === "strong") {
      document.body.classList.add("crt-strong");
    } else {
      document.body.classList.add("crt-on");
    }
  }

  function cycleCrtMode() {
    if (state.crtMode === "on") {
      state.crtMode = "strong";
    } else if (state.crtMode === "strong") {
      state.crtMode = "off";
    } else {
      state.crtMode = "on";
    }

    applyCrtMode();
    updateUi();
    showMessage("CRT mode: <b>" + state.crtMode.toUpperCase() + "</b>", false);
  }

  function setCartClass(className) {
    const cart = document.getElementById("cartridge");
    if (!cart) return;
    cart.classList.remove("cart-out", "cart-inserting", "cart-in", "cart-ejecting");
    cart.classList.add(className);
  }

  function setSlotActive(active) {
    document.body.classList.toggle("slot-active", !!active);
  }

  function updateConsoleImage() {
    if (!nesConsoleImg) return;

    const cart = document.getElementById("cartridge");

    if (!state.romBinaryString) {
      nesConsoleImg.src = "nes/images/nes_off.png?v=" + Date.now();
      if (cart) cart.style.display = "none";
      return;
    }

    if (!state.cartridgeInserted) {
      nesConsoleImg.src = "nes/images/nes_open.png?v=" + Date.now();
      if (cart) {
        cart.style.display = "block";
        setCartClass("cart-out");
      }
      return;
    }

    if (state.cartridgeInserted && state.powerOn) {
      nesConsoleImg.src = "nes/images/nes_on.png?v=" + Date.now();
      if (cart) cart.style.display = "none";
      return;
    }

    nesConsoleImg.src = "nes/images/nes_open.png?v=" + Date.now();
    if (cart) {
      cart.style.display = "block";
      setCartClass("cart-in");
    }
  }

  async function animateInsertSequence() {
    if (!state.romBinaryString) {
      showMessage("No ROM loaded yet. Use <b>Load ROM</b> first.", true);
      return false;
    }

    setSlotActive(true);
    setCartClass("cart-inserting");

    await new Promise(resolve => setTimeout(resolve, 240));

    setCartClass("cart-in");

    await new Promise(resolve => setTimeout(resolve, 180));

    return true;
  }

  async function animateEjectSequence() {
    setCartClass("cart-ejecting");

    await new Promise(resolve => setTimeout(resolve, 180));

    setCartClass("cart-out");
    setSlotActive(false);
  }

  function updateUi() {
    if (els.cartTitle) {
      els.cartTitle.textContent = state.romName
        ? safeText(state.romName).slice(0, 18).toUpperCase()
        : "NO CART";
    }

    if (els.cartTitlePreview) {
      els.cartTitlePreview.textContent = state.romName
        ? safeText(state.romName).slice(0, 18).toUpperCase()
        : "NO CART";
    }

    if (els.cartLabel) {
      els.cartLabel.textContent = state.romName || "None";
    }

    if (els.modeLabel) {
      let baseMode;
      if (state.demoMode) {
        baseMode = "Demo Screen";
      } else if (state.romBinaryString && !state.cartridgeInserted) {
        baseMode = "ROM Ready";
      } else if (state.romBinaryString && state.cartridgeInserted && state.powerOn) {
        baseMode = "Game Loaded";
      } else if (state.powerOn) {
        baseMode = "No Signal";
      } else {
        baseMode = "Idle";
      }

      els.modeLabel.textContent = baseMode + " • CRT " + state.crtMode.toUpperCase();
    }

    if (els.stateLabel) {
      els.stateLabel.textContent = state.powerOn ? "On" : "Off";
    }

    if (els.tvModeLabel) {
      let tvState;
      if (!state.powerOn) {
        tvState = "Standby";
      } else if (state.demoMode) {
        tvState = "Demo";
      } else if (state.romBinaryString && state.cartridgeInserted) {
        tvState = "Game Ready";
      } else {
        tvState = "No Signal";
      }

      els.tvModeLabel.textContent = tvState + " • CRT " + state.crtMode.toUpperCase();
    }

    if (els.tvStatus) {
      els.tvStatus.textContent = state.powerOn ? "ON" : "OFF";
    }

    if (els.powerLed) {
      els.powerLed.classList.toggle("on", state.powerOn);
    }

    if (els.audioLabel) {
      els.audioLabel.textContent = state.powerOn
        ? (state.muted ? "Muted" : (state.audioContext ? "Unlocked" : "Locked"))
        : "Locked";
    }

    if (els.soundStatus) {
      els.soundStatus.textContent = state.powerOn
        ? (state.muted ? "Muted" : (state.audioContext ? "Live" : "Locked"))
        : "Muted/Locked";
    }

    if (els.muteBtn) {
      els.muteBtn.textContent = state.muted ? "Unmute" : "Mute";
    }

    if (els.rendererLabel) {
      els.rendererLabel.textContent = "Canvas 2D • CRT " + state.crtMode.toUpperCase();
    }

    const crtBtn = document.getElementById("crtBtn");
    if (crtBtn) {
      crtBtn.textContent = "CRT: " + state.crtMode.toUpperCase();
    }
  }

  function clearCanvas() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  }

  function initVideoBuffers() {
    state.imageData = ctx.createImageData(SCREEN_W, SCREEN_H);
    state.frameBuffer32 = new Uint32Array(state.imageData.data.buffer);
  }

  function initAudio() {
    if (state.audioContext) return state.audioContext;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      console.warn("Web Audio not supported.");
      return null;
    }

    state.audioContext = new AudioCtx();
    state.audioGain = state.audioContext.createGain();
    state.audioGain.gain.value = state.muted ? 0 : 0.7;
    state.audioGain.connect(state.audioContext.destination);

    state.scriptNode = state.audioContext.createScriptProcessor(4096, 0, 2);
    state.scriptNode.onaudioprocess = function (e) {
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);

      for (let i = 0; i < outL.length; i++) {
        if (state.audioReadIndex < state.audioQueueL.length) {
          outL[i] = state.audioQueueL[state.audioReadIndex];
          outR[i] = state.audioQueueR[state.audioReadIndex];
          state.audioReadIndex++;
        } else {
          outL[i] = 0;
          outR[i] = 0;
        }
      }

      if (state.audioReadIndex >= 8192) {
        state.audioQueueL.splice(0, state.audioReadIndex);
        state.audioQueueR.splice(0, state.audioReadIndex);
        state.audioReadIndex = 0;
      }
    };
    state.scriptNode.connect(state.audioGain);

    return state.audioContext;
  }

  async function unlockAudio() {
    const ac = initAudio();
    if (ac && ac.state === "suspended") {
      try {
        await ac.resume();
      } catch (e) {
        console.warn("Audio resume failed", e);
      }
    }
    updateUi();
  }

  function applyMuteState() {
    if (state.audioGain) {
      state.audioGain.gain.value = state.muted ? 0 : 0.7;
    }
    updateUi();
  }

  function playInsertClick() {
    if (state.muted) return;

    const ac = initAudio();
    if (!ac) return;

    const now = ac.currentTime;

    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const filter = ac.createBiquadFilter();

      osc.type = "square";
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.035);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1200, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(state.audioGain || ac.destination);

      osc.start(now);
      osc.stop(now + 0.055);
    } catch (e) {
      console.warn("Insert click failed:", e);
    }
  }

  function startBootAnimation() {
    state.booting = true;
    state.bootAnimStart = performance.now();
    state.emulationAccumulator = 0;
  }

  function drawBootFrame(now) {
    const elapsed = now - state.bootAnimStart;
    const progress = Math.max(0, Math.min(1, elapsed / state.bootAnimDuration));

    if (progress >= 1) {
      state.booting = false;
      clearCanvas();
      return;
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    const glowAlpha = Math.max(0, 1 - progress * 1.15);
    const lineY = Math.floor(SCREEN_H / 2);
    const halfWidth = Math.floor((SCREEN_W * progress) / 2);

    if (progress < 0.18) {
      const flash = Math.max(0, 1 - progress / 0.18);
      ctx.fillStyle = "rgba(255,255,255," + (flash * 0.95) + ")";
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }

    ctx.fillStyle = "rgba(80,180,255," + (glowAlpha * 0.18) + ")";
    ctx.fillRect(0, lineY - 18, SCREEN_W, 36);

    ctx.fillStyle = "rgba(255,255,255," + (0.85 * glowAlpha) + ")";
    ctx.fillRect(
      Math.floor(SCREEN_W / 2) - halfWidth,
      lineY - 1,
      Math.max(2, halfWidth * 2),
      2
    );

    if (progress > 0.35) {
      const textAlpha = Math.min(1, (progress - 0.35) / 0.3);
      ctx.fillStyle = "rgba(255,255,255," + (textAlpha * 0.9) + ")";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("SIGNAL LOCK", 86, 132);

      ctx.fillStyle = "rgba(120,220,255," + (textAlpha * 0.85) + ")";
      ctx.font = "10px sans-serif";
      ctx.fillText("CH 3", 116, 148);
    }
  }

  function buildNes() {
    initVideoBuffers();

    state.nes = new jsnes.NES({
      onFrame: function (frameBuffer) {
        const fb32 = state.frameBuffer32;

        for (let i = 0; i < FRAME_PIXELS; i++) {
          fb32[i] = frameBuffer[i] | 0xff000000;
        }

        ctx.putImageData(state.imageData, 0, 0);
      },
      onAudioSample: function (left, right) {
        state.audioQueueL.push(left);
        state.audioQueueR.push(right);

        const unreadSamples = state.audioQueueL.length - state.audioReadIndex;

        if (unreadSamples > state.audioMaxBuffer) {
          const keepStart = Math.max(0, state.audioQueueL.length - state.audioTargetBuffer);
          state.audioQueueL.splice(0, keepStart);
          state.audioQueueR.splice(0, keepStart);
          state.audioReadIndex = 0;
        }
      },
      onBatteryRamWrite: function (data) {
        saveBatteryRamToLocal(data);
      }
    });
  }

  function destroyNes() {
    state.nes = null;
    state.audioQueueL.length = 0;
    state.audioQueueR.length = 0;
    state.audioReadIndex = 0;
    state.emulationAccumulator = 0;
    state.lastFrameTime = 0;
    state.booting = false;
    state.bootAnimStart = 0;
  }

  function stopLoops() {
    if (state.frameHandle) {
      cancelAnimationFrame(state.frameHandle);
      state.frameHandle = null;
    }
    if (state.gamepadLoopHandle) {
      cancelAnimationFrame(state.gamepadLoopHandle);
      state.gamepadLoopHandle = null;
    }
  }

  function drawNoSignalFrame() {
    state.noSignalTick++;

    const imageData = ctx.createImageData(SCREEN_W, SCREEN_H);
    const data = imageData.data;
    const rolling = (state.noSignalTick * 3) % SCREEN_H;

    for (let y = 0; y < SCREEN_H; y++) {
      for (let x = 0; x < SCREEN_W; x++) {
        const i = (y * SCREEN_W + x) * 4;

        let noise = Math.random() * 255;
        const band = ((y + rolling) % 32) < 4 ? 35 : 0;
        const grain = Math.max(0, Math.min(255, noise + band - 10));

        data[i] = grain;
        data[i + 1] = grain;
        data[i + 2] = grain;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, (rolling * 1.3) % SCREEN_H);
    ctx.lineTo(SCREEN_W, ((rolling * 1.3) % SCREEN_H) + 1);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("NO SIGNAL", 76, 120);

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "10px sans-serif";
    ctx.fillText("Insert cartridge", 94, 138);
  }

  function startFrameLoop() {
    stopLoops();
    state.lastFrameTime = performance.now();
    state.emulationAccumulator = 0;

    function frame(now) {
      const delta = now - state.lastFrameTime;
      state.lastFrameTime = now;

      if (!state.powerOn || state.paused) {
        state.frameHandle = requestAnimationFrame(frame);
        return;
      }

      if (state.demoMode) {
        drawDemoFrame();
        state.frameHandle = requestAnimationFrame(frame);
        return;
      }

      if (state.booting) {
        drawBootFrame(now);
        state.frameHandle = requestAnimationFrame(frame);
        return;
      }

      if (state.nes && state.romBinaryString) {
        state.emulationAccumulator += Math.min(delta, 100);

        let framesRun = 0;
        while (
          state.emulationAccumulator >= state.frameDurationMs &&
          framesRun < state.maxCatchUpFrames
        ) {
          try {
            state.nes.frame();
          } catch (e) {
            console.error(e);
            showMessage("ROM crashed or could not continue.", true);
            break;
          }

          state.emulationAccumulator -= state.frameDurationMs;
          framesRun++;
        }
      } else {
        drawNoSignalFrame();
      }

      state.frameHandle = requestAnimationFrame(frame);
    }

    function pollGamepad() {
      handleGamepad();
      state.gamepadLoopHandle = requestAnimationFrame(pollGamepad);
    }

    state.frameHandle = requestAnimationFrame(frame);
    state.gamepadLoopHandle = requestAnimationFrame(pollGamepad);
  }

  let demoTick = 0;
  function drawDemoFrame() {
    demoTick++;
    ctx.fillStyle = "#060b12";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    for (let i = 0; i < 18; i++) {
      const x = ((i * 17 + demoTick * 1.6) % 290) - 20;
      const y = 30 + (i % 6) * 28;
      ctx.fillStyle = `hsl(${(i * 30 + demoTick) % 360} 88% 60%)`;
      ctx.fillRect(x, y, 14, 14);
    }

    ctx.fillStyle = "#9fd0ff";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("RAFFTECH DEMO", 52, 120);
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px sans-serif";
    ctx.fillText("Load a .nes file to play", 60, 145);
    ctx.fillText("Keyboard + Gamepad Ready", 47, 165);
  }

  function setPower(on) {
    state.powerOn = on;
    state.paused = false;

    if (!on) {
      state.demoMode = false;
      releaseAllInputs();
      destroyNes();
      clearCanvas();
      setCartClass("cart-out");
      setSlotActive(false);
      showMessage("System off. Press <b>Power</b> to start.", true);
    } else {
      clearCanvas();
      if (state.romBinaryString && state.cartridgeInserted) {
        setCartClass("cart-in");
        setSlotActive(true);
      } else {
        setCartClass("cart-out");
        setSlotActive(false);
      }
      state.audioQueueL.length = 0;
      state.audioQueueR.length = 0;
      state.audioReadIndex = 0;
      state.emulationAccumulator = 0;
      state.lastFrameTime = performance.now();
      showMessage("No channel. Insert a <code>.nes</code> cartridge and click <b>Insert</b>.", true);
      unlockAudio();
    }

    updateConsoleImage();
    updateUi();
  }

  function binaryStringFromArrayBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;

    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }

    return binary;
  }

  async function insertCurrentRom() {
    if (!state.romBinaryString) {
      showMessage("No ROM loaded yet. Use <b>Load ROM</b> first.", true);
      return;
    }

    const ok = await animateInsertSequence();
    if (!ok) return;

    state.cartridgeInserted = true;

    if (!state.powerOn) {
      setPower(true);
    }

    await unlockAudio();
    playInsertClick();

    state.demoMode = false;
    destroyNes();
    buildNes();
    state.emulationAccumulator = 0;
    state.lastFrameTime = performance.now();

    try {
      state.currentRomKey = getRomStorageKey();
      state.audioQueueL.length = 0;
      state.audioQueueR.length = 0;
      state.audioReadIndex = 0;

      for (let i = 0; i < 1024; i++) {
        state.audioQueueL.push(0);
        state.audioQueueR.push(0);
      }

      state.nes.loadROM(state.romBinaryString);

      const battery = loadBatteryRamFromLocal();
      if (battery && state.nes.mmap && typeof state.nes.mmap.loadBatteryRam === "function") {
        state.nes.mmap.loadBatteryRam(battery);
      }

      startBootAnimation();
      showMessage("Loaded <b>" + safeText(state.romName) + "</b>.", false);
      applyMuteState();
      updateConsoleImage();
      updateUi();
    } catch (e) {
      console.error(e);
      showMessage("Could not load this ROM. Make sure it is a valid <code>.nes</code> file.", true);
    }
  }

  async function ejectRom() {
    if (!state.romBinaryString && !state.romName) {
      setCartClass("cart-out");
      setSlotActive(false);
      showMessage("No cartridge inserted.", false);
      return;
    }

    await animateEjectSequence();

    state.romBinaryString = null;
    state.romName = "";
    state.currentRomKey = "";
    state.demoMode = false;
    state.cartridgeInserted = false;
    releaseAllInputs();
    destroyNes();
    setDefaultCartridgeArt();
    showMessage("Cartridge ejected. No signal.", true);
    updateConsoleImage();
    updateUi();
  }

  function resetCurrent() {
    if (!state.powerOn) return;

    releaseAllInputs();

    if (state.romBinaryString) {
      insertCurrentRom();
    } else if (state.demoMode) {
      showMessage("Demo reset.", false);
    } else {
      showMessage("No signal. Insert a cartridge.", false);
    }
  }

  function loadDemoScreen() {
    if (!state.powerOn) setPower(true);
    state.demoMode = true;
    destroyNes();
    setSlotActive(false);
    showMessage("Demo screen loaded.", false);
    updateUi();
  }

  function buttonFromKey(key) {
    switch (key) {
      case "ArrowUp":
      case "w":
      case "W":
        return BTN.UP;
      case "ArrowDown":
      case "s":
      case "S":
        return BTN.DOWN;
      case "ArrowLeft":
      case "a":
      case "A":
        return BTN.LEFT;
      case "ArrowRight":
      case "d":
      case "D":
        return BTN.RIGHT;
      case "z":
      case "Z":
        return BTN.B;
      case "x":
      case "X":
        return BTN.A;
      case "Enter":
        return BTN.START;
      case "Shift":
      case "ShiftRight":
        return BTN.SELECT;
      case "c":
      case "C":
        cycleCrtMode();
        return null;
      case "F5":
        saveStateToLocal(1);
        return null;
      case "F8":
        loadStateFromLocal(1);
        return null;
      default:
        return null;
    }
  }

  function handleKeyDown(e) {
    const button = buttonFromKey(e.key);

    if (e.key === "c" || e.key === "C" || e.key === "F5" || e.key === "F8") {
      e.preventDefault();
      return;
    }

    if (e.repeat) {
      e.preventDefault();
      return;
    }

    if (button == null || !state.nes) return;
    e.preventDefault();
    state.nes.buttonDown(1, button);
  }

  function handleKeyUp(e) {
    const button = buttonFromKey(e.key);

    if (e.key === "c" || e.key === "C" || e.key === "F5" || e.key === "F8") {
      e.preventDefault();
      return;
    }

    if (button == null || !state.nes) return;
    e.preventDefault();
    state.nes.buttonUp(1, button);
  }

  function releaseAllInputs() {
    if (!state.nes) return;

    const buttons = [
      BTN.A,
      BTN.B,
      BTN.SELECT,
      BTN.START,
      BTN.UP,
      BTN.DOWN,
      BTN.LEFT,
      BTN.RIGHT
    ];

    buttons.forEach((button) => {
      try {
        state.nes.buttonUp(1, button);
      } catch (e) {}
    });

    Object.keys(gamepadPressed).forEach((key) => {
      gamepadPressed[key] = false;
    });
  }

  function setupOnScreenControls() {
    function pressKey(key) {
      if (!state.nes) return;
      const button = buttonFromKey(key);
      if (button == null) return;
      state.nes.buttonDown(1, button);
    }

    function releaseKey(key) {
      if (!state.nes) return;
      const button = buttonFromKey(key);
      if (button == null) return;
      state.nes.buttonUp(1, button);
    }

    document.querySelectorAll("[data-key]").forEach((btn) => {
      const key = btn.getAttribute("data-key");

      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add("pressed");
        pressKey(key);
      };

      const up = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove("pressed");
        releaseKey(key);
      };

      btn.addEventListener("mousedown", down);
      btn.addEventListener("mouseup", up);
      btn.addEventListener("mouseleave", up);

      btn.addEventListener("touchstart", down, { passive: false });
      btn.addEventListener("touchend", up, { passive: false });
      btn.addEventListener("touchcancel", up, { passive: false });

      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("pointerleave", up);
    });
  }

  const gamepadPressed = {};
  function setPadButton(button, isDown) {
    if (!state.nes) return;
    const key = String(button);

    if (isDown && !gamepadPressed[key]) {
      gamepadPressed[key] = true;
      state.nes.buttonDown(1, button);
    } else if (!isDown && gamepadPressed[key]) {
      gamepadPressed[key] = false;
      state.nes.buttonUp(1, button);
    }
  }

  function handleGamepad() {
    if (!state.nes) return;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && pads[0];
    if (!pad) return;

    setPadButton(BTN.A, !!(pad.buttons[1] && pad.buttons[1].pressed) || !!(pad.buttons[0] && pad.buttons[0].pressed));
    setPadButton(BTN.B, !!(pad.buttons[2] && pad.buttons[2].pressed));
    setPadButton(BTN.SELECT, !!(pad.buttons[8] && pad.buttons[8].pressed));
    setPadButton(BTN.START, !!(pad.buttons[9] && pad.buttons[9].pressed));

    const axisX = pad.axes[0] || 0;
    const axisY = pad.axes[1] || 0;

    setPadButton(BTN.LEFT, (pad.buttons[14] && pad.buttons[14].pressed) || axisX < -0.5);
    setPadButton(BTN.RIGHT, (pad.buttons[15] && pad.buttons[15].pressed) || axisX > 0.5);
    setPadButton(BTN.UP, (pad.buttons[12] && pad.buttons[12].pressed) || axisY < -0.5);
    setPadButton(BTN.DOWN, (pad.buttons[13] && pad.buttons[13].pressed) || axisY > 0.5);
  }

  function setupFiles() {
    if (els.stickerInput) {
      els.stickerInput.addEventListener("change", function (e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        if (els.cartStickerImg) {
          els.cartStickerImg.src = url;
          els.cartStickerImg.style.display = "block";
        }
        if (els.cartStickerPlaceholder) {
          els.cartStickerPlaceholder.style.display = "none";
        }

        if (els.cartStickerImgPreview) {
          els.cartStickerImgPreview.src = url;
          els.cartStickerImgPreview.style.display = "block";
        }
        if (els.cartStickerPlaceholderPreview) {
          els.cartStickerPlaceholderPreview.style.display = "none";
        }
      });
    }

    if (els.romInput) {
      els.romInput.addEventListener("change", function (e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        state.romName = file.name;
        loadLocalCartridgeArt(file.name);

        const reader = new FileReader();
        reader.onload = function () {
          state.romBinaryString = binaryStringFromArrayBuffer(reader.result);
          state.currentRomKey = getRomStorageKey();
          state.cartridgeInserted = false;
          setCartClass("cart-out");
          setSlotActive(false);
          updateConsoleImage();
          showMessage("ROM ready: <b>" + safeText(file.name) + "</b>. Click <b>Insert</b>.", true);
          updateUi();
        };
        reader.onerror = function () {
          showMessage("Could not read ROM file.", true);
        };
        reader.readAsArrayBuffer(file);
      });
    }
  }

  function ensureCrtButton() {
    if (document.getElementById("crtBtn")) return;

    const parent =
      document.getElementById("consoleControls") ||
      document.querySelector(".topActions") ||
      document.querySelector(".buttonGrid");

    if (!parent) return;

    const btn = document.createElement("button");
    btn.id = "crtBtn";
    btn.type = "button";
    btn.className = parent.classList.contains("topActions") ? "tiny-btn" : "deck-btn";
    btn.textContent = "CRT: " + state.crtMode.toUpperCase();
    parent.appendChild(btn);
  }

  function ensureSaveButtons() {
    if (document.getElementById("saveBtn") || document.getElementById("loadBtn")) return;

    const parent =
      document.getElementById("consoleControls") ||
      document.querySelector(".topActions") ||
      document.querySelector(".buttonGrid");

    if (!parent) return;

    const saveBtn = document.createElement("button");
    saveBtn.id = "saveBtn";
    saveBtn.type = "button";
    saveBtn.className = parent.classList.contains("topActions") ? "tiny-btn" : "deck-btn";
    saveBtn.textContent = "Save";

    const loadBtn = document.createElement("button");
    loadBtn.id = "loadBtn";
    loadBtn.type = "button";
    loadBtn.className = parent.classList.contains("topActions") ? "tiny-btn" : "deck-btn";
    loadBtn.textContent = "Load";

    parent.appendChild(saveBtn);
    parent.appendChild(loadBtn);
  }

  function setupButtons() {
    const powerHandler = async () => {
      setPower(!state.powerOn);
      if (state.powerOn) await unlockAudio();
    };

    if (els.powerBtn) {
      els.powerBtn.addEventListener("click", powerHandler);
    }

    if (els.deckPowerBtn) {
      els.deckPowerBtn.addEventListener("click", powerHandler);
    }

    if (els.insertBtn) {
      els.insertBtn.addEventListener("click", insertCurrentRom);
    }

    if (els.ejectBtn) {
      els.ejectBtn.addEventListener("click", ejectRom);
    }

    if (els.muteBtn) {
      els.muteBtn.addEventListener("click", async () => {
        if (!state.powerOn) {
          setPower(true);
        }
        await unlockAudio();
        state.muted = !state.muted;
        applyMuteState();
      });
    }

    if (els.fullscreenBtn) {
      els.fullscreenBtn.addEventListener("click", async () => {
        const target = document.getElementById("nesViewport") || document.getElementById("tvShell");
        if (!target) return;

        try {
          if (!document.fullscreenElement) {
            await target.requestFullscreen();
            document.body.classList.add("tv-fullscreen");
          } else {
            await document.exitFullscreen();
            document.body.classList.remove("tv-fullscreen");
          }
        } catch (e) {
          console.warn("Fullscreen failed:", e);
        }
      });
    }

    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) {
        document.body.classList.remove("tv-fullscreen");
      }
    });

    if (els.pauseBtn) {
      els.pauseBtn.addEventListener("click", async () => {
        if (!state.powerOn) return;
        state.paused = !state.paused;

        if (state.audioContext) {
          try {
            if (state.paused && state.audioContext.state === "running") {
              await state.audioContext.suspend();
            } else if (!state.paused && state.audioContext.state === "suspended") {
              await state.audioContext.resume();
            }
          } catch (e) {
            console.warn(e);
          }
        }

        showMessage(state.paused ? "Paused." : "Resumed.", false);
        updateUi();
      });
    }

    if (els.demoBtn) {
      els.demoBtn.addEventListener("click", loadDemoScreen);
    }

    if (els.deckResetBtn) {
      els.deckResetBtn.addEventListener("click", resetCurrent);
    }

    const crtBtn = document.getElementById("crtBtn");
    if (crtBtn) {
      crtBtn.addEventListener("click", cycleCrtMode);
    }

    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => saveStateToLocal(1));
    }

    const loadBtn = document.getElementById("loadBtn");
    if (loadBtn) {
      loadBtn.addEventListener("click", () => loadStateFromLocal(1));
    }

    if (powerHotspot && els.deckPowerBtn) {
      powerHotspot.addEventListener("click", (e) => {
        e.preventDefault();
        els.deckPowerBtn.click();
      });
    }

    if (resetHotspot && els.deckResetBtn) {
      resetHotspot.addEventListener("click", (e) => {
        e.preventDefault();
        els.deckResetBtn.click();
      });
    }
  }

  function init() {
    initVideoBuffers();
    clearCanvas();
    setDefaultCartridgeArt();
    ensureCrtButton();
    ensureSaveButtons();
    applyCrtMode();
    setupButtons();
    setupFiles();
    setupOnScreenControls();
    setCartClass("cart-out");
    setSlotActive(false);

    const cart = document.getElementById("cartridge");
    if (cart) cart.style.display = "none";

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp, { passive: false });
    window.addEventListener("blur", releaseAllInputs);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) releaseAllInputs();
    });
    window.addEventListener("gamepaddisconnected", releaseAllInputs);
    startFrameLoop();
    updateConsoleImage();
    updateUi();
    showMessage("Press <b>Power</b>, then load a <code>.nes</code> file and click <b>Insert</b>. Press <b>C</b> to change CRT mode. <b>F5</b> saves and <b>F8</b> loads.", true);
  }

  init();
})();