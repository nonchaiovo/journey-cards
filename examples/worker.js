/**
 * journey-cards · 参考后端（Cloudflare Workers + D1 + KV）
 * ===========================================================================
 *
 * 这只是一份**参考实现**，不是唯一实现。SPEC.md 定义的是接口，不是技术栈——
 * 用 Node / Go / Python / PHP 随便写，只要路径、请求体、响应字段对得上，
 * 前端（卡片 + 全屏故事页）一行都不用改。
 *
 * 选 Workers 只是因为它最省事：一个文件、零依赖、`wrangler deploy` 就上线，
 * 数据库（D1）和图片音频存储（KV）都在同一个账号里，免费额度够个人用。
 *
 * 特意做成单文件、不 import 任何第三方包。想抄哪段抄哪段。
 *
 * ---------------------------------------------------------------------------
 * 一、建表 SQL（存成 schema.sql，或直接贴进 D1 控制台）
 * ---------------------------------------------------------------------------
 *
 * -- 一趟旅行
 * CREATE TABLE IF NOT EXISTS journeys (
 *   id          TEXT    PRIMARY KEY,           -- 'j_<base36时间戳>_<随机5位>'
 *   title       TEXT    NOT NULL,              -- 主标题（地名，如"新西兰"）
 *   title_en    TEXT    NOT NULL DEFAULT '',   -- 副标题 / 英文名
 *   year        TEXT    NOT NULL DEFAULT '',   -- 纯文本年份，不是数字类型
 *   cover       TEXT    NOT NULL DEFAULT '',   -- 封面：完整 URL 或 'kv:<key>'
 *   hint        TEXT    NOT NULL DEFAULT '',   -- 卡片底下那行小字，每趟一句，可选
 *   song_url    TEXT,                          -- 音频直链：完整 URL 或 'kv:<key>'
 *   song_title  TEXT,                          -- 歌名
 *   song_artist TEXT,                          -- 艺人
 *   song_cover  TEXT,                          -- 可选：专辑封面
 *   song_dur    INTEGER,                       -- 秒；只用于音频加载完成前占位显示
 *   song_hue    INTEGER,                       -- 0-360，播放器主色调
 *   position    INTEGER NOT NULL DEFAULT 0,    -- 排序值，越小越靠前（见下面"排序"）
 *   created_at  INTEGER NOT NULL,              -- 毫秒时间戳
 *   updated_at  INTEGER NOT NULL
 * );
 * CREATE INDEX IF NOT EXISTS idx_journeys_order ON journeys (position, created_at DESC);
 *
 * -- 一趟里的一处停留
 * CREATE TABLE IF NOT EXISTS journey_stops (
 *   id          TEXT    PRIMARY KEY,           -- 's_<base36时间戳>_<随机5位>'
 *   journey_id  TEXT    NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
 *   place       TEXT    NOT NULL,              -- 地名（必填）
 *   place_en    TEXT    NOT NULL DEFAULT '',
 *   date        TEXT    NOT NULL DEFAULT '',   -- 纯文本，如 '2025.03.16'，不校验格式
 *   src         TEXT    NOT NULL DEFAULT '',   -- 竖屏照片：完整 URL 或 'kv:<key>'
 *   note        TEXT    NOT NULL DEFAULT '',   -- 第一人称那段话（故事页左下角正文）
 *   position    INTEGER NOT NULL DEFAULT 0,    -- 0,1,2… 递增
 *   created_at  INTEGER NOT NULL,
 *   updated_at  INTEGER NOT NULL
 * );
 * CREATE INDEX IF NOT EXISTS idx_jstops_journey ON journey_stops (journey_id, position, created_at);
 *
 * 注意 ON DELETE CASCADE：D1 默认不开 PRAGMA foreign_keys，级联删除**不会**自动生效。
 * 本文件里的 deleteJourney 是显式两步删（放在同一个 batch 事务里），别指望数据库帮你删。
 *
 * 排序（两张表方向相反，照抄别改）：
 *   journeys     新建时 position = MIN(position) - 1  → 一路走负数，最新的一趟排最前
 *   journey_stops 新建时 position = MAX(position) + 1 → 0,1,2… 递增，按走的顺序排
 *   两张表都是 ORDER BY position ASC。
 *
 * ---------------------------------------------------------------------------
 * 二、wrangler.toml
 * ---------------------------------------------------------------------------
 *
 *   name = "journey-cards"
 *   main = "worker.js"
 *   compatibility_date = "2026-05-08"
 *
 *   [[d1_databases]]
 *   binding = "DB"                    # ← 名字必须是 DB
 *   database_name = "journey-cards"
 *   database_id = "<wrangler d1 create 之后填这里>"
 *
 *   [[kv_namespaces]]
 *   binding = "FILES"                 # ← 名字必须是 FILES；建议单开一个 namespace，
 *   id = "<wrangler kv namespace create 之后填这里>"   #   别跟别的项目共用
 *
 *   [vars]
 *   # ALLOW_ORIGIN = "https://your-frontend.example"  # 默认 "*"；上线建议钉死自己的域名
 *   # TIMEZONE     = "Asia/Shanghai"                  # year 缺省值按哪个时区算，默认 UTC
 *   # PUBLIC_BASE  = "https://journeys.example.com"   # 填了就返回绝对 URL，跨域前端用得上
 *   # REQUIRE_MEDIA_TOKEN = "1"                       # 照片/音频也要 ?token=，默认公开
 *
 * 部署：
 *   wrangler d1 create journey-cards
 *   wrangler kv namespace create FILES
 *   wrangler d1 execute journey-cards --remote --file=./schema.sql
 *   wrangler secret put AUTH_TOKEN        # ← 随便一串长随机字符串，别写进 vars
 *   wrangler deploy
 *
 * ---------------------------------------------------------------------------
 * 三、接口一览
 * ---------------------------------------------------------------------------
 *
 *   GET    /api/journeys                      列表（内嵌 stops）；?limit=&offset=&stops=0
 *   GET    /api/journeys/:id                  取单趟
 *   POST   /api/journeys                      建一趟
 *   PATCH  /api/journeys/:id                  改一趟（部分字段）
 *   DELETE /api/journeys/:id                  删一趟（连同 stops 和自己上传的 KV 媒体）
 *   PATCH  /api/journeys/reorder              重排整个列表  body { order: [id, …] }
 *
 *   GET    /api/journeys/:id/stops            列出某趟的停留
 *   POST   /api/journeys/:id/stops            加一处（自动追加到末尾）
 *   PATCH  /api/journeys/:id/stops/reorder    重排某趟的停留 body { order: [stopId, …] }
 *   GET    /api/journeys/stops/:stopId        取一处
 *   PATCH  /api/journeys/stops/:stopId        改一处
 *   DELETE /api/journeys/stops/:stopId        删一处
 *
 *   POST   /api/journeys/upload               传照片 → KV，返回 { key, url }
 *   POST   /api/journeys/audio                传音频 → KV，返回 { key, url }
 *   GET    /api/journeys/photo/:key           读照片（默认公开、长缓存、支持 Range）
 *   GET    /api/journeys/audio/:key           读音频（同上；Range 是进度条能拖的前提）
 *
 * 除两个媒体读取接口外，全部要 Bearer token。错误统一是
 *   { "error": "人话", "code": "MACHINE_CODE" }
 * 前端认 code，别去 match 文案。
 *
 * ---------------------------------------------------------------------------
 * 四、音乐：没有任何音乐平台的代理
 * ---------------------------------------------------------------------------
 *
 * 曲库授权这事没法开源。这里只认一个中立的音频直链字段 song.url：
 *   - 自己传：POST /api/journeys/audio 拿到 'kv:<key>'，写进 song_url。同源，稳。
 *   - 用外链：直接把 https://… 写进 song_url。
 *
 * ⚠️ 用外链有个坑：前端为了在念白时把音乐压低（ducking），走的是
 * Web Audio 的 createMediaElementSource。它接一个**跨域且没有 CORS 头**的音频时，
 * 浏览器不会报错，会**安静地静音**。所以要么用自托管端点，要么确认你的外链带
 * Access-Control-Allow-Origin。
 *
 * 另外 <audio> 要能拖进度条，服务端必须支持 Range 返回 206——本文件的 serveMedia
 * 实现了，照抄的时候别把这段删掉。
 */

