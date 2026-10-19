const { useState, useEffect, useRef, useCallback, useMemo } = React;

const TOKEN = window.JOURNEYS_CONFIG.token || "";
const API = window.journeysAPI;
/* ── toast ── */
let toastTimer;
function Toast({ msg }) { return msg ? <div className="toast">{msg}</div> : null; }
function useToast() {
  const [msg, setMsg] = useState("");
  const show = (m) => { setMsg(m); clearTimeout(toastTimer); toastTimer = setTimeout(() => setMsg(""), 2000); };
  return [msg, show];
}

const fmtDur = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;

/* ── 照片压缩 ── */
function compressImage(file, maxW = 1600) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob(blob => {
        const reader = new FileReader();
        reader.onload = () => resolve({ base64: reader.result.split(",")[1], mime: "image/jpeg", w, h });
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.85);
    };
    img.src = url;
  });
}

/* ── 照片选择器 ── */
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
    } catch (err) { alert("上传失败：" + err.message); }
    setUploading(false);
  };

  const handleUrl = () => {
    const v = urlVal.trim();
    if (v) { onSrcChange(v); setUrlMode(false); setUrlVal(""); }
  };

  if (src) {
    return (
      <div className="photo-picker has-photo">
        <img className="photo-picker-img" src={src} />
        <button className="photo-picker-change" onClick={() => { onSrcChange(""); if (fileRef.current) fileRef.current.value = ""; }}>换一张</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
      </div>
    );
  }

  return (
    <div className="photo-picker">
      <div className="photo-picker-empty">
        <div style={{fontSize:32,opacity:0.3}}>🏔</div>
        <button className="photo-picker-btn primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? "上传中…" : "从相册选一张照片"}
        </button>
        <span className="photo-picker-or">或</span>
        {urlMode ? (
          <div style={{width:"100%",display:"flex",gap:8}}>
            <input className="photo-picker-url" value={urlVal} onChange={e => setUrlVal(e.target.value)}
              placeholder="粘贴图片链接" autoFocus onKeyDown={e => e.key === "Enter" && handleUrl()} />
            <button className="photo-picker-btn primary" onClick={handleUrl} style={{flex:"none"}}>确定</button>
          </div>
        ) : (
          <button className="photo-picker-btn secondary" onClick={() => setUrlMode(true)}>粘贴图片链接</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
      </div>
      <div className="photo-picker-tip">
        💡 推荐用竖屏照片（手机壁纸比例）· <a href="https://unsplash.com/s/photos/travel?orientation=portrait" target="_blank" rel="noopener">去 Unsplash 找图</a>
      </div>
    </div>
  );
}

/* ── 新建旅程 ── */
function NewJourneyEditor({ journey, onCancel, onCreated }) {
  const [title, setTitle] = useState(journey?.title || "");
  const [titleEn, setTitleEn] = useState(journey?.titleEn || "");
  const [year, setYear] = useState(journey?.year || String(new Date().getFullYear()));
  const [audioUrl,setAudioUrl] = useState(journey?.song?.url || "");
  const [audioTitle,setAudioTitle] = useState(journey?.song?.title || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
    const res = await API(journey ? `/api/journeys/${journey.id}` : "/api/journeys", { method: journey ? "PATCH" : "POST", body: { title: title.trim(), titleEn: titleEn.trim(), year: year.trim(), audioUrl, audioTitle } });
    setSaving(false);
    if (res.id || res.ok) onCreated(res.id || journey.id);
    } catch (_) {} finally { setSaving(false); }
  };

  return (
    <div className="editor-overlay" onClick={onCancel}>
      <div className="editor-sheet" onClick={e => e.stopPropagation()}>
        <div className="ed-title">{journey ? "编辑旅程" : "新的一段旅程"}</div>
        <label className="ed-field"><span className="ed-label">去了哪里（中文）</span>
          <input className="ed-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="比如 冰岛" autoFocus /></label>
        <label className="ed-field"><span className="ed-label">英文 / 拼音</span>
          <input className="ed-input" value={titleEn} onChange={e => setTitleEn(e.target.value)} placeholder="Iceland" /></label>
        <label className="ed-field"><span className="ed-label">年份</span>
          <input className="ed-input" value={year} onChange={e => setYear(e.target.value)} placeholder="2025" /></label>
        <label className="ed-field"><span className="ed-label">整趟配乐链接（可选）</span><input className="ed-input" value={audioUrl} onChange={e=>setAudioUrl(e.target.value)} placeholder="https://…/music.mp3" /></label>
        <label className="ed-field"><span className="ed-label">配乐名称</span><input className="ed-input" value={audioTitle} onChange={e=>setAudioTitle(e.target.value)} /></label>
        <div className="ed-actions">
          <button className="ed-btn ghost" onClick={onCancel}>取消</button>
          <button className="ed-btn solid" onClick={save} disabled={!title.trim() || saving}>{saving ? "保存中…" : "下一步：加照片"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── 搜歌选歌 ── */
/* ── 加/编辑一处停留 ── */
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
      place: place.trim(), placeEn: placeEn.trim(), date: date.trim(),
      src, note: note.trim(),
      songTitle: song?.title || undefined, songArtist: song?.artist || undefined,
      songDur: song?.dur || undefined, songHue: song?.hue || undefined, songId: song?.id || undefined,
    };
    if (isEdit) await API(`/api/journeys/stops/${stop.id}`, { method: "PATCH", body });
    else await API(`/api/journeys/${journeyId}/stops`, { method: "POST", body });
    setSaving(false);
    if (again) { setSrc(""); setPlace(""); setPlaceEn(""); setDate(""); setNote(""); setSong(null); onSaved(true); }
    else onSaved(false);
    } catch (_) {} finally { setSaving(false); }
  };

  return (
    <div className="editor-overlay" onClick={onCancel}>
      <div className="editor-sheet" onClick={e => e.stopPropagation()}>
        <div className="ed-title">{isEdit ? "编辑这一处" : "加一处地方"}</div>
        <PhotoPicker src={src} onSrcChange={setSrc} />
        {src && (
          <div className="ed-hint" style={{marginBottom:14,padding:"10px 14px",background:"rgba(200,153,104,0.08)",borderRadius:12}}>
            💡 先看看这张照片——你接下来写的文字，是你以第一人称的口吻，像在跟对方讲故事一样，讲你们在这个地方发生了什么。不限字数，越长越好。
          </div>
        )}
        <label className="ed-field"><span className="ed-label">地名（中文）</span>
          <input className="ed-input" value={place} onChange={e => setPlace(e.target.value)} placeholder="比如 塞里雅兰瀑布" /></label>
        <div className="ed-row">
          <label className="ed-field"><span className="ed-label">英文</span>
            <input className="ed-input" value={placeEn} onChange={e => setPlaceEn(e.target.value)} placeholder="Seljalandsfoss" /></label>
          <label className="ed-field"><span className="ed-label">日期</span>
            <input className="ed-input" value={date} onChange={e => setDate(e.target.value)} placeholder="2025.03.16" /></label>
        </div>
        <label className="ed-field"><span className="ed-label">想跟对方说的话</span>
          <textarea className="ed-input ed-area" value={note} onChange={e => setNote(e.target.value)}
            placeholder={"用「我」和「你」来写。像是你在跟对方讲那天的事：\n\n「落地那天下着细雨，彩色的小房子沿坡排下去。我们没打伞，你把手插进我口袋，说这样就够暖了。」\n\n看着照片写——照片里是什么样的场景，你们在那里做了什么，你在想什么。写多一点，对方喜欢听。"} rows={6} />
          <div className="ed-hint">第一人称 · 像讲故事给对方听 · 不限字数</div>
        </label>
        
        <div className="ed-actions">
          <button className="ed-btn ghost" onClick={onCancel}>取消</button>
          {!isEdit && <button className="ed-btn line" onClick={() => save(true)} disabled={!place.trim() || saving}>存下 · 再加一处</button>}
          <button className="ed-btn solid" onClick={() => save(false)} disabled={!place.trim() || saving}>{saving ? "保存中…" : (isEdit ? "保存" : "存下")}</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   展示组件：故事页（打字机旁白 + Ken Burns + 音乐）
   ══════════════════════════════════════════════ */

/* ── 音乐播放器（真声音） ── */
// 兜底把这一页发出的声音全掐掉。组件卸载时各自的清理是主路径，这个管漏网的：
// 整个 iframe 只是被 hidden、没卸载的那种情况（外面把 Journeys 页收起来了）。
function stopAllJourneyAudio() {
  try {
    if (window.__jAudioCtx && window.__jAudioCtx.state === "running") window.__jAudioCtx.suspend();
  } catch (e) {}
  document.querySelectorAll("audio").forEach(a => { try { a.pause(); } catch (e) {} });
}

// 背景音乐的 <audio> 收摊：停播、断源、把元素从 DOM 摘掉
function stopMediaEl(s) {
  if (!s) return;
  if (s.el) {
    try { s.el.pause(); } catch (e) {}
    try { s.el.removeAttribute("src"); s.el.load(); } catch (e) {}
    try { s.el.remove(); } catch (e) {}
  }
  if (s.node) { try { s.node.disconnect(); } catch (e) {} }
  if (s.gain) { try { s.gain.disconnect(); } catch (e) {} }
  s.el = null; s.node = null; s.gain = null;
}

function MusicPlayer({ song, musicRef }) {
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [duration,setDuration] = useState(0);
  // 音乐边下载边播放，避免整首下载后才开始。
  // 听起来就是点了没反应、歌根本不响。改成 <audio> 流式：几百 KB 就开播。
  // 音量/duck 仍走 Web Audio——iOS 上 audio.volume 是只读的，压不下去。
  const stateRef = useRef({ el: null, node: null, gain: null });
  const deadRef = useRef(false);   // 卸载后别再让加载完的歌自己响起来

  // song 变化时重置
  useEffect(() => {
    setPlaying(false); setT(0); setDuration(0);
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
      if (s.el) { try { s.el.pause(); } catch (e) {} }
      return;
    }

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!window.__jAudioCtx && AC) window.__jAudioCtx = new AC();
    const ctx = window.__jAudioCtx;
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});

    if (!s.el) {
      const el = document.createElement("audio");
      el.crossOrigin = "anonymous";
      el.src = window.journeyMediaURL(song.url);
      el.addEventListener("loadedmetadata",()=>setDuration(Number.isFinite(el.duration) ? el.duration : 0));
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
            s.gain.gain.value = 1.0;
            s.gain.connect(ctx.destination);
          }
          s.node = ctx.createMediaElementSource(el);   // 一个 <audio> 只能接一次
          s.node.connect(s.gain);
        } catch (e) {
          // 接不上就让 <audio> 自己出声（桌面端 volume 还能用），至少有歌
          console.warn("music media node failed:", e);
          s.node = null;
        }
      }
    }
    if (deadRef.current) return;
    // 暴露 gain 给 duck/unduck
    if (musicRef) musicRef.current = { _gain: s.gain };
    const p = s.el.play();
    if (p && p.catch) p.catch(e => console.warn("music play rejected:", e));

    const id = setInterval(() => { if (s.el) setT(s.el.currentTime || 0); }, 250);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => () => {
    deadRef.current = true;
    stopMediaEl(stateRef.current);
    if (musicRef) musicRef.current = null;
  }, []);

  const hue = song.hue || 32;
  const dur = duration || song.dur || 1;
  const pct = (t / dur) * 100;
  return (
    <div className="player">
      <button className="player-play" onClick={e => { e.stopPropagation(); setPlaying(p => !p); }}
        style={{ background: `oklch(0.62 0.13 ${hue})` }}>
        {playing
          ? <svg viewBox="0 0 24 24" width="18" height="18"><rect x="7" y="5.5" width="3.4" height="13" rx="1" fill="#fff"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1" fill="#fff"/></svg>
          : <svg viewBox="0 0 24 24" width="18" height="18" style={{marginLeft:1}}><path d="M8 5.5v13l11-6.5z" fill="#fff"/></svg>
        }
      </button>
      <div className="player-body">
        <div className="player-meta">
          <span className="player-title">{song.title}</span>
          <span className="player-artist">{song.artist}</span>
          {playing && <span className="eq"><i></i><i></i><i></i></span>}
        </div>
        <div className="player-track" onClick={e => {
          const el = stateRef.current.el;
          if (!el) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          try { el.currentTime = ratio * dur; } catch (err) { return; }
          setT(el.currentTime);
        }} style={{cursor:"pointer"}}>
          <div className="player-fill" style={{ width: Math.min(pct, 100) + "%", background: `oklch(0.62 0.13 ${hue})` }}></div>
        </div>
        <div className="player-times"><span>{fmtDur(t)}</span><span>{fmtDur(dur)}</span></div>
      </div>
    </div>
  );
}

