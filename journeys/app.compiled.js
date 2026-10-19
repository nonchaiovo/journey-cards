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
function compressImage(file, maxW = 1600) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob((blob) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ base64: reader.result.split(",")[1], mime: "image/jpeg", w, h });
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.85);
    };
    img.src = url;
  });
}
function PhotoPicker({ src, onSrcChange }) {
  const fileRef = useRef(null);
  const [urlMode, setUrlMode] = useState(false);
  const [urlVal, setUrlVal] = useState("");
  const [uploading, setUploading] = useState(false);
  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const { base64, mime } = await compressImage(f);
      const res = await API("/api/journeys/upload", { method: "POST", body: { src_data: base64, mime } });
      if (res.url) onSrcChange(res.url);
    } catch (err) {
      alert("\u4E0A\u4F20\u5931\u8D25\uFF1A" + err.message);
    }
    setUploading(false);
  };
  const handleUrl = () => {
    const v = urlVal.trim();
    if (v) {
      onSrcChange(v);
      setUrlMode(false);
      setUrlVal("");
    }
  };
  if (src) {
    return /* @__PURE__ */ React.createElement("div", { className: "photo-picker has-photo" }, /* @__PURE__ */ React.createElement("img", { className: "photo-picker-img", src }), /* @__PURE__ */ React.createElement("button", { className: "photo-picker-change", onClick: () => {
      onSrcChange("");
      if (fileRef.current) fileRef.current.value = "";
    } }, "\u6362\u4E00\u5F20"), /* @__PURE__ */ React.createElement("input", { ref: fileRef, type: "file", accept: "image/*", hidden: true, onChange: handleFile }));
  }
  return /* @__PURE__ */ React.createElement("div", { className: "photo-picker" }, /* @__PURE__ */ React.createElement("div", { className: "photo-picker-empty" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 32, opacity: 0.3 } }, "\u{1F3D4}"), /* @__PURE__ */ React.createElement("button", { className: "photo-picker-btn primary", onClick: () => fileRef.current?.click(), disabled: uploading }, uploading ? "\u4E0A\u4F20\u4E2D\u2026" : "\u4ECE\u76F8\u518C\u9009\u4E00\u5F20\u7167\u7247"), /* @__PURE__ */ React.createElement("span", { className: "photo-picker-or" }, "\u6216"), urlMode ? /* @__PURE__ */ React.createElement("div", { style: { width: "100%", display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "photo-picker-url",
      value: urlVal,
      onChange: (e) => setUrlVal(e.target.value),
      placeholder: "\u7C98\u8D34\u56FE\u7247\u94FE\u63A5",
      autoFocus: true,
      onKeyDown: (e) => e.key === "Enter" && handleUrl()
    }
  ), /* @__PURE__ */ React.createElement("button", { className: "photo-picker-btn primary", onClick: handleUrl, style: { flex: "none" } }, "\u786E\u5B9A")) : /* @__PURE__ */ React.createElement("button", { className: "photo-picker-btn secondary", onClick: () => setUrlMode(true) }, "\u7C98\u8D34\u56FE\u7247\u94FE\u63A5"), /* @__PURE__ */ React.createElement("input", { ref: fileRef, type: "file", accept: "image/*", hidden: true, onChange: handleFile })), /* @__PURE__ */ React.createElement("div", { className: "photo-picker-tip" }, "\u{1F4A1} \u63A8\u8350\u7528\u7AD6\u5C4F\u7167\u7247\uFF08\u624B\u673A\u58C1\u7EB8\u6BD4\u4F8B\uFF09\xB7 ", /* @__PURE__ */ React.createElement("a", { href: "https://unsplash.com/s/photos/travel?orientation=portrait", target: "_blank", rel: "noopener" }, "\u53BB Unsplash \u627E\u56FE")));
}
function NewJourneyEditor({ journey, onCancel, onCreated }) {
  const [title, setTitle] = useState(journey?.title || "");
  const [titleEn, setTitleEn] = useState(journey?.titleEn || "");
  const [year, setYear] = useState(journey?.year || String((/* @__PURE__ */ new Date()).getFullYear()));
  const [audioUrl, setAudioUrl] = useState(journey?.song?.url || "");
  const [audioTitle, setAudioTitle] = useState(journey?.song?.title || "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await API(journey ? `/api/journeys/${journey.id}` : "/api/journeys", { method: journey ? "PATCH" : "POST", body: { title: title.trim(), titleEn: titleEn.trim(), year: year.trim(), audioUrl, audioTitle } });
      setSaving(false);
      if (res.id || res.ok) onCreated(res.id || journey.id);
    } catch (_) {
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "editor-overlay", onClick: onCancel }, /* @__PURE__ */ React.createElement("div", { className: "editor-sheet", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "ed-title" }, journey ? "\u7F16\u8F91\u65C5\u7A0B" : "\u65B0\u7684\u4E00\u6BB5\u65C5\u7A0B"), /* @__PURE__ */ React.createElement("label", { className: "ed-field" }, /* @__PURE__ */ React.createElement("span", { className: "ed-label" }, "\u53BB\u4E86\u54EA\u91CC\uFF08\u4E2D\u6587\uFF09"), /* @__PURE__ */ React.createElement("input", { className: "ed-input", value: title, onChange: (e) => setTitle(e.target.value), placeholder: "\u6BD4\u5982 \u51B0\u5C9B", autoFocus: true })), /* @__PURE__ */ React.createElement("label", { className: "ed-field" }, /* @__PURE__ */ React.createElement("span", { className: "ed-label" }, "\u82F1\u6587 / \u62FC\u97F3"), /* @__PURE__ */ React.createElement("input", { className: "ed-input", value: titleEn, onChange: (e) => setTitleEn(e.target.value), placeholder: "Iceland" })), /* @__PURE__ */ React.createElement("label", { className: "ed-field" }, /* @__PURE__ */ React.createElement("span", { className: "ed-label" }, "\u5E74\u4EFD"), /* @__PURE__ */ React.createElement("input", { className: "ed-input", value: year, onChange: (e) => setYear(e.target.value), placeholder: "2025" })), /* @__PURE__ */ React.createElement("label", { className: "ed-field" }, /* @__PURE__ */ React.createElement("span", { className: "ed-label" }, "\u6574\u8D9F\u914D\u4E50\u94FE\u63A5\uFF08\u53EF\u9009\uFF09"), /* @__PURE__ */ React.createElement("input", { className: "ed-input", value: audioUrl, onChange: (e) => setAudioUrl(e.target.value), placeholder: "https://\u2026/music.mp3" })), /* @__PURE__ */ React.createElement("label", { className: "ed-field" }, /* @__PURE__ */ React.createElement("span", { className: "ed-label" }, "\u914D\u4E50\u540D\u79F0"), /* @__PURE__ */ React.createElement("input", { className: "ed-input", value: audioTitle, onChange: (e) => setAudioTitle(e.target.value) })), /* @__PURE__ */ React.createElement("div", { className: "ed-actions" }, /* @__PURE__ */ React.createElement("button", { className: "ed-btn ghost", onClick: onCancel }, "\u53D6\u6D88"), /* @__PURE__ */ React.createElement("button", { className: "ed-btn solid", onClick: save, disabled: !title.trim() || saving }, saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4E0B\u4E00\u6B65\uFF1A\u52A0\u7167\u7247"))));
}
function StopEditor({ journeyId, stop, onCancel, onSaved }) {
  const isEdit = !!stop;
  const [src, setSrc] = useState(stop?.src || "");
  const [place, setPlace] = useState(stop?.place || "");
  const [placeEn, setPlaceEn] = useState(stop?.placeEn || "");
  const [date, setDate] = useState(stop?.date || "");
  const [note, setNote] = useState(stop?.note || "");
  const [song, setSong] = useState(stop?.song || null);
  const [saving, setSaving] = useState(false);
  const save = async (again) => {
    if (!place.trim()) return;
    setSaving(true);
    try {
      const body = {
        place: place.trim(),
        placeEn: placeEn.trim(),
        date: date.trim(),
        src,
        note: note.trim(),
        songTitle: song?.title || void 0,
        songArtist: song?.artist || void 0,
        songDur: song?.dur || void 0,
        songHue: song?.hue || void 0,
        songId: song?.id || void 0
      };
      if (isEdit) await API(`/api/journeys/stops/${stop.id}`, { method: "PATCH", body });
      else await API(`/api/journeys/${journeyId}/stops`, { method: "POST", body });
      setSaving(false);
      if (again) {
        setSrc("");
        setPlace("");
        setPlaceEn("");
        setDate("");
        setNote("");
        setSong(null);
        onSaved(true);
      } else onSaved(false);
    } catch (_) {
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "editor-overlay", onClick: onCancel }, /* @__PURE__ */ React.createElement("div", { className: "editor-sheet", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "ed-title" }, isEdit ? "\u7F16\u8F91\u8FD9\u4E00\u5904" : "\u52A0\u4E00\u5904\u5730\u65B9"), /* @__PURE__ */ React.createElement(PhotoPicker, { src, onSrcChange: setSrc }), src && /* @__PURE__ */ React.createElement("div", { className: "ed-hint", style: { marginBottom: 14, padding: "10px 14px", background: "rgba(200,153,104,0.08)", borderRadius: 12 } }, "\u{1F4A1} \u5148\u770B\u770B\u8FD9\u5F20\u7167\u7247\u2014\u2014\u4F60\u63A5\u4E0B\u6765\u5199\u7684\u6587\u5B57\uFF0C\u662F\u4F60\u4EE5\u7B2C\u4E00\u4EBA\u79F0\u7684\u53E3\u543B\uFF0C\u50CF\u5728\u8DDF\u5BF9\u65B9\u8BB2\u6545\u4E8B\u4E00\u6837\uFF0C\u8BB2\u4F60\u4EEC\u5728\u8FD9\u4E2A\u5730\u65B9\u53D1\u751F\u4E86\u4EC0\u4E48\u3002\u4E0D\u9650\u5B57\u6570\uFF0C\u8D8A\u957F\u8D8A\u597D\u3002"), /* @__PURE__ */ React.createElement("label", { className: "ed-field" }, /* @__PURE__ */ React.createElement("span", { className: "ed-label" }, "\u5730\u540D\uFF08\u4E2D\u6587\uFF09"), /* @__PURE__ */ React.createElement("input", { className: "ed-input", value: place, onChange: (e) => setPlace(e.target.value), placeholder: "\u6BD4\u5982 \u585E\u91CC\u96C5\u5170\u7011\u5E03" })), /* @__PURE__ */ React.createElement("div", { className: "ed-row" }, /* @__PURE__ */ React.createElement("label", { className: "ed-field" }, /* @__PURE__ */ React.createElement("span", { className: "ed-label" }, "\u82F1\u6587"), /* @__PURE__ */ React.createElement("input", { className: "ed-input", value: placeEn, onChange: (e) => setPlaceEn(e.target.value), placeholder: "Seljalandsfoss" })), /* @__PURE__ */ React.createElement("label", { className: "ed-field" }, /* @__PURE__ */ React.createElement("span", { className: "ed-label" }, "\u65E5\u671F"), /* @__PURE__ */ React.createElement("input", { className: "ed-input", value: date, onChange: (e) => setDate(e.target.value), placeholder: "2025.03.16" }))), /* @__PURE__ */ React.createElement("label", { className: "ed-field" }, /* @__PURE__ */ React.createElement("span", { className: "ed-label" }, "\u60F3\u8DDF\u5BF9\u65B9\u8BF4\u7684\u8BDD"), /* @__PURE__ */ React.createElement(
    "textarea",
    {
      className: "ed-input ed-area",
      value: note,
      onChange: (e) => setNote(e.target.value),
      placeholder: "\u7528\u300C\u6211\u300D\u548C\u300C\u4F60\u300D\u6765\u5199\u3002\u50CF\u662F\u4F60\u5728\u8DDF\u5BF9\u65B9\u8BB2\u90A3\u5929\u7684\u4E8B\uFF1A\n\n\u300C\u843D\u5730\u90A3\u5929\u4E0B\u7740\u7EC6\u96E8\uFF0C\u5F69\u8272\u7684\u5C0F\u623F\u5B50\u6CBF\u5761\u6392\u4E0B\u53BB\u3002\u6211\u4EEC\u6CA1\u6253\u4F1E\uFF0C\u4F60\u628A\u624B\u63D2\u8FDB\u6211\u53E3\u888B\uFF0C\u8BF4\u8FD9\u6837\u5C31\u591F\u6696\u4E86\u3002\u300D\n\n\u770B\u7740\u7167\u7247\u5199\u2014\u2014\u7167\u7247\u91CC\u662F\u4EC0\u4E48\u6837\u7684\u573A\u666F\uFF0C\u4F60\u4EEC\u5728\u90A3\u91CC\u505A\u4E86\u4EC0\u4E48\uFF0C\u4F60\u5728\u60F3\u4EC0\u4E48\u3002\u5199\u591A\u4E00\u70B9\uFF0C\u5BF9\u65B9\u559C\u6B22\u542C\u3002",
      rows: 6
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "ed-hint" }, "\u7B2C\u4E00\u4EBA\u79F0 \xB7 \u50CF\u8BB2\u6545\u4E8B\u7ED9\u5BF9\u65B9\u542C \xB7 \u4E0D\u9650\u5B57\u6570")), /* @__PURE__ */ React.createElement("div", { className: "ed-actions" }, /* @__PURE__ */ React.createElement("button", { className: "ed-btn ghost", onClick: onCancel }, "\u53D6\u6D88"), !isEdit && /* @__PURE__ */ React.createElement("button", { className: "ed-btn line", onClick: () => save(true), disabled: !place.trim() || saving }, "\u5B58\u4E0B \xB7 \u518D\u52A0\u4E00\u5904"), /* @__PURE__ */ React.createElement("button", { className: "ed-btn solid", onClick: () => save(false), disabled: !place.trim() || saving }, saving ? "\u4FDD\u5B58\u4E2D\u2026" : isEdit ? "\u4FDD\u5B58" : "\u5B58\u4E0B"))));
}
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
function JourneyDetail({ journey, onBack, onRefresh, showToast }) {
  const [addStop, setAddStop] = useState(false);
  const [editStop, setEditStop] = useState(null);
  const [story, setStory] = useState(null);
  const [collapsed, setCollapsed] = useState(/* @__PURE__ */ new Set());
  const stops = journey.stops || [];
  const allCollapsed = stops.length > 0 && collapsed.size === stops.length;
  const toggleAll = () => {
    if (allCollapsed) setCollapsed(/* @__PURE__ */ new Set());
    else setCollapsed(new Set(stops.map((s) => s.id)));
  };
  const toggleOne = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const handleDelete = async (stopId) => {
    if (!confirm("\u5220\u6389\u8FD9\u5904\uFF1F")) return;
    await API(`/api/journeys/stops/${stopId}`, { method: "DELETE" });
    showToast("\u5DF2\u5220\u9664");
    onRefresh();
  };
  const storyNav = (d) => {
    setStory((s) => s && { stops: s.stops, index: (s.index + d + s.stops.length) % s.stops.length });
  };
  const storyStops = stops.filter((s) => s.src);
  return /* @__PURE__ */ React.createElement("div", { className: "detail-page" }, /* @__PURE__ */ React.createElement("div", { className: "detail-head" }, /* @__PURE__ */ React.createElement("button", { className: "top-back", "aria-label": "\u8FD4\u56DE\u65C5\u7A0B\u5217\u8868", onClick: onBack }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "20", height: "20" }, /* @__PURE__ */ React.createElement("path", { d: "M15 5l-7 7 7 7", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", fill: "none" }))), /* @__PURE__ */ React.createElement("div", { className: "detail-title-area" }, /* @__PURE__ */ React.createElement("div", { className: "detail-kicker" }, "JOURNEYS \xB7 ", journey.year), /* @__PURE__ */ React.createElement("div", { className: "detail-name" }, journey.title, " \xB7 ", journey.titleEn))), stops.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-icon" }, "\u{1F4F7}"), /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, "\u8FD8\u6CA1\u6709\u7167\u7247"), /* @__PURE__ */ React.createElement("div", { className: "empty-sub" }, "\u627E\u4E00\u5F20\u4F60\u4EEC\u8981\u53BB\u7684\u5730\u65B9\u7684\u7AD6\u5C4F\u7167\u7247", /* @__PURE__ */ React.createElement("br", null), "\u7136\u540E\u5199\u4E0B\u4F60\u60F3\u8DDF\u5BF9\u65B9\u8BF4\u7684\u8BDD")) : /* @__PURE__ */ React.createElement("div", { className: "stop-list" }, stops.length > 1 && /* @__PURE__ */ React.createElement("button", { className: "stop-toggle-all", onClick: toggleAll }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 16 16", width: "14", height: "14", style: { transform: allCollapsed ? "rotate(-90deg)" : "" } }, /* @__PURE__ */ React.createElement("path", { d: "M4 6l4 4 4-4", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", fill: "none" })), allCollapsed ? "\u5C55\u5F00\u5168\u90E8" : "\u6298\u53E0\u5168\u90E8"), stops.map((s, i) => {
    const storyIdx = storyStops.findIndex((ss) => ss.id === s.id);
    const isCollapsed = collapsed.has(s.id);
    return /* @__PURE__ */ React.createElement("div", { className: "stop-card" + (isCollapsed ? " collapsed" : ""), key: s.id }, s.src ? /* @__PURE__ */ React.createElement(
      "img",
      {
        className: "stop-card-img",
        src: s.src,
        onClick: () => storyIdx >= 0 && setStory({ stops: storyStops, index: storyIdx })
      }
    ) : /* @__PURE__ */ React.createElement("div", { className: "stop-card-img placeholder" }, "\u6682\u65E0\u7167\u7247"), /* @__PURE__ */ React.createElement("div", { className: "stop-card-body" }, /* @__PURE__ */ React.createElement("div", { className: "stop-card-header", onClick: () => toggleOne(s.id) }, isCollapsed && s.src && /* @__PURE__ */ React.createElement("img", { className: "stop-thumb", src: s.src }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "stop-place" }, s.place), isCollapsed && s.date && /* @__PURE__ */ React.createElement("div", { className: "stop-date", style: { marginTop: 2 } }, s.date)), /* @__PURE__ */ React.createElement("svg", { className: "stop-card-chevron", viewBox: "0 0 16 16", width: "14", height: "14" }, /* @__PURE__ */ React.createElement("path", { d: "M4 6l4 4 4-4", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", fill: "none" }))), !isCollapsed && s.placeEn && /* @__PURE__ */ React.createElement("div", { className: "stop-place-en" }, s.placeEn), !isCollapsed && s.date && /* @__PURE__ */ React.createElement("div", { className: "stop-date" }, s.date), s.note && /* @__PURE__ */ React.createElement("div", { className: "stop-note" }, s.note), s.song && /* @__PURE__ */ React.createElement("div", { className: "stop-song" }, /* @__PURE__ */ React.createElement("span", { className: "stop-song-icon" }, "\u{1F3B5}"), /* @__PURE__ */ React.createElement("span", null, s.song.title, " \u2014 ", s.song.artist, s.song.dur ? ` \xB7 ${fmtDur(s.song.dur)}` : ""))), /* @__PURE__ */ React.createElement("div", { className: "stop-card-foot" }, s.src && s.note && /* @__PURE__ */ React.createElement("button", { className: "stop-card-btn view", onClick: () => storyIdx >= 0 && setStory({ stops: storyStops, index: storyIdx }) }, "\u9884\u89C8\u6545\u4E8B"), /* @__PURE__ */ React.createElement("button", { className: "stop-card-btn", onClick: () => setEditStop(s) }, "\u7F16\u8F91"), /* @__PURE__ */ React.createElement("button", { className: "stop-card-btn danger", onClick: () => handleDelete(s.id) }, "\u5220\u9664")));
  })), /* @__PURE__ */ React.createElement("button", { className: "detail-add-stop", onClick: () => setAddStop(true) }, "\uFF0B \u52A0\u4E00\u5904\u5730\u65B9"), addStop && /* @__PURE__ */ React.createElement(
    StopEditor,
    {
      journeyId: journey.id,
      onCancel: () => setAddStop(false),
      onSaved: (again) => {
        if (!again) setAddStop(false);
        showToast("\u5DF2\u4FDD\u5B58");
        onRefresh();
      }
    }
  ), editStop && /* @__PURE__ */ React.createElement(
    StopEditor,
    {
      journeyId: journey.id,
      stop: editStop,
      onCancel: () => setEditStop(null),
      onSaved: () => {
        setEditStop(null);
        showToast("\u5DF2\u4FDD\u5B58");
        onRefresh();
      }
    }
  ), story && /* @__PURE__ */ React.createElement(
    StoryOverlay,
    {
      stops: story.stops,
      index: story.index,
      song: journey.song,
      onClose: () => setStory(null),
      onNav: storyNav
    }
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
      location.hash = "manage";
      return;
    }
    try {
      window.parent.postMessage({ type: "journeys:close" }, location.origin);
    } catch (e) {
    }
    history.back();
  };
  return /* @__PURE__ */ React.createElement("div", { className: "canvasview" }, photos.length > 0 && /* @__PURE__ */ React.createElement(InfiniteGallery, { images: photos, onTap: openTap, density: 4, imageWidth: 168, imageHeight: 220, initialZoom: 0.3 }), /* @__PURE__ */ React.createElement("div", { className: "canvas-top" }, /* @__PURE__ */ React.createElement("button", { className: "canvas-back", onClick: close, "aria-label": "\u8FD4\u56DE" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", width: "20", height: "20" }, /* @__PURE__ */ React.createElement("path", { d: "M15 5l-7 7 7 7", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", fill: "none" }))), /* @__PURE__ */ React.createElement("div", { className: "canvas-title" }, "Every day of us"), /* @__PURE__ */ React.createElement("a", { className: "canvas-manage", href: "#manage" }, "\u7BA1\u7406\u65C5\u7A0B")), photos.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "canvas-empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-icon" }, "\u2708\uFE0F"), /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, "\u8FD8\u6CA1\u6709\u4E00\u8D77\u8D70\u8FC7\u7684\u5730\u65B9"), /* @__PURE__ */ React.createElement("div", { className: "empty-sub" }, "\u53BB\u300C\u7BA1\u7406\u65C5\u7A0B\u300D\u6DFB\u52A0\u7B2C\u4E00\u5904\u505C\u7559")), story && /* @__PURE__ */ React.createElement(
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
  const [route, setRoute] = useState(location.hash);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const d = await API("/api/journeys");
      setItems(d.journeys || []);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    const fn = () => setRoute(location.hash);
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  useEffect(() => {
    load();
  }, [route]);
  if (route !== "#manage") return /* @__PURE__ */ React.createElement(CanvasApp, null);
  const journey = items.find((j) => j.id === selected);
  if (journey) return /* @__PURE__ */ React.createElement(JourneyDetail, { journey, onBack: () => setSelected(null), onRefresh: load, showToast: () => {
  } });
  return /* @__PURE__ */ React.createElement("main", { className: "manage" }, /* @__PURE__ */ React.createElement("header", null, /* @__PURE__ */ React.createElement("a", { href: "#canvas" }, "\u8FD4\u56DE\u7167\u7247\u753B\u5E03"), /* @__PURE__ */ React.createElement("h1", null, "\u65C5\u884C\u8BB0\u5FC6"), /* @__PURE__ */ React.createElement("button", { className: "ed-btn solid", onClick: () => setEditing({}) }, "\u65B0\u5EFA\u65C5\u7A0B")), error && /* @__PURE__ */ React.createElement("p", { role: "alert" }, error, /* @__PURE__ */ React.createElement("button", { onClick: load }, "\u91CD\u8BD5")), items.map((j) => /* @__PURE__ */ React.createElement("article", { key: j.id }, /* @__PURE__ */ React.createElement("button", { className: "journey-open", onClick: () => setSelected(j.id) }, j.cover && /* @__PURE__ */ React.createElement("img", { src: j.cover }), /* @__PURE__ */ React.createElement("strong", null, j.title), /* @__PURE__ */ React.createElement("span", null, j.year, " \xB7 ", j.stops.length, " \u5904\u505C\u7559")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("button", { className: "ed-btn ghost", onClick: () => setEditing(j) }, "\u7F16\u8F91\u65C5\u7A0B / \u914D\u4E50"), /* @__PURE__ */ React.createElement("button", { className: "ed-btn ghost", onClick: async () => {
    if (confirm("\u5220\u9664\u8FD9\u8D9F\u65C5\u7A0B\u53CA\u5176\u505C\u7559\uFF1F")) {
      await API(`/api/journeys/${j.id}`, { method: "DELETE" });
      load();
    }
  } }, "\u5220\u9664\u65C5\u7A0B")))), !items.length && !error && /* @__PURE__ */ React.createElement("p", null, "\u4ECE\u4E00\u6BB5\u65B0\u7684\u65C5\u7A0B\u5F00\u59CB\u3002"), editing && /* @__PURE__ */ React.createElement(NewJourneyEditor, { journey: editing.id ? editing : null, onCancel: () => setEditing(null), onCreated: async (id) => {
    await load();
    setEditing(null);
    setSelected(id);
  } }));
}
ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