// ───────────────────────── 可调参数 ─────────────────────────

// base64 字符串长度上限（不是解码后的字节数）。base64 比原文大 1/3，
// 4,000,000 ≈ 3MB 图片，12,000,000 ≈ 9MB 音频。
const MAX_PHOTO_B64 = 4_000_000;
const MAX_AUDIO_B64 = 12_000_000;

// 允许的 MIME，别让上传接口退化成通用网盘
const PHOTO_MIME = /^image\/(jpeg|png|webp|avif|gif)$/;
const AUDIO_MIME = /^audio\/(mpeg|mp3|mp4|aac|ogg|opus|wav|webm|x-m4a)$/;

// 播放器缺省值：音频 metadata 加载完之前拿这两个占位
const DEFAULT_DUR = 210;   // 秒
const DEFAULT_HUE = 32;    // 暖橙

// id / key 形状。`upload`、`photo` 这些静态段不能被当成 id 吃掉
const ID_RE = /^[\w-]+$/;
const RESERVED_SEG = new Set(["upload", "audio", "photo", "stops", "reorder"]);

// ───────────────────────── 响应封装 ─────────────────────────

function corsHeaders(env) {
  return {
    "access-control-allow-origin": env.ALLOW_ORIGIN || "*",
    "access-control-allow-methods": "GET,HEAD,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-expose-headers": "content-range,accept-ranges,content-length",
    "access-control-max-age": "86400",
  };
}