/* ── 打字机旁白 ── */
function splitSentences(s) {
  return (s || "").split(/(?<=[。！？!?…])/).map(x => x.trim()).filter(Boolean);
}

// 语音缓存：同一句话不用重复合成
const NARR_VOICE_CACHE = new Map();
function fetchNarrVoice(text) {
  const endpoint = window.JOURNEYS_CONFIG.ttsEndpoint;
  if (!endpoint) return Promise.resolve(null);
  if (NARR_VOICE_CACHE.has(text)) return Promise.resolve(NARR_VOICE_CACHE.get(text));
  return API(endpoint, {method:"POST", body:{text}}).then(d => {
    const v = d.voice?.audio_data_url ? {url:d.voice.audio_data_url, duration:d.voice.duration || 0} : null;
    if (v) NARR_VOICE_CACHE.set(text,v);
    return v;
  }).catch(() => null);
}
const NARR_DUCK = 0.35;   // 他念的时候音乐压到这个增益
const NARR_SILENT = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
// 打开故事默认**不**自动念白：直接落到左下角那段完整文字。想听那段逐字浮现的，
// 点一下地名（story-cap-place → replayRef）才播。
function CenteredNarration({ sentences, replayRef, onDone, musicRef }) {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(true);     // 一进来就是"念完了"的状态
  const [armed, setArmed] = useState(false);  // 点过地名才算起势，没起势不打字不出声
  const voiceElRef = useRef(null);
  const seqRef = useRef(0);

  // 手指点开图片这一下就是手势：先用静音解锁语音元素，iOS 才让后面真的语音出声
  useEffect(() => {
    if (!voiceElRef.current) voiceElRef.current = new Audio();
    try { voiceElRef.current.src = NARR_SILENT; voiceElRef.current.play().catch(() => {}); } catch (e) {}
  }, []);

  const duck = () => {
    const a = musicRef && musicRef.current;
    if (a && a._gain) { try { a._gain.gain.value = NARR_DUCK; } catch (e) {} }
  };
  const unduck = () => {
    const a = musicRef && musicRef.current;
    if (a && a._gain) { try { a._gain.gain.value = 1.0; } catch (e) {} }
  };

  const reset = () => { seqRef.current++; setIdx(0); setTyped(""); setFading(false); setDone(false); setArmed(true); };
  if (replayRef) replayRef.current = reset;
  // 换一处地方（sentences 变）不自动念，回到"已念完"的静止态；点地名才重来
  useEffect(() => { seqRef.current++; setIdx(0); setTyped(""); setFading(false); setDone(true); setArmed(false); }, [sentences]);
  useEffect(() => { if (onDone) onDone(done); if (done) unduck(); }, [done]);
  useEffect(() => () => { seqRef.current++; unduck(); if (voiceElRef.current) { try { voiceElRef.current.pause(); voiceElRef.current.src = ""; } catch (e) {} } }, []);

  useEffect(() => {
    if (!armed) return;                       // 没点地名就不念，也别去拉旁白语音
    if (!sentences.length) { setDone(true); return; }
    const seq = seqRef.current;
    const s = sentences[idx];
    const last = idx >= sentences.length - 1;
    let timers = [];
    setTyped(""); setFading(false);

    fetchNarrVoice(s).then(voice => {
      if (seq !== seqRef.current) return;
      const durMs = (voice && voice.duration) ? voice.duration * 1000 : Math.max(1600, s.length * 260);
      if (voice && voice.url && voiceElRef.current) {
        try { voiceElRef.current.pause(); } catch (e) {}
        voiceElRef.current.src = voice.url;
        voiceElRef.current.currentTime = 0;
        voiceElRef.current.volume = 1.0;
        duck();
        voiceElRef.current.play().catch(() => {});
      }
      const n = s.length;
      const interval = Math.max(45, (durMs * 0.92) / Math.max(1, n));
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
              if (last) setDone(true); else setIdx(v => v + 1);
            }, 460));
          }, 700));
        }, 0));
      };
      timers.push(setTimeout(type, 60));
    });

    return () => timers.forEach(clearTimeout);
  }, [idx, sentences, armed]);

  if (!sentences.length) return null;
  return (
    <div className="narr-stage">
      {!done && (
        <p className={"narr-line" + (fading ? " out" : "")}>
          {typed}
          <span className="narr-cursor">|</span>
        </p>
      )}
    </div>
  );
}

