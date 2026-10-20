const { useState, useEffect, useRef, useCallback, useMemo } = React;
const TOKEN = window.JOURNEYS_CONFIG.token || "";
const API = window.journeysAPI;
let toastTimer;
function Toast({ msg }) {
  return msg ? /* @__PURE__ */ React.createElement("div", { className: "toast" }, msg) : null;
}
function useToast() {
  const [msg, setMsg] = useState("");
  const show = (m) => {
    setMsg(m);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setMsg(""), 2e3);
  };
  return [msg, show];
}
const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function stopAllJourneyAudio() {
  try {
    if (window.__jAudioCtx && window.__jAudioCtx.state === "running") window.__jAudioCtx.suspend();
  } catch (e) {
  }
  document.querySelectorAll("audio").forEach((a) => {
    try {
      a.pause();
    } catch (e) {
    }
  });
}
function stopMediaEl(s) {
  if (!s) return;
  if (s.el) {
    try {
      s.el.pause();
    } catch (e) {
    }
    try {
      s.el.removeAttribute("src");
      s.el.load();
    } catch (e) {
    }
    try {
      s.el.remove();
    } catch (e) {
    }
  }
  if (s.node) {
    try {
      s.node.disconnect();
    } catch (e) {
    }
  }
  if (s.gain) {
    try {
      s.gain.disconnect();
    } catch (e) {
    }
  }
  s.el = null;
  s.node = null;
  s.gain = null;
}
function MusicPlayer({ song, musicRef }) {
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(0);
  const stateRef = useRef({ el: null, node: null, gain: null });
  const deadRef = useRef(false);
  useEffect(() => {
    setPlaying(false);
    setT(0);
    setDuration(0);
    const s = stateRef.current;
    stopMediaEl(s);
    stateRef.current = { el: null, node: null, gain: null };
    if (musicRef) musicRef.current = null;
    const id = setTimeout(() => setPlaying(true), 0);
    return () => clearTimeout(id);
  }, [song]);
  useEffect(() => {
    const s = stateRef.current;
    if (!playing) {
      if (s.el) {
        try {
          s.el.pause();
        } catch (e) {
        }
      }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!window.__jAudioCtx && AC) window.__jAudioCtx = new AC();
    const ctx = window.__jAudioCtx;
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {
    });
    if (!s.el) {
      const el = document.createElement("audio");
      el.crossOrigin = "anonymous";
      el.src = window.journeyMediaURL(song.url);
      el.addEventListener("loadedmetadata", () => setDuration(Number.isFinite(el.duration) ? el.duration : 0));
      el.loop = true;
      el.preload = "auto";
      el.setAttribute("playsinline", "");
      el.style.display = "none";
      el.addEventListener("error", () => console.warn("music load failed", el.error && el.error.code));
      document.body.appendChild(el);
      s.el = el;
      if (ctx) {
        try {
          if (!s.gain) {
            s.gain = ctx.createGain();
            s.gain.gain.value = 1;
            s.gain.connect(ctx.destination);
          }
          s.node = ctx.createMediaElementSource(el);
          s.node.connect(s.gain);
        } catch (e) {
          console.warn("music media node failed:", e);
          s.node = null;
        }
      }
    }
    if (deadRef.current) return;
    if (musicRef) musicRef.current = { _gain: s.gain };
    const p = s.el.play();
    if (p && p.catch) p.catch((e) => console.warn("music play rejected:", e));
    const id = setInterval(() => {
      if (s.el) setT(s.el.currentTime || 0);
    }, 250);
    return () => clearInterval(id);
  }, [playing]);
  useEffect(() => () => {
    deadRef.current = true;
    stopMediaEl(stateRef.current);
    if (musicRef) musicRef.current = null;
  }, []);
  const hue = song.hue || 32;
  const dur = duration || song.dur || 1;
  const pct = t / dur * 100;
  return /* @__PURE__ */ React.createElement("div", { className: "player" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "player-play",
      onClick: (e) => {
        e.stopPropagation();
        setPlaying((p) => !p);
      },
      style: { background: `oklch(0.62 0.13 ${hue})` }
    },
    playing ? /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "18", height: "18" }, /* @__PURE__ */ React.createElement("rect", { x: "7", y: "5.5", width: "3.4", height: "13", rx: "1", fill: "#fff" }), /* @__PURE__ */ React.createElement("rect", { x: "13.6", y: "5.5", width: "3.4", height: "13", rx: "1", fill: "#fff" })) : /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "18", height: "18", style: { marginLeft: 1 } }, /* @__PURE__ */ React.createElement("path", { d: "M8 5.5v13l11-6.5z", fill: "#fff" }))
  ), /* @__PURE__ */ React.createElement("div", { className: "player-body" }, /* @__PURE__ */ React.createElement("div", { className: "player-meta" }, /* @__PURE__ */ React.createElement("span", { className: "player-title" }, song.title), /* @__PURE__ */ React.createElement("span", { className: "player-artist" }, song.artist), playing && /* @__PURE__ */ React.createElement("span", { className: "eq" }, /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("i", null), /* @__PURE__ */ React.createElement("i", null))), /* @__PURE__ */ React.createElement("div", { className: "player-track", onClick: (e) => {
    const el = stateRef.current.el;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    try {
      el.currentTime = ratio * dur;
    } catch (err) {
      return;
    }
    setT(el.currentTime);
  }, style: { cursor: "pointer" } }, /* @__PURE__ */ React.createElement("div", { className: "player-fill", style: { width: Math.min(pct, 100) + "%", background: `oklch(0.62 0.13 ${hue})` } })), /* @__PURE__ */ React.createElement("div", { className: "player-times" }, /* @__PURE__ */ React.createElement("span", null, fmtDur(t)), /* @__PURE__ */ React.createElement("span", null, fmtDur(dur)))));
}
function splitSentences(s) {
  return (s || "").split(/(?<=[。！？!?…])/).map((x) => x.trim()).filter(Boolean);
}
const NARR_VOICE_CACHE = /* @__PURE__ */ new Map();
function fetchNarrVoice(text) {
  const endpoint = window.JOURNEYS_CONFIG.ttsEndpoint;
  if (!endpoint) return Promise.resolve(null);
  if (NARR_VOICE_CACHE.has(text)) return Promise.resolve(NARR_VOICE_CACHE.get(text));
  return API(endpoint, { method: "POST", body: { text } }).then((d) => {
    const v = d.voice?.audio_data_url ? { url: d.voice.audio_data_url, duration: d.voice.duration || 0 } : null;
    if (v) NARR_VOICE_CACHE.set(text, v);
    return v;
  }).catch(() => null);
}
const NARR_DUCK = 0.35;
const NARR_SILENT = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
function CenteredNarration({ sentences, replayRef, onDone, musicRef }) {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(true);
  const [armed, setArmed] = useState(false);
  const voiceElRef = useRef(null);
  const seqRef = useRef(0);
  useEffect(() => {
    if (!voiceElRef.current) voiceElRef.current = new Audio();
    try {
      voiceElRef.current.src = NARR_SILENT;
      voiceElRef.current.play().catch(() => {
      });
    } catch (e) {
    }
  }, []);
  const duck = () => {
    const a = musicRef && musicRef.current;
    if (a && a._gain) {
      try {
        a._gain.gain.value = NARR_DUCK;
      } catch (e) {
      }
    }
  };
  const unduck = () => {
    const a = musicRef && musicRef.current;
    if (a && a._gain) {
      try {
        a._gain.gain.value = 1;
      } catch (e) {
      }
    }
  };
  const reset = () => {
    seqRef.current++;
    setIdx(0);
    setTyped("");
    setFading(false);
    setDone(false);
    setArmed(true);
  };
  if (replayRef) replayRef.current = reset;
  useEffect(() => {
    seqRef.current++;
    setIdx(0);
    setTyped("");
    setFading(false);
    setDone(true);
    setArmed(false);
  }, [sentences]);
  useEffect(() => {
    if (onDone) onDone(done);
    if (done) unduck();
  }, [done]);
  useEffect(() => () => {
    seqRef.current++;
    unduck();
    if (voiceElRef.current) {
      try {
        voiceElRef.current.pause();
        voiceElRef.current.src = "";
      } catch (e) {
      }
    }
  }, []);
  useEffect(() => {
    if (!armed) return;
    if (!sentences.length) {
      setDone(true);
      return;
    }
    const seq = seqRef.current;
    const s = sentences[idx];
    const last = idx >= sentences.length - 1;
    let timers = [];
    setTyped("");
    setFading(false);
    fetchNarrVoice(s).then((voice) => {
      if (seq !== seqRef.current) return;
      const durMs = voice && voice.duration ? voice.duration * 1e3 : Math.max(1600, s.length * 260);
      if (voice && voice.url && voiceElRef.current) {
        try {
          voiceElRef.current.pause();
        } catch (e) {
        }
        voiceElRef.current.src = voice.url;
        voiceElRef.current.currentTime = 0;
        voiceElRef.current.volume = 1;
        duck();
        voiceElRef.current.play().catch(() => {
        });
      }
      const n = s.length;
      const interval = Math.max(45, durMs * 0.92 / Math.max(1, n));
      let i = 0;
      const type = () => {
        if (seq !== seqRef.current) return;
        i++;
        setTyped(s.slice(0, i));
        if (i < n) timers.push(setTimeout(type, interval));
        else timers.push(setTimeout(() => {
          if (seq !== seqRef.current) return;
          unduck();
          timers.push(setTimeout(() => {
            if (seq !== seqRef.current) return;
            setFading(true);
            timers.push(setTimeout(() => {
              if (seq !== seqRef.current) return;
              if (last) setDone(true);
              else setIdx((v) => v + 1);
            }, 460));
          }, 700));
        }, 0));
      };
      timers.push(setTimeout(type, 60));
    });
    return () => timers.forEach(clearTimeout);
  }, [idx, sentences, armed]);
  if (!sentences.length) return null;
  return /* @__PURE__ */ React.createElement("div", { className: "narr-stage" }, !done && /* @__PURE__ */ React.createElement("p", { className: "narr-line" + (fading ? " out" : "") }, typed, /* @__PURE__ */ React.createElement("span", { className: "narr-cursor" }, "|")));
}
function StoryOverlay({ stops, index, song, onClose, onNav }) {
  const stop = stops[index];
  const theSong = song || stop.song;
  const downX = useRef(null);
  const replayRef = useRef(() => {
  });
  const musicRef = useRef(null);
  const [narrDone, setNarrDone] = useState(true);
  const [noteExpanded, setNoteExpanded] = useState(true);
  const sentences = useMemo(() => splitSentences(stop.note), [stop.note, index]);
  useEffect(() => {
    setNarrDone(true);
    setNoteExpanded(true);
  }, [index]);
  const onDown = (e) => {
    downX.current = e.clientX;
  };
  const onUp = (e) => {
    if (downX.current == null) return;
    const dx = e.clientX - downX.current;
    downX.current = null;
    if (Math.abs(dx) > 40) onNav(dx < 0 ? 1 : -1);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "story-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement(
    "div",
    {
      style: { position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column" },
      onClick: (e) => e.stopPropagation(),
      onPointerDown: onDown,
      onPointerUp: onUp
    },
    /* @__PURE__ */ React.createElement("div", { className: "story-top" }, /* @__PURE__ */ React.createElement("button", { "aria-label": "\u5173\u95ED\u6545\u4E8B", className: "story-close", onClick: onClose }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "20", height: "20" }, /* @__PURE__ */ React.createElement("path", { d: "M6 6l12 12M18 6L6 18", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", fill: "none" })))),
    /* @__PURE__ */ React.createElement("div", { className: "story-photo" }, /* @__PURE__ */ React.createElement("div", { key: index, className: "story-photo-bg", style: { backgroundImage: `url(${stop.src})` } }), /* @__PURE__ */ React.createElement("div", { className: "story-centerscrim" }), /* @__PURE__ */ React.createElement("div", { className: "story-cap" }, /* @__PURE__ */ React.createElement("span", { className: "story-cap-en" }, stop.placeEn), /* @__PURE__ */ React.createElement("button", { className: "story-cap-place", onClick: (e) => {
      e.stopPropagation();
      replayRef.current && replayRef.current();
    } }, stop.place), /* @__PURE__ */ React.createElement("span", { className: "story-cap-date" }, stop.date)), /* @__PURE__ */ React.createElement(CenteredNarration, { key: index, sentences, replayRef, onDone: setNarrDone, musicRef }), narrDone && stop.note && /* @__PURE__ */ React.createElement("div", { className: "story-settled" }, /* @__PURE__ */ React.createElement("p", { className: "story-settled-note" + (noteExpanded ? " expanded" : "") }, stop.note), stop.note.length > 100 && /* @__PURE__ */ React.createElement("button", { className: "story-settled-more", onClick: (e) => {
      e.stopPropagation();
      setNoteExpanded((v) => !v);
    } }, noteExpanded ? "\u6536\u8D77 \u2191" : "\u5C55\u5F00\u5168\u6587 \u2193")), theSong?.url && /* @__PURE__ */ React.createElement("div", { className: "story-foot" }, /* @__PURE__ */ React.createElement(MusicPlayer, { song: theSong, musicRef }))),
    /* @__PURE__ */ React.createElement("div", { className: "story-dots" }, stops.map((_, i) => /* @__PURE__ */ React.createElement("span", { key: i, className: i === index ? "on" : "", onClick: () => onNav(i - index) })))
  ));
}
const { useEffect: useEffectC, useMemo: useMemoC, useRef: useRefC } = React;
function useMV(init) {
  const ref = useRefC(null);
  if (!ref.current) ref.current = { v: init, get() {
    return this.v;
  }, set(n) {
    this.v = n;
  } };
  return ref.current;
}
function hash3(cx, cy, cz, salt) {
  let h = (cx | 0) * 2376512323;
  h ^= Math.imul(cy | 0, 3625334849);
  h ^= Math.imul(cz | 0, 3407524639);
  h ^= salt | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2146121005);
  h ^= h >>> 15;
  h = Math.imul(h, 2221713035);
  h ^= h >>> 16;
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
const PX_PER_UNIT = 6;
const CELL_SIZE = 110;
const MAX_RANGE = 20;
function InfiniteGallery(props) {
  const {
    images,
    density = 5,
    imageWidth = 176,
    imageHeight = 122,
    rounded = 4,
    dragSpeed = 20,
    driftAmount = 10,
    friction = 11,
    backgroundColor = "#14100b",
    initialZoom = 0,
    onTap
  } = props;
  const containerRef = useRefC(null);
  const sceneRef = useRefC(null);
  const safeImages = Array.isArray(images) && images.length > 0 ? images : [];
  const safeDensity = Math.max(1, Math.min(15, Math.floor(density || 5)));
  const safeImageWidth = Math.max(8, Math.min(4e3, imageWidth || 150));
  const safeImageHeight = Math.max(8, Math.min(4e3, imageHeight || 150));
  const safeRounded = Math.max(0, Math.min(20, rounded ?? 3));
  const safeDragSpeed = Math.max(0.1, Math.min(5, (dragSpeed || 20) / 20));
  const safeDriftAmount = Math.max(0, Math.min(20, driftAmount ?? 8));
  const safeFriction = 1 - Math.max(1, Math.min(20, friction ?? 10)) / 20 * 0.3;
  const targetX = useMV(0), targetY = useMV(0);
  const camX = useMV(0), camY = useMV(0);
  const velX = useMV(0), velY = useMV(0);
  const targetLogZoom = useMV(initialZoom), logZoom = useMV(initialZoom), velLogZoom = useMV(0);
  const driftTX = useMV(0), driftTY = useMV(0), driftX = useMV(0), driftY = useMV(0);
  const subN = Math.max(1, Math.ceil(Math.sqrt(safeDensity)));
  const subSize = CELL_SIZE / subN;
  const SUBCELL_INNER_PAD = 0.1;
  const effectivePerCell = Math.min(safeDensity, subN * subN);
  const imagesCount = safeImages.length;
  const SCALE_MIN = 0.5, SCALE_MAX = 1.5;
  const generateCell = useMemoC(() => {
    return (gx, gy, octave) => {
      const seed = hash3(gx, gy, octave | 0, 2654435761);
      const rand = mulberry32(seed);
      const totalSubs = subN * subN;
      const subs = new Array(totalSubs);
      for (let i = 0; i < totalSubs; i++) subs[i] = i;
      for (let i = totalSubs - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = subs[i];
        subs[i] = subs[j];
        subs[j] = tmp;
      }
      const tiles = [];
      const count = Math.min(effectivePerCell, totalSubs);
      const pad = subSize * SUBCELL_INNER_PAD;
      const innerRange = Math.max(0, subSize - pad * 2);
      const cellX0 = gx * CELL_SIZE, cellY0 = gy * CELL_SIZE;
      const wWorld = safeImageWidth / PX_PER_UNIT;
      const hWorld = safeImageHeight / PX_PER_UNIT;
      for (let slot = 0; slot < count; slot++) {
        const subIdx = subs[slot];
        const sx = subIdx % subN, sy = Math.floor(subIdx / subN);
        const wx = cellX0 + sx * subSize + pad + rand() * innerRange;
        const wy = cellY0 + sy * subSize + pad + rand() * innerRange;
        const bakedScale = SCALE_MIN + rand() * (SCALE_MAX - SCALE_MIN);
        const imgIdx = imagesCount > 0 ? Math.floor(rand() * imagesCount) % imagesCount : 0;
        const rot = (rand() - 0.5) * 7;
        tiles.push({ wx, wy, cx: gx, cy: gy, slot, octave, imgIdx, w: wWorld, h: hWorld, rot, bakedScale });
      }
      return tiles;
    };
  }, [safeImages, imagesCount, safeImageWidth, safeImageHeight, subN, subSize, effectivePerCell]);
  useEffectC(() => {
    const scene = sceneRef.current;
    const container = containerRef.current;
    if (!scene) return;
    let cW = container ? container.clientWidth || 900 : 900;
    let cH = container ? container.clientHeight || 600 : 600;
    const ro = new ResizeObserver(() => {
      if (container) {
        cW = container.clientWidth || cW;
        cH = container.clientHeight || cH;
      }
    });
    if (container) ro.observe(container);
    const layerPools = /* @__PURE__ */ new Map();
    const getPool = (octave) => {
      let pool = layerPools.get(octave);
      if (!pool) {
        pool = { tileEls: /* @__PURE__ */ new Map(), imgEls: /* @__PURE__ */ new Map() };
        layerPools.set(octave, pool);
      }
      return pool;
    };
    const disposeLayer = (octave) => {
      const pool = layerPools.get(octave);
      if (!pool) return;
      pool.tileEls.forEach((el) => {
        if (el.parentNode === scene) scene.removeChild(el);
      });
      pool.tileEls.clear();
      pool.imgEls.clear();
      layerPools.delete(octave);
    };
    const disposeAllLayers = () => {
      Array.from(layerPools.keys()).forEach(disposeLayer);
    };
    const removeTile = (octave, key) => {
      const pool = layerPools.get(octave);
      if (!pool) return;
      const el = pool.tileEls.get(key);
      if (el && el.parentNode === scene) scene.removeChild(el);
      pool.tileEls.delete(key);
      pool.imgEls.delete(key);
    };
    const ensureTile = (t) => {
      const pool = getPool(t.octave);
      const key = `${t.cx},${t.cy},${t.slot}`;
      let el = pool.tileEls.get(key);
      if (!el) {
        el = document.createElement("div");
        el.style.position = "absolute";
        el.style.left = "50%";
        el.style.top = "50%";
        el.style.transformOrigin = "0 0";
        el.style.willChange = "transform, opacity";
        el.style.pointerEvents = "none";
        el.style.boxShadow = "0 10px 26px -12px rgba(0,0,0,0.7)";
        el.dataset.tileKey = key;
        const src = safeImages[t.imgIdx];
        el.dataset.journey = src ? src.journeyId : "";
        el.dataset.stop = src ? src.stopIndex : "";
        const img = document.createElement("img");
        img.src = src && src.src || "";
        img.alt = src && src.alt || "";
        img.draggable = false;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.display = "block";
        img.style.pointerEvents = "none";
        img.style.userSelect = "none";
        el.appendChild(img);
        scene.appendChild(el);
        pool.tileEls.set(key, el);
        pool.imgEls.set(key, img);
      }
      return el;
    };
    const projectLayer = (octave, layerScale, layerAlpha, layerZBase, cx, cy) => {
      const pool = getPool(octave);
      const camCellX = Math.floor(cx / CELL_SIZE);
      const camCellY = Math.floor(cy / CELL_SIZE);
      const worldHalfX = cW / 2 / (PX_PER_UNIT * layerScale);
      const worldHalfY = cH / 2 / (PX_PER_UNIT * layerScale);
      const rangeX = Math.min(MAX_RANGE, Math.ceil(worldHalfX / CELL_SIZE) + 1);
      const rangeY = Math.min(MAX_RANGE, Math.ceil(worldHalfY / CELL_SIZE) + 1);
      const visibleKeys = /* @__PURE__ */ new Set();
      const tilesThisFrame = [];
      for (let dy = -rangeY; dy <= rangeY; dy++) {
        for (let dx = -rangeX; dx <= rangeX; dx++) {
          const tiles = generateCell(camCellX + dx, camCellY + dy, octave);
          for (let i = 0; i < tiles.length; i++) tilesThisFrame.push(tiles[i]);
        }
      }
      const orderKeys = new Array(tilesThisFrame.length);
      const orderScale = new Array(tilesThisFrame.length);
      for (let i = 0; i < tilesThisFrame.length; i++) {
        const t = tilesThisFrame[i];
        const key = `${t.cx},${t.cy},${t.slot}`;
        visibleKeys.add(key);
        const dxPx = (t.wx - cx) * layerScale * PX_PER_UNIT;
        const dyPx = (t.wy - cy) * layerScale * PX_PER_UNIT;
        const s = t.bakedScale * layerScale;
        const el = ensureTile(t);
        const img = pool.imgEls.get(key);
        const wPx = t.w * PX_PER_UNIT, hPx = t.h * PX_PER_UNIT;
        el.style.transform = `translate3d(${dxPx}px, ${dyPx}px, 0) scale(${s}) rotate(${t.rot}deg) translate(${-wPx / 2}px, ${-hPx / 2}px)`;
        el.style.width = `${wPx}px`;
        el.style.height = `${hPx}px`;
        el.style.opacity = String(layerAlpha);
        if (img) {
          const radiusPx = safeRounded / 20 * (Math.min(wPx, hPx) / 2);
          img.style.borderRadius = `${radiusPx}px`;
        }
        orderKeys[i] = key;
        orderScale[i] = t.bakedScale;
      }
      for (const key of Array.from(pool.tileEls.keys())) {
        if (!visibleKeys.has(key)) removeTile(octave, key);
      }
      const idxs = orderKeys.map((_, i) => i);
      idxs.sort((a, b) => orderScale[a] - orderScale[b]);
      for (let k = 0; k < idxs.length; k++) {
        const el = pool.tileEls.get(orderKeys[idxs[k]]);
        if (el) el.style.zIndex = String(layerZBase + k);
      }
    };
    let lastOctaves = /* @__PURE__ */ new Set();
    const project = () => {
      const cx = camX.get(), cy = camY.get(), lz = logZoom.get();
      const octave = Math.floor(lz), frac = lz - octave;
      const scaleCurrent = Math.pow(2, frac), scaleNext = Math.pow(2, frac - 1);
      projectLayer(octave, scaleCurrent, 1 - frac, 0, cx, cy);
      projectLayer(octave + 1, scaleNext, frac, 1e5, cx, cy);
      const nowOctaves = /* @__PURE__ */ new Set([octave, octave + 1]);
      for (const o of Array.from(layerPools.keys())) if (!nowOctaves.has(o)) disposeLayer(o);
      lastOctaves = nowOctaves;
    };
    project();
    let raf = 0;
    const loop = () => {
      targetX.set(targetX.get() + velX.get());
      targetY.set(targetY.get() + velY.get());
      velX.set(velX.get() * safeFriction);
      velY.set(velY.get() * safeFriction);
      const vlz = velLogZoom.get();
      if (vlz !== 0) {
        targetLogZoom.set(targetLogZoom.get() + vlz);
        velLogZoom.set(vlz * safeFriction);
      }
      driftX.set(lerp(driftX.get(), driftTX.get() * safeDriftAmount, 0.08));
      driftY.set(lerp(driftY.get(), driftTY.get() * safeDriftAmount, 0.08));
      camX.set(lerp(camX.get(), targetX.get() + driftX.get(), 0.18));
      camY.set(lerp(camY.get(), targetY.get() + driftY.get(), 0.18));
      logZoom.set(lerp(logZoom.get(), targetLogZoom.get(), 0.18));
      project();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      disposeAllLayers();
    };
  }, [generateCell, safeFriction, safeDriftAmount, safeRounded, safeImages]);
  useEffectC(() => {
    const el = containerRef.current;
    if (!el) return;
    let dragging = false, moved = false;
    let lastPX = 0, lastPY = 0, lastT = 0, downX = 0, downY = 0, downT = 0, pid = null;
    const activeTouches = /* @__PURE__ */ new Map();
    let pinchDist = 0;
    const pinchDistance = () => {
      const pts = Array.from(activeTouches.values());
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };
    const onDown = (e) => {
      if (e.pointerType === "touch") {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.size === 2) {
          dragging = false;
          pinchDist = pinchDistance();
          return;
        }
        if (activeTouches.size > 2) return;
      }
      if (e.button !== 0 && e.pointerType === "mouse") return;
      dragging = true;
      moved = false;
      pid = e.pointerId;
      lastPX = downX = e.clientX;
      lastPY = downY = e.clientY;
      lastT = downT = e.timeStamp;
      try {
        el.setPointerCapture(e.pointerId);
      } catch (_) {
      }
      el.style.cursor = "grabbing";
    };
    const onMove = (e) => {
      if (e.pointerType === "touch" && activeTouches.has(e.pointerId)) {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.size === 2) {
          const d = pinchDistance();
          if (pinchDist > 0 && d > 0) {
            const step = (d - pinchDist) * 0.012 * safeDragSpeed;
            targetLogZoom.set(targetLogZoom.get() + step);
          }
          pinchDist = d;
          return;
        }
      }
      const rect = el.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width * 2 - 1;
      const ny = (e.clientY - rect.top) / rect.height * 2 - 1;
      driftTX.set(Math.max(-1, Math.min(1, nx)));
      driftTY.set(Math.max(-1, Math.min(1, ny)));
      if (!dragging || e.pointerId !== pid) return;
      const dpx = e.clientX - lastPX, dpy = e.clientY - lastPY;
      if (Math.abs(e.clientX - downX) > 5 || Math.abs(e.clientY - downY) > 5) moved = true;
      const lz = logZoom.get(), frac = lz - Math.floor(lz);
      const effScale = (1 - frac) * Math.pow(2, frac) + frac * Math.pow(2, frac - 1);
      const dWorldX = -dpx / (PX_PER_UNIT * effScale) * safeDragSpeed;
      const dWorldY = -dpy / (PX_PER_UNIT * effScale) * safeDragSpeed;
      targetX.set(targetX.get() + dWorldX);
      targetY.set(targetY.get() + dWorldY);
      const dt = Math.max(1, e.timeStamp - lastT), k = 16 / dt;
      velX.set(dWorldX * k);
      velY.set(dWorldY * k);
      lastPX = e.clientX;
      lastPY = e.clientY;
      lastT = e.timeStamp;
    };
    const hitTest = (px, py) => {
      const els = el.querySelectorAll("div[data-stop]");
      let best = null, bestZ = -Infinity;
      els.forEach((tileEl) => {
        if (!tileEl.dataset.journey) return;
        const r = tileEl.getBoundingClientRect();
        if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
          const z = parseInt(tileEl.style.zIndex || "0", 10);
          if (z >= bestZ) {
            bestZ = z;
            best = tileEl;
          }
        }
      });
      return best;
    };
    const onUp = (e) => {
      if (e.pointerType === "touch") {
        activeTouches.delete(e.pointerId);
        if (activeTouches.size < 2) pinchDist = 0;
      }
      if (!dragging || e.pointerId !== pid) return;
      dragging = false;
      pid = null;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (_) {
      }
      el.style.cursor = "grab";
      const isTap = !moved && e.timeStamp - downT < 400;
      if (isTap && onTap) {
        const hit = hitTest(e.clientX, e.clientY);
        if (hit) onTap(hit.dataset.journey, parseInt(hit.dataset.stop, 10));
      }
    };
    const onCancel = (e) => onUp(e);
    const onWheel = (e) => {
      e.preventDefault();
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 16;
      else if (e.deltaMode === 2) delta *= 400;
      velLogZoom.set(velLogZoom.get() + -delta * 15e-4 * safeDragSpeed);
    };
    const onLeave = () => {
      driftTX.set(0);
      driftTY.set(0);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerleave", onLeave);
    el.style.cursor = "grab";
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [safeDragSpeed, onTap]);
  return /* @__PURE__ */ React.createElement("div", { ref: containerRef, className: "canvas-wrap", style: { backgroundColor } }, /* @__PURE__ */ React.createElement("div", { ref: sceneRef, style: { position: "absolute", inset: 0 } }));
}
function CanvasApp() {
  const [journeys, setJourneys] = useState(null);
  const [story, setStory] = useState(null);
  const load = useCallback(async () => {
    try {
      const res = await API("/api/journeys");
      setJourneys(res.journeys || []);
    } catch (_) {
      setJourneys([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== location.origin || !e.data) return;
      if (e.data.type === "journeys:refresh") load();
      if (e.data.type === "journeys:stop-audio") {
        setStory(null);
        stopAllJourneyAudio();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [load]);
  const photos = React.useMemo(() => {
    const out = [];
    (journeys || []).forEach((j) => {
      (j.stops || []).filter((s) => s.src).forEach((s, i) => {
        out.push({ src: s.src, journeyId: j.id, stopIndex: i, alt: s.place || "" });
      });
    });
    return out;
  }, [journeys]);
  if (journeys === null) return /* @__PURE__ */ React.createElement("div", { className: "loading" }, "\u52A0\u8F7D\u4E2D\u2026");
  const openTap = (journeyId, stopIndex) => {
    const j = journeys.find((x) => x.id === journeyId);
    if (!j) return;
    const storyStops = (j.stops || []).filter((s) => s.src);
    if (storyStops[stopIndex]) setStory({ stops: storyStops, index: stopIndex, song: j.song || null });
  };
  const storyNav = (d) => setStory((s) => s && { stops: s.stops, index: (s.index + d + s.stops.length) % s.stops.length, song: s.song });
  const close = () => {
    if (window.parent === window) {
      history.back();
      return;
    }
    try {
      window.parent.postMessage({ type: "journeys:close" }, location.origin);
    } catch (e) {
    }
    history.back();
  };
  return /* @__PURE__ */ React.createElement("div", { className: "canvasview" }, photos.length > 0 && /* @__PURE__ */ React.createElement(InfiniteGallery, { images: photos, onTap: openTap, density: 4, imageWidth: 168, imageHeight: 220, initialZoom: 0.3 }), /* @__PURE__ */ React.createElement("div", { className: "canvas-top" }, /* @__PURE__ */ React.createElement("button", { className: "canvas-back", onClick: close, "aria-label": "\u8FD4\u56DE" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "20", height: "20" }, /* @__PURE__ */ React.createElement("path", { d: "M15 5l-7 7 7 7", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", fill: "none" }))), /* @__PURE__ */ React.createElement("div", { className: "canvas-title" }, "Every day of us")), photos.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "canvas-empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-icon" }, "\u2708\uFE0F"), /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, "\u8FD8\u6CA1\u6709\u4E00\u8D77\u8D70\u8FC7\u7684\u5730\u65B9"), /* @__PURE__ */ React.createElement("div", { className: "empty-sub" }, "\u53BB\u300C\u7BA1\u7406\u65C5\u7A0B\u300D\u6DFB\u52A0\u7B2C\u4E00\u5904\u505C\u7559")), story && /* @__PURE__ */ React.createElement(
    StoryOverlay,
    {
      stops: story.stops,
      index: story.index,
      song: story.song,
      onClose: () => setStory(null),
      onNav: storyNav
    }
  ));
}
function App() {
  return /* @__PURE__ */ React.createElement(CanvasApp, null);
}
ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