function j(env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // 别让 WebView / CDN 缓存 API 响应，不然刚改完的内容拿不到
      "cache-control": "no-store",
      ...corsHeaders(env),
    },
  });
}

// 错误统一带机器可读的 code，文案随便改、code 不要动
function fail(env, status, code, msg) {
  return j(env, { error: msg, code }, status);
}

// ───────────────────────── 鉴权 ─────────────────────────

/**
 * 单一共享 token，够个人用：没有用户体系、不过期、改 token 就等于全体注销。
 *
 * 生产环境想加强，按需要挑：
 *   1. 把 ?token= 关掉（下面那段），只认 Authorization header。query 里的 token
 *      会进 CF 日志、进 Referer、进浏览器历史。这里留着是因为 <img> / <audio>
 *      不带 header——但本实现的媒体接口默认是公开的，其实用不上，可以直接删。
 *   2. 换成 HttpOnly cookie + 服务端 session。
 *   3. 真要多用户就上 JWT / OAuth，并给两张表加 owner_id 列。
 */
function authed(request, env) {
  const secret = env.AUTH_TOKEN || "";
  if (!secret) return false;   // 没配 token 就一律拒绝，别裸奔
  const auth = request.headers.get("Authorization") || "";
  let t = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!t) t = new URL(request.url).searchParams.get("token") || "";
  return safeEqual(t, secret);
}

// 定长比较，别用 ===（会因为提前 return 泄露前缀信息）
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ───────────────────────── 小工具 ─────────────────────────

const newId = (prefix) =>
  prefix + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);

const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

// 请求体里 camelCase / snake_case 都吃，AI 和人手写都不容易踩空
const pick = (b, ...keys) => {
  for (const k of keys) if (b[k] !== undefined) return b[k];
  return undefined;
};
const has = (b, ...keys) => keys.some((k) => b[k] !== undefined);

function intOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

// year 缺省值。Worker 跑在 UTC，跨年那几个小时会给出上一年——配 TIMEZONE 就对了
function currentYear(env) {
  const tz = env.TIMEZONE || "UTC";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric" }).format(new Date());
  } catch {
    return String(new Date().getUTCFullYear());
  }
}

// 'kv:<key>' → 可访问 URL；其它（完整 URL / 相对路径）原样透传；空 → null
function mediaUrl(env, ref) {
  const v = str(ref);
  if (!v) return null;
  if (!v.startsWith("kv:")) return v;
  const key = v.slice(3);
  const base = env.PUBLIC_BASE ? String(env.PUBLIC_BASE).replace(/\/+$/, "") : "";
  return base + (key.startsWith("ja_") ? "/api/journeys/audio/" : "/api/journeys/photo/") + key;
}

const kvKeyOf = (ref) => {
  const v = str(ref);
  return v.startsWith("kv:") ? v.slice(3) : null;
};

// 删 journey / stop 时顺手回收 KV 里的媒体，但只在没人再引用它的时候删。
// （不做这件事的话，每删一趟就漏一批对象，永久堆在 KV 里。）
async function releaseAsset(env, ref) {
  const key = kvKeyOf(ref);
  if (!key) return;
  const used = await env.DB.prepare(
    `SELECT 1 AS x FROM journeys      WHERE cover = ? OR song_url = ?
     UNION ALL
     SELECT 1 AS x FROM journey_stops WHERE src = ?
     LIMIT 1`
  ).bind(ref, ref, ref).first();
  if (!used) await env.FILES.delete(key).catch(() => {});
}

// ───────────────────────── 行 → 响应对象 ─────────────────────────

function songOf(env, row) {
  // 判空看 url 或 title：只填了歌名没音频也算数（纯展示，播放器显示但不出声）
  if (!row.song_url && !row.song_title) return null;
  return {
    url: mediaUrl(env, row.song_url),
    title: row.song_title || "",
    artist: row.song_artist || "",
    cover: mediaUrl(env, row.song_cover),
    dur: row.song_dur || DEFAULT_DUR,
    hue: row.song_hue == null ? DEFAULT_HUE : row.song_hue,
  };
}