/* ── 故事页浮层 ── */
function StoryOverlay({ stops, index, song, onClose, onNav }) {
  const stop = stops[index];
  const theSong = song || stop.song;   // 整趟一首歌（journey 级），老数据退回 stop.song
  const downX = useRef(null);
  const replayRef = useRef(() => {});
  const musicRef = useRef(null);
  // 一打开就是落定 + 全文展开（在 42vh 的窗口里滑着看），不再先看一遍逐字念白；
  // 想听那段浮现的，点地名重播
  const [narrDone, setNarrDone] = useState(true);
  const [noteExpanded, setNoteExpanded] = useState(true);
  const sentences = useMemo(() => splitSentences(stop.note), [stop.note, index]);
  useEffect(() => { setNarrDone(true); setNoteExpanded(true); }, [index]);

  const onDown = (e) => { downX.current = e.clientX; };
  const onUp = (e) => {
    if (downX.current == null) return;
    const dx = e.clientX - downX.current;
    downX.current = null;
    if (Math.abs(dx) > 40) onNav(dx < 0 ? 1 : -1);
  };

  return (
    <div className="story-overlay" onClick={onClose}>
      <div style={{position:"relative",width:"100%",height:"100%",display:"flex",flexDirection:"column"}}
        onClick={e => e.stopPropagation()} onPointerDown={onDown} onPointerUp={onUp}>

        <div className="story-top">
          <button aria-label="关闭故事" className="story-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none"/></svg>
          </button>
        </div>

        <div className="story-photo">
          <div key={index} className="story-photo-bg" style={{ backgroundImage: `url(${stop.src})` }}></div>
          <div className="story-centerscrim"></div>

          <div className="story-cap">
            <span className="story-cap-en">{stop.placeEn}</span>
            <button className="story-cap-place" onClick={e => { e.stopPropagation(); replayRef.current && replayRef.current(); }}>
              {stop.place}
            </button>
            <span className="story-cap-date">{stop.date}</span>
          </div>

          <CenteredNarration key={index} sentences={sentences} replayRef={replayRef} onDone={setNarrDone} musicRef={musicRef} />

          {narrDone && stop.note && (
            <div className="story-settled">
              <p className={"story-settled-note" + (noteExpanded ? " expanded" : "")}>{stop.note}</p>
              {stop.note.length > 100 && (
                <button className="story-settled-more" onClick={e => { e.stopPropagation(); setNoteExpanded(v => !v); }}>
                  {noteExpanded ? "收起 ↑" : "展开全文 ↓"}
                </button>
              )}
            </div>
          )}

          {theSong?.url && (
            <div className="story-foot">
              <MusicPlayer song={theSong} musicRef={musicRef} />
            </div>
          )}
        </div>

        <div className="story-dots">
          {stops.map((_, i) => (
            <span key={i} className={i === index ? "on" : ""} onClick={() => onNav(i - index)}></span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   页面组件
   ══════════════════════════════════════════════ */

/* ── 旅程详情页 ── */
function JourneyDetail({ journey, onBack, onRefresh, showToast }) {
  const [addStop, setAddStop] = useState(false);
  const [editStop, setEditStop] = useState(null);
  const [story, setStory] = useState(null);
  const [collapsed, setCollapsed] = useState(new Set());
  const stops = journey.stops || [];
  const allCollapsed = stops.length > 0 && collapsed.size === stops.length;
  const toggleAll = () => {
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(stops.map(s => s.id)));
  };
  const toggleOne = (id) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDelete = async (stopId) => {
    if (!confirm("删掉这处？")) return;
    await API(`/api/journeys/stops/${stopId}`, { method: "DELETE" });
    showToast("已删除");
    onRefresh();
  };

  const storyNav = (d) => {
    setStory(s => s && { stops: s.stops, index: (s.index + d + s.stops.length) % s.stops.length });
  };

  const storyStops = stops.filter(s => s.src);

  return (
    <div className="detail-page">
      <div className="detail-head">
        <button className="top-back" aria-label="返回旅程列表" onClick={onBack}>
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
        </button>
        <div className="detail-title-area">
          <div className="detail-kicker">JOURNEYS · {journey.year}</div>
          <div className="detail-name">{journey.title} · {journey.titleEn}</div>
        </div>
      </div>

      {stops.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📷</div>
          <div className="empty-title">还没有照片</div>
          <div className="empty-sub">找一张你们要去的地方的竖屏照片<br/>然后写下你想跟对方说的话</div>
        </div>
      ) : (
        <div className="stop-list">
          {stops.length > 1 && (
            <button className="stop-toggle-all" onClick={toggleAll}>
              <svg viewBox="0 0 16 16" width="14" height="14" style={{transform: allCollapsed ? "rotate(-90deg)" : ""}}>
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
              {allCollapsed ? "展开全部" : "折叠全部"}
            </button>
          )}
          {stops.map((s, i) => {
            const storyIdx = storyStops.findIndex(ss => ss.id === s.id);
            const isCollapsed = collapsed.has(s.id);
            return (
              <div className={"stop-card" + (isCollapsed ? " collapsed" : "")} key={s.id}>
                {s.src ? (
                  <img className="stop-card-img" src={s.src}
                    onClick={() => storyIdx >= 0 && setStory({ stops: storyStops, index: storyIdx })} />
                ) : (
                  <div className="stop-card-img placeholder">暂无照片</div>
                )}
                <div className="stop-card-body">
                  <div className="stop-card-header" onClick={() => toggleOne(s.id)}>
                    {isCollapsed && s.src && <img className="stop-thumb" src={s.src} />}
                    <div style={{flex:1,minWidth:0}}>
                      <div className="stop-place">{s.place}</div>
                      {isCollapsed && s.date && <div className="stop-date" style={{marginTop:2}}>{s.date}</div>}
                    </div>
                    <svg className="stop-card-chevron" viewBox="0 0 16 16" width="14" height="14">
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                  </div>
                  {!isCollapsed && s.placeEn && <div className="stop-place-en">{s.placeEn}</div>}
                  {!isCollapsed && s.date && <div className="stop-date">{s.date}</div>}
                  {s.note && <div className="stop-note">{s.note}</div>}
                  {s.song && (
                    <div className="stop-song"><span className="stop-song-icon">🎵</span>
                      <span>{s.song.title} — {s.song.artist}{s.song.dur ? ` · ${fmtDur(s.song.dur)}` : ""}</span></div>
                  )}
                </div>
                <div className="stop-card-foot">
                  {s.src && s.note && <button className="stop-card-btn view" onClick={() => storyIdx >= 0 && setStory({ stops: storyStops, index: storyIdx })}>预览故事</button>}
                  <button className="stop-card-btn" onClick={() => setEditStop(s)}>编辑</button>
                  <button className="stop-card-btn danger" onClick={() => handleDelete(s.id)}>删除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button className="detail-add-stop" onClick={() => setAddStop(true)}>＋ 加一处地方</button>

      {addStop && (
        <StopEditor journeyId={journey.id} onCancel={() => setAddStop(false)}
          onSaved={(again) => { if (!again) setAddStop(false); showToast("已保存"); onRefresh(); }} />
      )}
      {editStop && (
        <StopEditor journeyId={journey.id} stop={editStop} onCancel={() => setEditStop(null)}
          onSaved={() => { setEditStop(null); showToast("已保存"); onRefresh(); }} />
      )}

      {story && (
        <StoryOverlay stops={story.stops} index={story.index} song={journey.song}
          onClose={() => setStory(null)} onNav={storyNav} />
      )}
    </div>
  );
}

/* ── 无限照片画布（侧边栏进入）── */
/* Infinite photo canvas — every photo from every journey scattered on a
   pannable / zoomable infinite plane. Tap any tile to return to that day.
   Ported from the Infinity Canvas component; framer-motion replaced with a
   tiny get/set shim so it runs on plain React. */
const { useEffect: useEffectC, useMemo: useMemoC, useRef: useRefC } = React;

// motion-value shim: holds a value without triggering React re-renders
function useMV(init) {
  const ref = useRefC(null);
  if (!ref.current) ref.current = { v: init, get() { return this.v; }, set(n) { this.v = n; } };
  return ref.current;
}

function hash3(cx, cy, cz, salt) {
  let h = (cx | 0) * 0x8da6b343;
  h ^= Math.imul(cy | 0, 0xd8163841);
  h ^= Math.imul(cz | 0, 0xcb1ab31f);
  h ^= salt | 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function lerp(a, b, t) { return a + (b - a) * t; }

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
    onTap,
  } = props;

  const containerRef = useRefC(null);
  const sceneRef = useRefC(null);

  const safeImages = Array.isArray(images) && images.length > 0 ? images : [];
  const safeDensity = Math.max(1, Math.min(15, Math.floor(density || 5)));
  const safeImageWidth = Math.max(8, Math.min(4000, imageWidth || 150));
  const safeImageHeight = Math.max(8, Math.min(4000, imageHeight || 150));
  const safeRounded = Math.max(0, Math.min(20, rounded ?? 3));
  const safeDragSpeed = Math.max(0.1, Math.min(5, (dragSpeed || 20) / 20));
  const safeDriftAmount = Math.max(0, Math.min(20, driftAmount ?? 8));
  const safeFriction = 1 - (Math.max(1, Math.min(20, friction ?? 10)) / 20) * 0.3;

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
      const seed = hash3(gx, gy, octave | 0, 0x9e3779b1);
      const rand = mulberry32(seed);
      const totalSubs = subN * subN;
      const subs = new Array(totalSubs);
      for (let i = 0; i < totalSubs; i++) subs[i] = i;
      for (let i = totalSubs - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = subs[i]; subs[i] = subs[j]; subs[j] = tmp;
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
      if (container) { cW = container.clientWidth || cW; cH = container.clientHeight || cH; }
    });
    if (container) ro.observe(container);

    const layerPools = new Map();
    const getPool = (octave) => {
      let pool = layerPools.get(octave);
      if (!pool) { pool = { tileEls: new Map(), imgEls: new Map() }; layerPools.set(octave, pool); }
      return pool;
    };
    const disposeLayer = (octave) => {
      const pool = layerPools.get(octave);
      if (!pool) return;
      pool.tileEls.forEach((el) => { if (el.parentNode === scene) scene.removeChild(el); });
      pool.tileEls.clear(); pool.imgEls.clear(); layerPools.delete(octave);
    };
    const disposeAllLayers = () => { Array.from(layerPools.keys()).forEach(disposeLayer); };
    const removeTile = (octave, key) => {
      const pool = layerPools.get(octave);
      if (!pool) return;
      const el = pool.tileEls.get(key);
      if (el && el.parentNode === scene) scene.removeChild(el);
      pool.tileEls.delete(key); pool.imgEls.delete(key);
    };
    const ensureTile = (t) => {
      const pool = getPool(t.octave);
      const key = `${t.cx},${t.cy},${t.slot}`;
      let el = pool.tileEls.get(key);
      if (!el) {
        el = document.createElement("div");
        el.style.position = "absolute";
        el.style.left = "50%"; el.style.top = "50%";
        el.style.transformOrigin = "0 0";
        el.style.willChange = "transform, opacity";
        el.style.pointerEvents = "none";
        el.style.boxShadow = "0 10px 26px -12px rgba(0,0,0,0.7)";
        el.dataset.tileKey = key;
        const src = safeImages[t.imgIdx];
        el.dataset.journey = src ? src.journeyId : "";
        el.dataset.stop = src ? src.stopIndex : "";
        const img = document.createElement("img");
        img.src = (src && src.src) || "";
        img.alt = (src && src.alt) || "";
        img.draggable = false;
        img.style.width = "100%"; img.style.height = "100%";
        img.style.objectFit = "cover"; img.style.display = "block";
        img.style.pointerEvents = "none"; img.style.userSelect = "none";
        el.appendChild(img);
        scene.appendChild(el);
        pool.tileEls.set(key, el); pool.imgEls.set(key, img);
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
      const visibleKeys = new Set();
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
        el.style.width = `${wPx}px`; el.style.height = `${hPx}px`;
        el.style.opacity = String(layerAlpha);
        if (img) {
          const radiusPx = (safeRounded / 20) * (Math.min(wPx, hPx) / 2);
          img.style.borderRadius = `${radiusPx}px`;
        }
        orderKeys[i] = key; orderScale[i] = t.bakedScale;
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

    let lastOctaves = new Set();
    const project = () => {
      const cx = camX.get(), cy = camY.get(), lz = logZoom.get();
      const octave = Math.floor(lz), frac = lz - octave;
      const scaleCurrent = Math.pow(2, frac), scaleNext = Math.pow(2, frac - 1);
      projectLayer(octave, scaleCurrent, 1 - frac, 0, cx, cy);
      projectLayer(octave + 1, scaleNext, frac, 100000, cx, cy);
      const nowOctaves = new Set([octave, octave + 1]);
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
      if (vlz !== 0) { targetLogZoom.set(targetLogZoom.get() + vlz); velLogZoom.set(vlz * safeFriction); }
      driftX.set(lerp(driftX.get(), driftTX.get() * safeDriftAmount, 0.08));
      driftY.set(lerp(driftY.get(), driftTY.get() * safeDriftAmount, 0.08));
      camX.set(lerp(camX.get(), targetX.get() + driftX.get(), 0.18));
      camY.set(lerp(camY.get(), targetY.get() + driftY.get(), 0.18));
      logZoom.set(lerp(logZoom.get(), targetLogZoom.get(), 0.18));
      project();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); disposeAllLayers(); };
  }, [generateCell, safeFriction, safeDriftAmount, safeRounded, safeImages]);

  useEffectC(() => {
    const el = containerRef.current;
    if (!el) return;
    let dragging = false, moved = false;
    let lastPX = 0, lastPY = 0, lastT = 0, downX = 0, downY = 0, downT = 0, pid = null;
    // 双指缩放：手机没有滚轮，靠俩手指开合模拟 wheel
    const activeTouches = new Map();  // pointerId → {x, y}
    let pinchDist = 0;

    const pinchDistance = () => {
      const pts = Array.from(activeTouches.values());
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    const onDown = (e) => {
      if (e.pointerType === "touch") {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.size === 2) { dragging = false; pinchDist = pinchDistance(); return; }
        if (activeTouches.size > 2) return;
      }
      if (e.button !== 0 && e.pointerType === "mouse") return;
      dragging = true; moved = false; pid = e.pointerId;
      lastPX = downX = e.clientX; lastPY = downY = e.clientY;
      lastT = downT = e.timeStamp;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
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
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      driftTX.set(Math.max(-1, Math.min(1, nx)));
      driftTY.set(Math.max(-1, Math.min(1, ny)));
      if (!dragging || e.pointerId !== pid) return;
      const dpx = e.clientX - lastPX, dpy = e.clientY - lastPY;
      if (Math.abs(e.clientX - downX) > 5 || Math.abs(e.clientY - downY) > 5) moved = true;
      const lz = logZoom.get(), frac = lz - Math.floor(lz);
      const effScale = (1 - frac) * Math.pow(2, frac) + frac * Math.pow(2, frac - 1);
      const dWorldX = (-dpx / (PX_PER_UNIT * effScale)) * safeDragSpeed;
      const dWorldY = (-dpy / (PX_PER_UNIT * effScale)) * safeDragSpeed;
      targetX.set(targetX.get() + dWorldX);
      targetY.set(targetY.get() + dWorldY);
      const dt = Math.max(1, e.timeStamp - lastT), k = 16 / dt;
      velX.set(dWorldX * k); velY.set(dWorldY * k);
      lastPX = e.clientX; lastPY = e.clientY; lastT = e.timeStamp;
    };
    const hitTest = (px, py) => {
      const els = el.querySelectorAll("div[data-stop]");
      let best = null, bestZ = -Infinity;
      els.forEach((tileEl) => {
        if (!tileEl.dataset.journey) return;
        const r = tileEl.getBoundingClientRect();
        if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
          const z = parseInt(tileEl.style.zIndex || "0", 10);
          if (z >= bestZ) { bestZ = z; best = tileEl; }
        }
      });
      return best;
    };
    const onUp = (e) => {
      if (e.pointerType === "touch") { activeTouches.delete(e.pointerId); if (activeTouches.size < 2) pinchDist = 0; }
      if (!dragging || e.pointerId !== pid) return;
      dragging = false; pid = null;
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      el.style.cursor = "grab";
      const isTap = !moved && (e.timeStamp - downT) < 400;
      if (isTap && onTap) {
        const hit = hitTest(e.clientX, e.clientY);
        if (hit) onTap(hit.dataset.journey, parseInt(hit.dataset.stop, 10));
      }
    };
    const onCancel = (e) => onUp(e);
    const onWheel = (e) => {
      e.preventDefault();
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 16; else if (e.deltaMode === 2) delta *= 400;
      velLogZoom.set(velLogZoom.get() + (-delta * 0.0015 * safeDragSpeed));
    };
    const onLeave = () => { driftTX.set(0); driftTY.set(0); };

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

  return (
    <div ref={containerRef} className="canvas-wrap" style={{ backgroundColor }}>
      <div ref={sceneRef} style={{ position: "absolute", inset: 0 }}></div>
    </div>
  );
}

/* ── 主页 ── */
function CanvasApp() {
  const [journeys, setJourneys] = useState(null);
  const [story, setStory] = useState(null);

  const load = useCallback(async () => {
    try { const res = await API("/api/journeys");
    setJourneys(res.journeys || []); } catch (_) { setJourneys([]); }
  }, []);

  useEffect(() => { load(); }, []);
  // 父页面重新打开侧边栏发 journeys:refresh：静默重拉，不清空 journeys（不然又闪回加载屏）
  // journeys:stop-audio：外面把这一页收起来了（或者要在主聊里开另一个故事）。这个 iframe 不会被
  // 卸载、只是 hidden——歌会一直在后台放，对方回主聊再点一张卡就两首歌一起响。
  // 收到就把故事浮层关掉：MusicPlayer/旁白跟着卸载，各自的清理函数把声音收干净。
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

  // 把所有旅程的所有照片摊平成一片照片海，每张记着回到哪一天
  const photos = React.useMemo(() => {
    const out = [];
    (journeys || []).forEach(j => {
      (j.stops || []).filter(s => s.src).forEach((s, i) => {
        out.push({ src: s.src, journeyId: j.id, stopIndex: i, alt: s.place || "" });
      });
    });
    return out;
  }, [journeys]);

  if (journeys === null) return <div className="loading">加载中…</div>;

  const openTap = (journeyId, stopIndex) => {
    const j = journeys.find(x => x.id === journeyId);
    if (!j) return;
    const storyStops = (j.stops || []).filter(s => s.src);
    if (storyStops[stopIndex]) setStory({ stops: storyStops, index: stopIndex, song: j.song || null });
  };
  const storyNav = (d) => setStory(s => s && { stops: s.stops, index: (s.index + d + s.stops.length) % s.stops.length, song: s.song });
  const close = () => { if (window.parent === window) { location.hash = "manage"; return; } try { window.parent.postMessage({ type: "journeys:close" }, location.origin); } catch(e) {} history.back(); };

  return (
    <div className="canvasview">
      {photos.length > 0 && <InfiniteGallery images={photos} onTap={openTap} density={4} imageWidth={168} imageHeight={220} initialZoom={0.3} />}

      <div className="canvas-top">
        <button className="canvas-back" onClick={close} aria-label="返回">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
        </button>
        <div className="canvas-title">Every day of us</div><a className="canvas-manage" href="#manage">管理旅程</a>
      </div>

      {photos.length === 0 && (
        <div className="canvas-empty">
          <div className="empty-icon">✈️</div>
          <div className="empty-title">还没有一起走过的地方</div>
          <div className="empty-sub">去「管理旅程」添加第一处停留</div>
        </div>
      )}

      {story && (
        <StoryOverlay stops={story.stops} index={story.index} song={story.song}
          onClose={() => setStory(null)} onNav={storyNav} />
      )}
    </div>
  );
}

function App() {
  const [route,setRoute] = useState(location.hash);
  const [items,setItems] = useState([]);
  const [selected,setSelected] = useState(null);
  const [editing,setEditing] = useState(null);
  const [error,setError] = useState("");
  const load = async () => { try { const d=await API("/api/journeys"); setItems(d.journeys || []); setError(""); } catch(e) {setError(e.message);} };
  useEffect(()=> { const fn=()=>setRoute(location.hash); window.addEventListener("hashchange",fn); return ()=>window.removeEventListener("hashchange",fn); },[]);
  useEffect(()=> { load(); },[route]);
  if(route!=="#manage") return <CanvasApp/>;
  const journey=items.find(j=>j.id===selected);
  if(journey) return <JourneyDetail journey={journey} onBack={()=>setSelected(null)} onRefresh={load} showToast={()=>{}}/>;
  return <main className="manage"><header><a href="#canvas">返回照片画布</a><h1>旅行记忆</h1><button className="ed-btn solid" onClick={()=>setEditing({})}>新建旅程</button></header>
    {error && <p role="alert">{error}<button onClick={load}>重试</button></p>}
    {items.map(j=><article key={j.id}><button className="journey-open" onClick={()=>setSelected(j.id)}>{j.cover && <img src={j.cover}/>}<strong>{j.title}</strong><span>{j.year} · {j.stops.length} 处停留</span></button><div><button className="ed-btn ghost" onClick={()=>setEditing(j)}>编辑旅程 / 配乐</button><button className="ed-btn ghost" onClick={async()=>{if(confirm("删除这趟旅程及其停留？")){await API(`/api/journeys/${j.id}`,{method:"DELETE"});load();}}}>删除旅程</button></div></article>)}
    {!items.length && !error && <p>从一段新的旅程开始。</p>}
    {editing && <NewJourneyEditor journey={editing.id ? editing : null} onCancel={()=>setEditing(null)} onCreated={async id=>{await load();setEditing(null);setSelected(id);}}/>}
  </main>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