function stopOf(env, row) {
  return {
    id: row.id,
    journeyId: row.journey_id,
    place: row.place,
    placeEn: row.place_en || "",
    date: row.date || "",
    src: mediaUrl(env, row.src),     // 空 → null
    note: row.note || "",
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function journeyOf(env, row, stops) {
  const audio = songOf(env, row);
  return {
    id: row.id,
    title: row.title,
    titleEn: row.title_en || "",
    year: row.year || "",
    cover: mediaUrl(env, row.cover),  // 空 → null（跟 stop.src 保持一致）
    // 卡片底下那行小字：原样存原样返回，不校验也不生成。
    // 空串就交给前端回落到它自己的兜底文案（前端写 `journey.hint || CONFIG.cardHint`）。
    hint: row.hint || "",
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    audio,        // ← SPEC.md 里的正式字段名
    song: audio,  // ← 老前端用的别名，指向同一个对象。新代码只认 audio
    stops: stops || [],
  };
}

const J_COLS =
  "id, title, title_en, year, cover, hint, song_url, song_title, song_artist, song_cover, " +
  "song_dur, song_hue, position, created_at, updated_at";
const S_COLS =
  "id, journey_id, place, place_en, date, src, note, position, created_at, updated_at";

// ───────────────────────── journeys ─────────────────────────

async function listJourneys(request, env, url) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "0", 10) || 0, 0), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
  const withStops = url.searchParams.get("stops") !== "0";

  let sql = `SELECT ${J_COLS} FROM journeys ORDER BY position ASC, created_at DESC`;
  const binds = [];
  if (limit) { sql += " LIMIT ? OFFSET ?"; binds.push(limit, offset); }

  const jRes = await env.DB.prepare(sql).bind(...binds).all();
  const rows = jRes.results || [];
  if (!rows.length) return j(env, { journeys: [], total: 0 });

  let byJourney = {};
  if (withStops) {
    // 一次把这一页所有 stops 捞出来，在内存里分组。别在循环里查数据库。
    const ph = rows.map(() => "?").join(",");
    const sRes = await env.DB.prepare(
      `SELECT ${S_COLS} FROM journey_stops WHERE journey_id IN (${ph})
       ORDER BY position ASC, created_at ASC`
    ).bind(...rows.map((r) => r.id)).all();
    for (const s of sRes.results || []) (byJourney[s.journey_id] ||= []).push(stopOf(env, s));
  }

  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM journeys").first();
  return j(env, {
    journeys: rows.map((r) => journeyOf(env, r, byJourney[r.id])),
    total: total?.n ?? rows.length,
  });
}

async function getJourney(env, id) {
  const row = await env.DB.prepare(`SELECT ${J_COLS} FROM journeys WHERE id = ?`).bind(id).first();
  if (!row) return fail(env, 404, "NOT_FOUND", "journey 不存在");
  const sRes = await env.DB.prepare(
    `SELECT ${S_COLS} FROM journey_stops WHERE journey_id = ? ORDER BY position ASC, created_at ASC`
  ).bind(id).all();
  return j(env, { journey: journeyOf(env, row, (sRes.results || []).map((s) => stopOf(env, s))) });
}

async function createJourney(request, env) {
  const b = await request.json().catch(() => ({}));
  const title = str(b.title);
  if (!title) return fail(env, 400, "TITLE_REQUIRED", "title 不能空");

  const id = newId("j_");
  const t = Date.now();
  // 新的一趟排最前：position 一路往负数走
  const minR = await env.DB.prepare("SELECT MIN(position) AS p FROM journeys").first();
  const position = (minR?.p ?? 0) - 1;

  await env.DB.prepare(
    `INSERT INTO journeys
     (id, title, title_en, year, cover, song_url, song_title, song_artist, song_cover,
      song_dur, song_hue, position, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, title,
    str(pick(b, "titleEn", "title_en")),
    str(pick(b, "year")) || currentYear(env),
    str(pick(b, "cover")),
    str(pick(b, "audioUrl", "audio_url", "songUrl", "song_url")) || null,
    str(pick(b, "audioTitle", "audio_title", "songTitle", "song_title")) || null,
    str(pick(b, "audioArtist", "audio_artist", "songArtist", "song_artist")) || null,
    str(pick(b, "audioCover", "audio_cover", "songCover", "song_cover")) || null,
    intOrNull(pick(b, "audioDur", "audio_dur", "songDur", "song_dur")),
    intOrNull(pick(b, "audioHue", "audio_hue", "songHue", "song_hue")),
    position, t, t
  ).run();

  return j(env, { id, ok: true });
}

async function updateJourney(request, env, id) {
  const b = await request.json().catch(() => ({}));
  const set = [], vals = [];
  const put = (col, v) => { set.push(`${col} = ?`); vals.push(v); };

  if (b.title !== undefined) {
    const v = str(b.title);
    if (!v) return fail(env, 400, "TITLE_REQUIRED", "title 不能空");
    put("title", v);
  }
  if (has(b, "titleEn", "title_en")) put("title_en", str(pick(b, "titleEn", "title_en")));
  if (has(b, "year")) put("year", str(b.year));
  if (has(b, "cover")) put("cover", str(b.cover));
  if (has(b, "songUrl", "song_url", "audioUrl", "audio_url"))
    put("song_url", str(pick(b, "songUrl", "song_url", "audioUrl", "audio_url")) || null);
  if (has(b, "songTitle", "song_title")) put("song_title", str(pick(b, "songTitle", "song_title")) || null);
  if (has(b, "songArtist", "song_artist")) put("song_artist", str(pick(b, "songArtist", "song_artist")) || null);
  if (has(b, "songCover", "song_cover")) put("song_cover", str(pick(b, "songCover", "song_cover")) || null);
  if (has(b, "songDur", "song_dur")) put("song_dur", intOrNull(pick(b, "songDur", "song_dur")));
  if (has(b, "songHue", "song_hue")) put("song_hue", intOrNull(pick(b, "songHue", "song_hue")));
  if (has(b, "position")) put("position", intOrNull(b.position) ?? 0);

  if (!set.length) return fail(env, 400, "NO_FIELDS", "没有可更新的字段");
  put("updated_at", Date.now());
  vals.push(id);

  const r = await env.DB.prepare(`UPDATE journeys SET ${set.join(", ")} WHERE id = ?`).bind(...vals).run();
  if (!r.meta.changes) return fail(env, 404, "NOT_FOUND", "journey 不存在");
  return j(env, { ok: true });
}

async function deleteJourney(env, id) {
  const row = await env.DB.prepare("SELECT cover, song_url FROM journeys WHERE id = ?").bind(id).first();
  if (!row) return fail(env, 404, "NOT_FOUND", "journey 不存在");

  // 先把要回收的媒体引用记下来，删完行再去清 KV（清之前还会查一次有没有别人在用）
  const sRes = await env.DB.prepare("SELECT src FROM journey_stops WHERE journey_id = ?").bind(id).all();
  const refs = [row.cover, row.song_url, ...(sRes.results || []).map((s) => s.src)];

  // batch 是一个事务：两条要么都成功要么都不动，不会出现"stops 删了 journey 还在"
  await env.DB.batch([
    env.DB.prepare("DELETE FROM journey_stops WHERE journey_id = ?").bind(id),
    env.DB.prepare("DELETE FROM journeys WHERE id = ?").bind(id),
  ]);
  for (const ref of refs) await releaseAsset(env, ref);

  return j(env, { ok: true });
}

// 重排整个列表：body { order: ["j_a", "j_b", …] }，按给的顺序写 0,1,2…
// 之后新建的一趟仍然是 MIN(position)-1 = -1，照样排最前，不冲突。
async function reorderJourneys(request, env) {
  const b = await request.json().catch(() => ({}));
  const order = Array.isArray(b.order) ? b.order : null;
  if (!order || !order.length) return fail(env, 400, "BAD_BODY", "order 必须是 id 数组");
  if (order.some((x) => typeof x !== "string" || !ID_RE.test(x)))
    return fail(env, 400, "BAD_ID", "order 里有非法 id");

  const t = Date.now();
  await env.DB.batch(order.map((id, i) =>
    env.DB.prepare("UPDATE journeys SET position = ?, updated_at = ? WHERE id = ?").bind(i, t, id)
  ));
  return j(env, { ok: true, count: order.length });
}

// ───────────────────────── stops ─────────────────────────

async function listStops(env, journeyId) {
  const jj = await env.DB.prepare("SELECT id FROM journeys WHERE id = ?").bind(journeyId).first();
  if (!jj) return fail(env, 404, "NOT_FOUND", "journey 不存在");
  const sRes = await env.DB.prepare(
    `SELECT ${S_COLS} FROM journey_stops WHERE journey_id = ? ORDER BY position ASC, created_at ASC`
  ).bind(journeyId).all();
  return j(env, { stops: (sRes.results || []).map((s) => stopOf(env, s)) });
}

async function getStop(env, id) {
  const row = await env.DB.prepare(`SELECT ${S_COLS} FROM journey_stops WHERE id = ?`).bind(id).first();
  if (!row) return fail(env, 404, "NOT_FOUND", "stop 不存在");
  return j(env, { stop: stopOf(env, row) });
}

async function createStop(request, env, journeyId) {
  const jj = await env.DB.prepare("SELECT id, cover FROM journeys WHERE id = ?").bind(journeyId).first();
  if (!jj) return fail(env, 404, "NOT_FOUND", "journey 不存在");

  const b = await request.json().catch(() => ({}));
  const place = str(b.place);
  if (!place) return fail(env, 400, "PLACE_REQUIRED", "place 不能空");
  const src = str(b.src);

  const maxR = await env.DB.prepare(
    "SELECT MAX(position) AS p FROM journey_stops WHERE journey_id = ?"
  ).bind(journeyId).first();
  const position = (maxR?.p ?? -1) + 1;   // 停留是往后追加：0,1,2…

  const id = newId("s_");
  const t = Date.now();
  await env.DB.prepare(
    `INSERT INTO journey_stops
     (id, journey_id, place, place_en, date, src, note, position, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, journeyId, place,
    str(pick(b, "placeEn", "place_en")),
    str(pick(b, "date")),
    src,
    str(pick(b, "note")),
    position, t, t
  ).run();

  // 第一张照片自动当封面（cover 空的时候才填），不然卡片永远没图
  if (src && !jj.cover) {
    await env.DB.prepare("UPDATE journeys SET cover = ?, updated_at = ? WHERE id = ?")
      .bind(src, t, journeyId).run();
  } else {
    await env.DB.prepare("UPDATE journeys SET updated_at = ? WHERE id = ?").bind(t, journeyId).run();
  }

  return j(env, { id, ok: true });
}

async function updateStop(request, env, id) {
  const cur = await env.DB.prepare("SELECT journey_id, src FROM journey_stops WHERE id = ?").bind(id).first();
  if (!cur) return fail(env, 404, "NOT_FOUND", "stop 不存在");

  const b = await request.json().catch(() => ({}));
  const set = [], vals = [];
  const put = (col, v) => { set.push(`${col} = ?`); vals.push(v); };

  if (b.place !== undefined) {
    const v = str(b.place);
    if (!v) return fail(env, 400, "PLACE_REQUIRED", "place 不能空");
    put("place", v);
  }
  if (has(b, "placeEn", "place_en")) put("place_en", str(pick(b, "placeEn", "place_en")));
  if (has(b, "date")) put("date", str(b.date));
  if (has(b, "src")) put("src", str(b.src));
  if (has(b, "note")) put("note", str(b.note));
  if (has(b, "position")) put("position", intOrNull(b.position) ?? 0);

  if (!set.length) return fail(env, 400, "NO_FIELDS", "没有可更新的字段");
  const t = Date.now();
  put("updated_at", t);
  vals.push(id);

  await env.DB.prepare(`UPDATE journey_stops SET ${set.join(", ")} WHERE id = ?`).bind(...vals).run();

  // 跟 createStop 保持对称：换了照片也要管封面，改了停留也要刷父级 updated_at
  const newSrc = has(b, "src") ? str(b.src) : cur.src;
  const parent = await env.DB.prepare("SELECT cover FROM journeys WHERE id = ?").bind(cur.journey_id).first();
  if (parent && (!parent.cover || parent.cover === cur.src) && newSrc !== cur.src) {
    await env.DB.prepare("UPDATE journeys SET cover = ?, updated_at = ? WHERE id = ?")
      .bind(newSrc, t, cur.journey_id).run();
    if (cur.src && cur.src !== newSrc) await releaseAsset(env, cur.src);
  } else {
    await env.DB.prepare("UPDATE journeys SET updated_at = ? WHERE id = ?").bind(t, cur.journey_id).run();
    if (has(b, "src") && cur.src && cur.src !== newSrc) await releaseAsset(env, cur.src);
  }

  return j(env, { ok: true });
}

async function deleteStop(env, id) {
  const cur = await env.DB.prepare("SELECT journey_id, src FROM journey_stops WHERE id = ?").bind(id).first();
  if (!cur) return fail(env, 404, "NOT_FOUND", "stop 不存在");

  await env.DB.prepare("DELETE FROM journey_stops WHERE id = ?").bind(id).run();

  const t = Date.now();
  const parent = await env.DB.prepare("SELECT cover FROM journeys WHERE id = ?").bind(cur.journey_id).first();
  if (parent && cur.src && parent.cover === cur.src) {
    // 封面正好是被删掉那张 → 顺位补上第一张还在的照片
    const nextSrc = await env.DB.prepare(
      "SELECT src FROM journey_stops WHERE journey_id = ? AND src != '' ORDER BY position ASC LIMIT 1"
    ).bind(cur.journey_id).first();
    await env.DB.prepare("UPDATE journeys SET cover = ?, updated_at = ? WHERE id = ?")
      .bind(nextSrc?.src || "", t, cur.journey_id).run();
  } else {
    await env.DB.prepare("UPDATE journeys SET updated_at = ? WHERE id = ?").bind(t, cur.journey_id).run();
  }
  await releaseAsset(env, cur.src);

  // position 不重排，删中间一处会留下空洞（0,1,3,4）——不影响排序，介意就调 reorder
  return j(env, { ok: true });
}

async function reorderStops(request, env, journeyId) {
  const b = await request.json().catch(() => ({}));
  const order = Array.isArray(b.order) ? b.order : null;
  if (!order || !order.length) return fail(env, 400, "BAD_BODY", "order 必须是 stop id 数组");
  if (order.some((x) => typeof x !== "string" || !ID_RE.test(x)))
    return fail(env, 400, "BAD_ID", "order 里有非法 id");

  const t = Date.now();
  const stmts = order.map((sid, i) =>
    env.DB.prepare("UPDATE journey_stops SET position = ?, updated_at = ? WHERE id = ? AND journey_id = ?")
      .bind(i, t, sid, journeyId)
  );
  stmts.push(env.DB.prepare("UPDATE journeys SET updated_at = ? WHERE id = ?").bind(t, journeyId));
  await env.DB.batch(stmts);
  return j(env, { ok: true, count: order.length });
}

// ───────────────────────── 媒体上传 / 读取 ─────────────────────────

/**
 * 两种传法都收：
 *   A. JSON  { src_data: "<base64>", mime: "image/jpeg" }   ← AI / 脚本方便
 *   B. 裸二进制 body + content-type: image/jpeg             ← 浏览器上传方便，省 CPU
 *
 * base64 那条路要在 Worker 里 atob + 逐字节转数组，是 CPU 密集操作；
 * 免费计划每请求 10ms CPU，大图会超。真要上量就走 B，或者换 R2 预签名直传。
 */
async function uploadMedia(request, env, kind) {
  const isPhoto = kind === "photo";
  const prefix = isPhoto ? "jp_" : "ja_";
  const maxB64 = isPhoto ? MAX_PHOTO_B64 : MAX_AUDIO_B64;
  const mimeRe = isPhoto ? PHOTO_MIME : AUDIO_MIME;
  const ct = (request.headers.get("content-type") || "").toLowerCase();

  let bytes, mime;

  if (ct.includes("application/json")) {
    const b = await request.json().catch(() => ({}));
    let data = pick(b, "src_data", "srcData", "audio_data", "audioData", "data");
    if (typeof data !== "string" || !data) {
      return fail(env, 400, "BAD_BODY", isPhoto ? "src_data 必须是 base64 字符串" : "audio_data 必须是 base64 字符串");
    }
    mime = str(b.mime) || (isPhoto ? "image/jpeg" : "audio/mpeg");
    // data URL 前缀自己剥掉，别让调用方（尤其是 AI）记这条规矩
    const m = /^data:([^;,]+);base64,/i.exec(data);
    if (m) { mime = m[1].toLowerCase(); data = data.slice(m[0].length); }
    data = data.replace(/\s/g, "");
    if (data.length > maxB64) {
      return fail(env, 413, "TOO_LARGE", `文件太大（base64 上限 ${maxB64} 字符），先压一压`);
    }
    try {
      bytes = b64ToBytes(data);
    } catch {
      // 原版这里没 try/catch，非法 base64 直接 500。这种事应该是 400。
      return fail(env, 400, "BAD_BASE64", "base64 解不开");
    }
  } else {
    mime = ct.split(";")[0].trim() || (isPhoto ? "image/jpeg" : "audio/mpeg");
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return fail(env, 400, "BAD_BODY", "body 是空的");
    if (buf.byteLength > Math.floor(maxB64 * 0.75)) {
      return fail(env, 413, "TOO_LARGE", "文件太大，先压一压");
    }
    bytes = new Uint8Array(buf);
  }

  if (!mimeRe.test(mime)) return fail(env, 400, "BAD_MIME", `不支持的类型：${mime}`);

  const key = prefix + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  // 没设 expirationTtl = 永久保存。回收靠 releaseAsset（删 journey / 换图时）
  await env.FILES.put(key, bytes, { metadata: { mime, size: bytes.length, uploadedAt: Date.now() } });

  return j(env, {
    key,
    // 建议存成 'kv:<key>'，换域名 / 改路径前缀时不用动数据
    ref: "kv:" + key,
    url: mediaUrl(env, "kv:" + key),
    ok: true,
  });
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 读媒体。默认不鉴权：<img> / <audio> 不会带 Authorization header，
 * 安全模型是"URL 猜不到"（unlisted），**不是访问控制**——拿到链接的人就能看。
 * 介意就设 REQUIRE_MEDIA_TOKEN=1，前端所有 <img src> 后面补 ?token=。
 *
 * 一定要校验 key 前缀。只校验 /^[\w-]+$/ 的话，这个公开端点能读到同一个 KV
 * namespace 里的**任意**对象——包括你放在里面的别的东西。
 */
async function serveMedia(request, env, key, prefix) {
  if (!key.startsWith(prefix) || !ID_RE.test(key)) {
    return new Response(JSON.stringify({ error: "bad key", code: "BAD_KEY" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(env) },
    });
  }
  if (env.REQUIRE_MEDIA_TOKEN === "1" && !authed(request, env)) {
    return new Response(JSON.stringify({ error: "unauthorized", code: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(env) },
    });
  }

  const obj = await env.FILES.getWithMetadata(key, { type: "arrayBuffer" });
  if (!obj || !obj.value) {
    return new Response(JSON.stringify({ error: "not found", code: "NOT_FOUND" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(env) },
    });
  }

  const mime = obj.metadata?.mime || (prefix === "jp_" ? "image/jpeg" : "audio/mpeg");
  const total = obj.value.byteLength;
  const base = {
    "content-type": mime,
    // key 是一次性的（改图必换 key），所以可以放心 immutable
    "cache-control": "public, max-age=31536000, immutable",
    "accept-ranges": "bytes",
    ...corsHeaders(env),
  };

  if (request.method === "HEAD") {
    return new Response(null, { headers: { ...base, "content-length": String(total) } });
  }

  // Range：<audio> 拖进度条靠这个。只会 200 全量返回的端点，进度条是拖不动的。
  const range = request.headers.get("Range");
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m && (m[1] || m[2])) {
    let start, end;
    if (m[1]) {
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    } else {
      // "bytes=-500" = 最后 500 字节
      const suffix = Math.min(Number(m[2]), total);
      start = total - suffix;
      end = total - 1;
    }
    if (!(start >= 0) || start >= total || end < start) {
      return new Response(null, {
        status: 416,
        headers: { ...base, "content-range": `bytes */${total}` },
      });
    }
    return new Response(obj.value.slice(start, end + 1), {
      status: 206,
      headers: {
        ...base,
        "content-range": `bytes ${start}-${end}/${total}`,
        "content-length": String(end - start + 1),
      },
    });
  }

  return new Response(obj.value, { headers: { ...base, "content-length": String(total) } });
}

// ───────────────────────── 路由 ─────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const m = request.method;

    if (m === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env) });

    // ① 媒体读取放在鉴权闸门**之前**（img / audio 标签不带 header）
    let hit;
    if ((hit = p.match(/^\/api\/journeys\/photo\/([\w-]+)$/)) && (m === "GET" || m === "HEAD"))
      return serveMedia(request, env, hit[1], "jp_");
    if ((hit = p.match(/^\/api\/journeys\/audio\/([\w-]+)$/)) && (m === "GET" || m === "HEAD"))
      return serveMedia(request, env, hit[1], "ja_");

    if (p !== "/api/journeys" && !p.startsWith("/api/journeys/"))
      return fail(env, 404, "NOT_FOUND", "没有这个接口");

    // ② 闸门。往下全部要 token
    if (!authed(request, env)) return fail(env, 401, "UNAUTHORIZED", "token 不对");

    try {
      // 静态路径必须排在 /:id 之前，否则会被当成 journey id 吃掉
      if (p === "/api/journeys" && m === "GET") return await listJourneys(request, env, url);
      if (p === "/api/journeys" && m === "POST") return await createJourney(request, env);
      if (p === "/api/journeys/reorder" && m === "PATCH") return await reorderJourneys(request, env);
      if (p === "/api/journeys/upload" && m === "POST") return await uploadMedia(request, env, "photo");
      if (p === "/api/journeys/audio" && m === "POST") return await uploadMedia(request, env, "audio");

      // stops（路径里不带 journey id，跟 SPEC 一致）
      if ((hit = p.match(/^\/api\/journeys\/stops\/([\w-]+)$/))) {
        const sid = hit[1];
        if (!ID_RE.test(sid)) return fail(env, 400, "BAD_ID", "id 形状不对");
        if (m === "GET") return await getStop(env, sid);
        if (m === "PATCH") return await updateStop(request, env, sid);
        if (m === "DELETE") return await deleteStop(env, sid);
        return fail(env, 405, "METHOD_NOT_ALLOWED", "方法不对");
      }

      if ((hit = p.match(/^\/api\/journeys\/([\w-]+)\/stops$/))) {
        const jid = hit[1];
        if (!ID_RE.test(jid) || RESERVED_SEG.has(jid)) return fail(env, 400, "BAD_ID", "id 形状不对");
        if (m === "GET") return await listStops(env, jid);
        if (m === "POST") return await createStop(request, env, jid);
        return fail(env, 405, "METHOD_NOT_ALLOWED", "方法不对");
      }

      if ((hit = p.match(/^\/api\/journeys\/([\w-]+)\/stops\/reorder$/)) && m === "PATCH") {
        if (!ID_RE.test(hit[1]) || RESERVED_SEG.has(hit[1])) return fail(env, 400, "BAD_ID", "id 形状不对");
        return await reorderStops(request, env, hit[1]);
      }

      if ((hit = p.match(/^\/api\/journeys\/([\w-]+)$/))) {
        const jid = hit[1];
        if (!ID_RE.test(jid) || RESERVED_SEG.has(jid)) return fail(env, 400, "BAD_ID", "id 形状不对");
        if (m === "GET") return await getJourney(env, jid);
        if (m === "PATCH") return await updateJourney(request, env, jid);
        if (m === "DELETE") return await deleteJourney(env, jid);
        return fail(env, 405, "METHOD_NOT_ALLOWED", "方法不对");
      }

      return fail(env, 404, "NOT_FOUND", "没有这个接口");
    } catch (e) {
      // D1 / KV 抛出来的都在这里兜住，别把栈吐给客户端
      console.error("[journeys]", e && e.stack || e);
      return fail(env, 500, "INTERNAL", "服务端出错了");
    }
  },
};
