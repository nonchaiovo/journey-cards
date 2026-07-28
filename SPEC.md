# Journey Cards · 设计规格

一次"旅行"= 一个目的地 + 6 处停留，每处一张竖屏照片和一段第一人称的话，整趟配一首曲子。
在聊天流里它是一张卡片；点开是全屏照片故事：照片铺满、地名在顶部、那段话落在左下角、底部一个播放器和 6 个圆点。

这份文档描述**后端契约**：两张表、一组 REST 接口、照片/音频怎么存。前端可以自己写，
只要按这里的字段读数据就行（`examples/` 下的参考 UI 就是照这份规格写的）。

不依赖任何特定运行时。原始实现跑在 Cloudflare Workers + D1 + KV 上，所以文中会拿它举例，
但接口里没有一处是 Workers 专有的——SQLite / Postgres + 任意对象存储都能一比一实现。

---

## 目录

1. [概念模型](#1-概念模型)
2. [数据模型](#2-数据模型)
3. [排序与 position 规则](#3-排序与-position-规则)
4. [REST 接口全集](#4-rest-接口全集)
5. [照片存储](#5-照片存储)
6. [音频字段](#6-音频字段)
7. [前端消费契约](#7-前端消费契约)（含[渲染侧的硬约束](#渲染侧的硬约束)）
8. [错误处理](#8-错误处理)
9. [鉴权](#9-鉴权)
10. [卡片标签协议](#10-卡片标签协议可选)
11. [实现顺序建议](#11-实现顺序建议)
12. [明确不做的事](#12-明确不做的事)

---

## 1. 概念模型

```
journey（一趟）
├── title / titleEn / year        标题：目的地名 + 副标题 + 年份（纯文本）
├── cover                         封面照片（第一处的照片自动回填）
├── hint                          卡片底下那行小字（可选，每趟一句）
├── audio                         整趟一首曲子（不是每处一首）
└── stops[]（若干处，约定 6 处）
     ├── place / placeEn / date   地名 + 副标题 + 日期（纯文本）
     ├── src                      竖屏照片
     └── note                     第一人称的一段话，故事页正文
```

三条设计约定，写在前面，因为它们决定了下面所有字段的形状：

- **6 处是约定不是约束。** 数据库、接口都不限制数量。6 是"一屏能翻完、又足够成一趟"的经验值，
  底部圆点也是照 6 个排的。你写 3 处或 9 处都能跑，只是 UI 要自己看着办。
- **`year` / `date` 是纯文本，不是日期类型。** 存 `"2025"` 和 `"2025.03.16"`，不做校验、不做时区换算。
  这是故意的：这些字段只用来显示，从来不参与排序或筛选。真要排序用 `position` 和 `created_at`。
- **曲子挂在 journey 上，不挂在 stop 上。** 故事页从第一处放到最后一处，中间不换歌。
  （早期实现两张表上都有一套 `song_*` 字段，stop 级的那套是历史包袱，这份规格里已经删掉了。）

命名上有一处要先说清，免得后面来回对照，三个地方三个名字，**都不是笔误**：

| 在哪 | 叫什么 |
|---|---|
| 数据库列 | `song_url` / `song_title` / … |
| 响应里的对象 | `audio`（参考实现同时给一个 `song` 别名指向同一对象，只为兼容老前端；**新写的前端只认 `audio`**） |
| 上传 / 读取端点 | `/api/journeys/audio` |

列名是历史形状，改起来要动迁移，不值；响应字段用中立的 `audio`，因为它可能只是一段环境音，不一定是"歌"。

---

## 2. 数据模型

### 2.1 `journeys`

| 列 | 类型 | 必填 | 默认 | 说明 |
|---|---|:--:|---|---|
| `id` | TEXT PK | ✅ | — | `j_` + 时间戳 base36 + `_` + 5 位随机。见下方 [ID 生成](#23-id-生成) |
| `title` | TEXT | ✅ | — | 主标题，通常是目的地名 |
| `title_en` | TEXT | | `''` | 副标题 / 外文名，纯展示 |
| `year` | TEXT | ✅ | 当前年份 | **纯文本**，不是数字 |
| `cover` | TEXT | | `''` | 封面：完整 URL 或 `kv:<key>`。第一个带照片的 stop 会自动回填 |
| `hint` | TEXT | | `''` | 卡片底下那行小字。**每趟一句，建议由建这趟的人（或 AI）自己写**，跟着这趟的情绪走。空则前端回落到自己的默认文案，见 [第 7 节](#7-前端消费契约) |
| `song_url` | TEXT | | NULL | 音频地址：完整 URL 或 `kv:<key>`。详见 [第 6 节](#6-音频字段) |
| `song_title` | TEXT | | NULL | 曲名 |
| `song_artist` | TEXT | | NULL | 演奏 / 演唱者 |
| `song_cover` | TEXT | | NULL | 可选：封面图 URL 或 `kv:<key>` |
| `song_dur` | INTEGER | | NULL | 秒。**仅用于元数据加载完成前的占位显示** |
| `song_hue` | INTEGER | | NULL | 0–360，播放器主色调。渲染缺省 `32`（暖橙） |
| `position` | INTEGER | ✅ | 0 | 排序值，**越小越靠前**。见[第 3 节](#3-排序与-position-规则) |
| `created_at` | INTEGER | ✅ | — | 毫秒时间戳 |
| `updated_at` | INTEGER | ✅ | — | 毫秒时间戳 |

### 2.2 `journey_stops`

| 列 | 类型 | 必填 | 默认 | 说明 |
|---|---|:--:|---|---|
| `id` | TEXT PK | ✅ | — | `s_` + 时间戳 base36 + `_` + 5 位随机 |
| `journey_id` | TEXT FK | ✅ | — | → `journeys.id` |
| `place` | TEXT | ✅ | — | 地名 |
| `place_en` | TEXT | | `''` | 外文地名，纯展示 |
| `date` | TEXT | | `''` | **纯文本**，建议 `2025.03.16`，不校验 |
| `src` | TEXT | | `''` | 照片：完整 URL 或 `kv:<key>` |
| `note` | TEXT | | `''` | 第一人称的一段话。**这是故事页最主要的内容**，可以很长（几百字） |
| `position` | INTEGER | ✅ | 0 | 该趟内的顺序，**越小越靠前**，从 0 递增 |
| `created_at` | INTEGER | ✅ | — | 毫秒时间戳 |
| `updated_at` | INTEGER | ✅ | — | 毫秒时间戳 |

`note` 不设长度上限。TEXT 在 SQLite 里没有实际上限，Postgres 用 `text`，MySQL 必须用 `TEXT`/`MEDIUMTEXT`，
**不要用 `VARCHAR(255)`**——这段话动辄两三百字，中文一字三字节，255 会截。

### 2.3 ID 生成

```js
const jid = "j_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
// → j_m9xk2p3_a3f9c
```

前缀（`j_` / `s_` / 照片 `jp_` / 音频 `ja_`）有两个作用：一是看日志时一眼认得出，
二是**跟静态路径段区分得开**。

真正会撞车的是这两组同形路径：

```
/api/journeys/upload     ↔  /api/journeys/:id      （都是"/api/journeys/ 加一段"）
/api/journeys/audio      ↔  /api/journeys/:id
/api/journeys/stops/:id  ↔  /api/journeys/:id/stops（都是"加两段"）
```

它们能共存靠两件事，缺一不可：

1. **静态路径写在 `:id` 之前**。匹配是自上而下的，`/api/journeys/upload` 一旦落到 `:id` 那条，
   就会被当成一个 id 为 `upload` 的 journey。
2. **`:id` 上挡一层保留字**（`upload` / `audio` / `photo` / `stops` / `reorder`）。
   光靠方法区分（upload 是 POST、单趟是 PATCH/DELETE）也能跑，但哪天给单趟加个 POST 就会翻车。

**如果你改了 id 生成规则（比如换成 UUID 或自增数字），必须重新审一遍路由匹配顺序**，或者干脆
把静态路径挪到 `/api/journeys/_upload` 这种不会碰撞的形式。

### 2.4 建表 SQL（SQLite / D1）

```sql
CREATE TABLE IF NOT EXISTS journeys (
  id           TEXT    PRIMARY KEY,
  title        TEXT    NOT NULL,
  title_en     TEXT    NOT NULL DEFAULT '',
  year         TEXT    NOT NULL,
  cover        TEXT    NOT NULL DEFAULT '',
  hint         TEXT    NOT NULL DEFAULT '',   -- 卡片底下那行小字，可选
  song_url     TEXT,
  song_title   TEXT,
  song_artist  TEXT,
  song_cover   TEXT,
  song_dur     INTEGER,
  song_hue     INTEGER,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journeys_order
  ON journeys (position ASC, created_at DESC);

CREATE TABLE IF NOT EXISTS journey_stops (
  id          TEXT    PRIMARY KEY,
  journey_id  TEXT    NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  place       TEXT    NOT NULL,
  place_en    TEXT    NOT NULL DEFAULT '',
  date        TEXT    NOT NULL DEFAULT '',
  src         TEXT    NOT NULL DEFAULT '',
  note        TEXT    NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jstops_journey
  ON journey_stops (journey_id, position ASC, created_at ASC);
```

> ⚠️ **`ON DELETE CASCADE` 在 D1 上默认不生效。** SQLite 的外键约束要 `PRAGMA foreign_keys = ON`
> 才启用，而 D1 默认是关的、也不允许你在连接上随便开。所以删一趟必须**手动两步删**
> （先 stops 后 journey，见 [4.5](#45-delete-apijourneysid)）。
> 换成 Postgres / MySQL 时 CASCADE 是真生效的，那段手动删可以简化，但**别默认它一定会跑**——
> 先在你的库上验一次。

其他数据库的差异只有类型名：`INTEGER` 时间戳在 Postgres 上用 `bigint`，`TEXT` 保持 `text`。
不要把时间戳换成 `timestamptz`——接口约定就是毫秒整数，换了要在两头都做转换，不值。

---

## 3. 排序与 position 规则

**两张表的 position 方向是反的。这是全套规格里最容易抄错的一处。**

| | 新建时取值 | 效果 | 列表排序 |
|---|---|---|---|
| `journeys` | `MIN(position) - 1` | 一路往**负数**走，最新的一趟排最前 | `ORDER BY position ASC, created_at DESC` |
| `journey_stops` | `MAX(position) + 1`（同一趟内） | 从 **0 递增**，新的一处接在末尾 | `ORDER BY position ASC, created_at ASC` |

两边都是 `ORDER BY position ASC`，但语义相反：journey 的"最前"是最新，stop 的"最前"是最早。

```
journeys（先后建了三趟）        journey_stops（同一趟里加了三处）
  position  -3  第三趟 ←最新     position  0  第一处 ←最先
            -2  第二趟                     1  第二处
            -1  第一趟                     2  第三处 ←最后加
```

具体取值：

```sql
-- 新 journey
SELECT MIN(position) AS p FROM journeys;              -- 空表 → NULL
-- position = (p ?? 0) - 1                            -- 第一趟是 -1

-- 新 stop
SELECT MAX(position) AS p FROM journey_stops WHERE journey_id = ?;   -- 空 → NULL
-- position = (p ?? -1) + 1                           -- 第一处是 0
```

三条附带的坑：

- **删中间一处会留下空洞**（0,1,3,4）。不影响显示顺序，但下一次新增会接在 `MAX+1`、序号跳号。
  如果你在意连续性，删完重排一遍；不在意就别管，`ORDER BY` 不看空洞。
- **改顺序只能逐条 PATCH `position`。** 基础接口里没有批量重排。要做拖拽排序，
  建议自己补一个 `PATCH /api/journeys/:id/stops/reorder`，body `{"order":["s_a","s_b","s_c"]}`，
  服务端按数组下标重写 position（见 [4.11](#411-可选补充接口)）。
- **列表接口默认不返回 stop 的 `position`。** 只做展示的前端不需要它（数组顺序已经对了），
  但做编辑器就必须要。这份规格里已把它加进响应，见 [4.1](#41-get-apijourneys)。

---

## 4. REST 接口全集

所有 JSON 响应统一：

```
content-type: application/json; charset=utf-8
cache-control: no-store, no-cache, must-revalidate
```

唯一例外是照片 / 音频读取端点，返回裸二进制（见 [第 5](#5-照片存储)、[第 6 节](#6-音频字段)）。

所有路径参数（journey id / stop id / 存储 key）先过一遍 `^[\w-]+$`，不匹配直接 400。
**照片和音频端点还要额外校验前缀**（`^jp_` / `^ja_`），理由见 [5.4](#54-读取端点的安全模型)。

### 4.0 接口总表

| # | 方法 | 路径 | 鉴权 | 说明 |
|:--:|---|---|:--:|---|
| 1 | GET | `/api/journeys` | ✅ | 列出全部 journey，内嵌全部 stops |
| 2 | GET | `/api/journeys/:id` | ✅ | 取单趟 |
| 3 | POST | `/api/journeys` | ✅ | 建一趟 |
| 4 | PATCH | `/api/journeys/:id` | ✅ | 改一趟（部分字段） |
| 5 | DELETE | `/api/journeys/:id` | ✅ | 删一趟（连带 stops 和它们的照片） |
| 6 | POST | `/api/journeys/:id/stops` | ✅ | 给某趟加一处，自动追加到末尾 |
| 7 | PATCH | `/api/journeys/stops/:stopId` | ✅ | 改一处 |
| 8 | DELETE | `/api/journeys/stops/:stopId` | ✅ | 删一处 |
| 9 | POST | `/api/journeys/upload` | ✅ | 上传照片（base64）→ 对象存储 |
| 10 | GET | `/api/journeys/photo/:key` | ❌ 公开 | 读照片二进制 |
| 11 | POST | `/api/journeys/audio` | ✅ | 上传音频（base64） |
| 12 | GET | `/api/journeys/audio/:key` | ❌ 公开 | 读音频，**必须支持 Range** |

注意 #7 #8 的路径是 `/api/journeys/stops/:stopId`，**不带 journey id**。stop id 全局唯一，
不需要父级定位；这样前端拿到 stop 就能直接改，不用同时记着它属于哪一趟。

请求体字段**同时接受 camelCase 和 snake_case**（`titleEn` 或 `title_en` 都行），响应一律 camelCase。
这在实现上就是 `b.titleEn ?? b.title_en`，两行代码，省掉接入方一半的调试时间——建议照做。

---

### 4.1 `GET /api/journeys`

无参数。返回全部 journey，每个内嵌它的全部 stops。

实现是两条 SQL：先查全部 journeys，再用 `WHERE journey_id IN (?,?,…)` 一把捞出所有 stops，
在内存里按 `journey_id` 分组。**不要在循环里逐趟查 stops**（N+1）。

> ⚠️ **`IN (?,?,…)` 的绑定参数个数有上限。** D1 是每条语句 100 个，SQLite 默认
> `SQLITE_MAX_VARIABLE_NUMBER` 是 999（新版 32766）。趟数超过上限时这条 SQL 会直接报错，
> 而不是慢——所以要么把 id 分批（每批 ≤ 90）查完再合并，要么改成 `JOIN journeys` 子查询。
> 趟数少的时候看不出来，一旦攒够就是整个列表接口 500。
>
> **参考实现没做分批**，是一把 `IN` 全塞进去的。它在 D1 上大约撑到 100 趟；
> 在意的话自己补分批，或者前端一律带 `?limit=`（参考实现把 limit 上限钉在 200，
> 所以带了 limit 也别超过绑定数上限）。

**200：**

```json
{
  "journeys": [
    {
      "id": "j_m9xk2p3_a3f9c",
      "title": "新西兰",
      "titleEn": "New Zealand",
      "year": "2025",
      "cover": "/api/journeys/photo/jp_m9xk2q1_c81af9",
      "hint": "南半球的秋天，从一片湖开始。",
      "position": -3,
      "createdAt": 1753672345678,
      "updatedAt": 1753672399999,
      "audio": {
        "url": "/api/journeys/audio/ja_m9xk2p9_71bd3e",
        "title": "Long Way North",
        "artist": "—",
        "cover": null,
        "dur": 214,
        "hue": 32
      },
      "stops": [
        {
          "id": "s_m9xk2q1_b7e2d",
          "place": "蒂卡波湖",
          "placeEn": "Lake Tekapo",
          "date": "2025.03.14",
          "src": "/api/journeys/photo/jp_m9xk2q1_c81af9",
          "note": "到的时候刚过四点。风把湖面吹成一块起雾的玻璃，蓝得不像真的……",
          "position": 0,
          "createdAt": 1753672350000,
          "updatedAt": 1753672350000
        }
      ]
    }
  ],
  "total": 3
}
```

> 参考实现在 `audio` 之外还会给一个同值的 `song` 键（老前端的别名），上面没列。新代码只读 `audio`。
> `total` 是 journey 总数（不受 `limit` 影响），分页见本节末尾。

**字段映射规则**（照抄级细节，前端的判空逻辑依赖它们）：

| DB 列 | 响应字段 | 转换 |
|---|---|---|
| `title_en` / `place_en` | `titleEn` / `placeEn` | snake → camel |
| `created_at` / `updated_at` | `createdAt` / `updatedAt` | 原样（毫秒整数） |
| `cover` | `cover` | `kv:xxx` → `/api/journeys/photo/xxx`；否则原样；**空 → `""` 或 `null`，见下** |
| `hint` | `hint` | 原样（空就给 `""`，前端自己回落到默认文案） |
| `src` | `src` | 同 `cover`，但**空 → `null`** |
| `song_url` | `audio.url` | 同上（走 `/api/journeys/audio/`）；空 → `null` |
| `song_*` 六列 | `audio` 对象 | 见下 |
| `journey_id`（stop） | `journeyId` | 列表接口里可以省（已嵌在父对象里）；参考实现一律返回，省不省都不影响前端 |

> ⚠️ **`cover` 空是 `""` 还是 `null`，两种实现都在跑。** 原实现是 `cover` 空给 `""`、`src` 空给 `null`，
> 这个不对称纯粹是历史遗留；本仓库的参考实现（`examples/worker.js`）统一成了 `null`。
> 两种都合法，但**前端判空务必两种都处理**：写 `if (!x)`，别写 `if (x === null)`。

**`audio` 对象的组装：**

```js
audio: (r.song_url || r.song_title)
  ? {
      url:    r.song_url ? resolveKv(r.song_url, "/api/journeys/audio/") : null,
      title:  r.song_title  || "",
      artist: r.song_artist || "",
      cover:  r.song_cover ? resolveKv(r.song_cover, "/api/journeys/photo/") : null,
      dur:    r.song_dur ?? 210,
      hue:    r.song_hue ?? 32,
    }
  : null
```

> ⚠️ **判空条件是 `song_url || song_title`，两个都空才算没有。** 允许"只有曲名没有音频文件"的
> 纯展示态（播放器显示曲名但播放键 disabled）。原实现只看曲名，导致"只填了音频地址没填曲名"的
> 数据会被前端当成没歌、播放器整个不渲染——这是个真实踩过的坑。
>
> `dur` 缺省 210、`hue` 缺省 32 **在后端兜一次就够**，前端别再兜第二遍。两处兜底最后一定会漂。

**错误**：`401`

**分页**：基础契约里没有，默认全量返回。几十趟以内没问题（一趟带 6 个 stop，一条 `note` 几百字，
单趟 JSON 约 3–5 KB，50 趟约 200 KB）。上百趟之后建议加
`?limit=&offset=`，并支持 `?stops=0` 只返回 journey 头不带 stops——列表页其实只用得到 `cover` 和 `title`。
参考实现（`examples/worker.js`）这三个参数都收了，并在响应里多给一个 `total`（journey 总数，
不受 limit 影响）；不传参数时行为跟基础契约完全一致。

---

### 4.2 `GET /api/journeys/:id`

取单趟，响应体是 [4.1](#41-get-apijourneys) 里 `journeys[]` 的单个元素（**不套 `journeys` 数组**）：

```json
{ "journey": { "id": "j_m9xk2p3_a3f9c", "title": "新西兰", "…": "…", "stops": [] } }
```

**错误**：`400 BAD_ID` · `404 NOT_FOUND` · `401`

原实现里没有这个接口，前端拿单趟靠"拉全量再 `.find()`"。趟数一多就是纯浪费，
**建议一开始就实现它**——卡片渲染和故事页都只需要一趟。参考实现里已经有了。

---

### 4.3 `POST /api/journeys`

| 字段 | 类型 | 必填 | 默认 | 处理 |
|---|---|:--:|---|---|
| `title` | string | ✅ | — | `.trim()`，空 → 400 |
| `titleEn` / `title_en` | string | | `""` | `.trim()` |
| `year` | string | | 当前年份 | `.trim()` |
| `cover` | string | | `""` | `.trim()`，完整 URL 或 `kv:<key>` |
| `hint` | string | | `""` | `.trim()`，卡片底下那行小字，一句话 |
| `songUrl` / `song_url` | string | | `null` | `.trim() \|\| null` |
| `songTitle` / `song_title` | string | | `null` | 同上 |
| `songArtist` / `song_artist` | string | | `null` | 同上 |
| `songCover` / `song_cover` | string | | `null` | 同上 |
| `songDur` / `song_dur` | number | | `null` | 建议 `parseInt` 后再入库 |
| `songHue` / `song_hue` | number | | `null` | 同上，建议 clamp 到 0–360 |

`cover` 通常**不用传**——第一次 POST 带 `src` 的 stop 时会自动回填（见 [4.6](#46-post-apijourneysidstops)）。

`song*` 那几个字段，参考实现同时收 `audio*` 拼法（`audioUrl` / `audio_url` / `audioTitle` / …），
指向同一批列。响应字段叫 `audio`，写入时用哪个名字都行，不用记两套。

> ⚠️ **`year` 的默认值要用本地时区。** 服务端（尤其是 Workers / Lambda）跑在 UTC 上，
> `new Date().getFullYear()` 在跨年那几个小时会给出错误年份。要么按配置的时区算，
> 要么干脆把 `year` 设成必填。

```bash
curl -XPOST "$HOST/api/journeys" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"新西兰","title_en":"New Zealand","year":"2025",
       "hint":"南半球的秋天，从一片湖开始。",
       "song_title":"Long Way North","song_artist":"—",
       "song_dur":214,"song_hue":32}'
```

**200**：`{"id":"j_m9xk2p3_a3f9c","ok":true}`
**错误**：`400 TITLE_REQUIRED` · `401`

---

### 4.4 `PATCH /api/journeys/:id`

部分更新。**只写 body 里 `!== undefined` 的字段**——传 `null` 也算"要改成空"，
和"没传"是两回事。可改：`title`（空 → 400）、`titleEn`、`year`、`cover`、`hint`、
`songUrl` / `songTitle` / `songArtist` / `songCover` / `songDur` / `songHue`、`position`。

`updated_at` 每次自动刷成当前时间。

`position` 建议 `Number.isInteger(x) ? x : 400 BAD_POSITION`。
参考实现这里还是 `parseInt(x) ?? 0`，传 `"abc"` 会**静默变成 0**，把这一趟弹到列表中间——
知道就好，自己写的时候把这层校验补上。

**200**：`{"ok":true}`
**错误**：`400 BAD_ID` · `400 TITLE_REQUIRED` · `400 NO_FIELDS`（一个可识别字段都没有） · `404 NOT_FOUND` · `401`
（自己加了 position 校验就再多一个 `400 BAD_POSITION`）

> 404 的判据是 UPDATE 影响行数为 0。**SQLite（含 D1 的 `meta.changes`）算的是匹配到的行数**
> ——值没变也算 1，所以这个判据成立；**Postgres 的 `rowCount` 同样是匹配行数**，也没问题。
> **MySQL 是例外**：`affected_rows` 默认返回的是**实际变更行数**，把一趟改成跟原来一模一样的值
> 会返回 0，于是接口误报 404。MySQL 上要么连接时开 `CLIENT_FOUND_ROWS`，要么先 SELECT 再 UPDATE。

---

### 4.5 `DELETE /api/journeys/:id`

无请求体。**顺序有讲究**：

```js
// 1. 先把要清的存储 key 收集出来（删完就查不到了）
const keys = await collectStorageKeys(journeyId);   // stops.src + journey.cover + song_url/song_cover 里的 kv:
// 2. 事务里删两张表
await tx(async () => {
  await db.run("DELETE FROM journey_stops WHERE journey_id = ?", journeyId);
  const r = await db.run("DELETE FROM journeys WHERE id = ?", journeyId);
  if (!r.changes) throw new NotFound();
});
// 3. 事务提交后再删对象存储（失败只记日志，不回滚数据库）
await Promise.allSettled(keys.map(k => storage.delete(k)));
```

**两件必须做对的事**（原实现两件都没做，这里是修正后的形态）：

1. **必须是事务。** 不然 journey 不存在时，会先把（其实并不存在的）stops 删掉才返回 404；
   更糟的是删 stops 成功、删 journey 失败，留下一趟没有内容的空壳。
   如果你的运行时没有事务（早期 D1 的 HTTP 模式就没有），至少**先确认 journey 存在再动 stops**。
2. **必须清对象存储。** 不清就是每删一趟漏一批照片，永久堆积、永远不会有人回收。
   注意 `cover` 通常和某个 stop 的 `src` 指向同一个 key，去重后再删；
   **删之前再查一次"还有没有别的行在引用它"**（`journeys.cover / song_url / song_cover` 加
   `journey_stops.src` 四列都要查），否则两趟共用一张图时会误删。参考实现里这一步是 `releaseAsset()`
   ——它只查了前三列，`song_cover` 漏在外面，自己抄的时候顺手补上。

**200**：`{"ok":true}`
**错误**：`400 BAD_ID` · `404 NOT_FOUND` · `401`

---

### 4.6 `POST /api/journeys/:id/stops`

**先校验父 journey 存在**（`SELECT id FROM journeys WHERE id = ?`），不存在直接 404，别插孤儿行。

| 字段 | 类型 | 必填 | 默认 |
|---|---|:--:|---|
| `place` | string | ✅ | — |
| `placeEn` / `place_en` | string | | `""` |
| `date` | string | | `""` |
| `src` | string | | `""`（完整 URL 或 `kv:<key>`） |
| `note` | string | | `""` |

`position = MAX(position) + 1`（该 journey 内，空则 0）。

**两个自动副作用，都要保留：**

1. **封面回填**：如果传了 `src` **且**父 journey 的 `cover` 为空 → 把这张图设成封面。
   漏掉这条，封面就永远是空的（因为没人会专门去 PATCH 它）。
2. **刷父级时间**：无论如何都把父 journey 的 `updated_at` 刷成当前时间。

```bash
curl -XPOST "$HOST/api/journeys/j_m9xk2p3_a3f9c/stops" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"place":"蒂卡波湖","place_en":"Lake Tekapo","date":"2025.03.14",
       "src":"kv:jp_m9xk2q1_c81af",
       "note":"到的时候刚过四点。风把湖面吹成一块起雾的玻璃，蓝得不像真的……"}'
```

**200**：`{"id":"s_m9xk2q1_b7e2d","ok":true}`
**错误**：`400 BAD_ID` · `404 NOT_FOUND`（父 journey 不存在） · `400 PLACE_REQUIRED` · `401`

---

### 4.7 `PATCH /api/journeys/stops/:stopId`

可改：`place`（空 → 400）、`placeEn`、`date`、`src`、`note`、`position`。stop 自己的 `updated_at` 自动刷新。

> ⚠️ 原实现在这里**不刷父 journey 的 `updated_at`**，也不会因为改了 `src` 去更新封面——
> 和 [4.6](#46-post-apijourneysidstops) 的行为不对称。**要补齐**：改任何 stop 都刷父级
> `updated_at`（否则前端按 `updatedAt` 排序 / 做缓存失效会漏掉编辑过的趟），
> 父级 `cover` 为空、或者封面正好是被换掉那张时，同样跟着换。
> 参考实现已经补齐了，顺带把换下来的旧图交给 `releaseAsset()` 回收。

**200**：`{"ok":true}`
**错误**：`400 BAD_ID` · `400 PLACE_REQUIRED` · `400 NO_FIELDS` · `404 NOT_FOUND` · `401`

---

### 4.8 `DELETE /api/journeys/stops/:stopId`

无请求体。删除前把 `src` 里的 `kv:` key 收出来一并删掉（同 [4.5](#45-delete-apijourneysid)）。
**如果这张图正好是父 journey 的 `cover`，要把 `cover` 一起清空或改成下一处的图**，
否则封面会指向一个已删除的 key（404 图裂）。同时刷父级 `updated_at`。

不重排剩下 stops 的 position，留空洞是可接受的（见[第 3 节](#3-排序与-position-规则)）。

**200**：`{"ok":true}`
**错误**：`400 BAD_ID` · `404 NOT_FOUND` · `401`

---

### 4.9 `POST /api/journeys/upload`

| 字段 | 类型 | 必填 | 说明 |
|---|---|:--:|---|
| `src_data` / `srcData` | string | ✅ | base64。**服务端要能容忍 `data:` 前缀** |
| `mime` | string | | 默认 `image/jpeg`，随对象一起存 |

参考实现还收第二种传法：**裸二进制 body + `content-type: image/jpeg`**。浏览器端直接
`fetch(url, {method:"POST", body: file})` 就行，省掉一次 base64 编码和服务端的解码 CPU。
JSON 那条路是给脚本和 AI 用的（它们手里往往只有 base64 字符串）。

```js
// 1. 剥 data URL 前缀，顺便把 mime 读出来（调用方经常忘了剥）
const m = /^data:([^;]+);base64,/.exec(raw);
const mime = b.mime || m?.[1] || "image/jpeg";
const b64  = raw.replace(/^data:[^;]+;base64,/, "");

// 2. 尺寸闸门（判 base64 长度，不判解码后字节数：早点拦，别先解码再拒）
if (b64.length > 4_000_000) return err(413, "TOO_LARGE");   // ≈ 3 MB 原图

// 3. 解码要 try/catch —— 非法 base64 必须是 400，不是 500
let bytes;
try { bytes = decodeBase64(b64); } catch { return err(400, "BAD_BASE64"); }

// 4. MIME 白名单：别让上传端点退化成通用网盘
if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(mime)) return err(400, "BAD_MIME");

// 5. 存
const key = "jp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
await storage.put(key, bytes, { metadata: { mime, size: bytes.length, uploadedAt: Date.now() } });
```

**200**：

```json
{
  "key": "jp_m9xk2q1_c81af9",
  "ref": "kv:jp_m9xk2q1_c81af9",
  "url": "/api/journeys/photo/jp_m9xk2q1_c81af9",
  "ok": true
}
```

三个字段是同一张图的三种写法：`url` 能直接塞进 `<img src>` 看一眼对不对，
**但存进数据库的建议是 `ref`（也就是 `kv:<key>`）**，让列表接口去拼 URL：
这样以后换域名、换路径前缀、换 CDN，改一行代码就行，不用迁移数据。

**错误**：`400 BAD_BODY`（没给 base64 / body 空） · `400 BAD_BASE64` · `400 BAD_MIME` · `413 TOO_LARGE` · `401`

> 3 MB 这个上限是自己定的，不是存储层的限制。它挡的是**服务端 CPU**：base64 解码是纯计算，
> Workers 免费档单请求 CPU 时间只有几十毫秒，几 MB 的 base64 就能顶到超时。
> 你的运行时更宽松就调大，但别无限制——上传端点没有背压，一个大请求能拖垮整个 worker 实例。

---

### 4.10 `GET /api/journeys/photo/:key`

**这是不鉴权的公开端点。** 完整安全模型见 [5.4](#54-读取端点的安全模型)。

```js
if (!/^jp_[\w-]+$/.test(key)) return new Response("bad key", { status: 400 });
const obj = await storage.get(key);
if (!obj) return new Response("not found", { status: 404 });
return new Response(obj.body, {
  headers: {
    "content-type": obj.metadata?.mime || "image/jpeg",
    "cache-control": "public, max-age=31536000, immutable",
  },
});
```

- 响应是**裸二进制**，不是 JSON。错误体给 `text/plain`（`bad key` / `not found`）还是给
  `{error, code}` JSON 都行——`<img>` 两种都读不到，随你。参考实现给的是 JSON
  （`400 BAD_KEY` / `404 NOT_FOUND`），纯粹因为它顺手把 CORS 头一起带上了。
- `immutable` + 一年缓存是安全的：key 由内容唯一确定，**改图必须换 key**，不存在同 key 换内容。
- 图片不需要 Range / ETag，音频需要（见 [6.3](#63-range-请求)）。参考实现里照片和音频共用同一个
  handler，所以照片也顺带支持了 Range 和 `HEAD`——不是必需，也不碍事。
- 参考实现留了个开关 `REQUIRE_MEDIA_TOKEN=1`：打开之后这两个读取端点也要 token，
  前端所有 `<img src>` 后面得补 `?token=`。**默认是关的**，理由和代价见 [5.4](#54-读取端点的安全模型)。

---

### 4.11 可选补充接口

按需实现，基础闭环用不到：

| 方法 | 路径 | 理由 | 参考实现 |
|---|---|---|:--:|
| PATCH | `/api/journeys/:id/stops/reorder` | body `{"order":["s_a","s_b",…]}`，按下标重写 position。做拖拽排序必备 | ✅ |
| PATCH | `/api/journeys/reorder` | 同上，但重排的是整个列表（journey 之间的顺序） | ✅ |
| GET | `/api/journeys/:id/stops` | 只要某趟的停留，不拉整趟 | ✅ |
| GET | `/api/journeys/stops/:stopId` | 取单个停留，编辑页用得上 | ✅ |
| GET | `/api/journeys?limit=&offset=&stops=0` | 分页 + 不带 stops 的轻量列表 | ✅ |
| DELETE | `/api/journeys/photo/:key` | 手动清理孤儿图。参考实现在换图 / 删停留 / 删整趟时已经自动回收（`releaseAsset()`），正常用不到 | ❌ |

标 ✅ 的是 `examples/worker.js` 里已经写好的，可以直接抄。

---

## 5. 照片存储

### 5.1 方案

**对象存储 + 数据库只存 key。** 每张照片是对象存储里的一个对象，
key 形如 `jp_<ts36>_<rand6>`，数据库里存 `kv:jp_xxx`，列表接口拼成 `/api/journeys/photo/jp_xxx`。

原实现用的是 Cloudflare KV。任何对象存储都行——S3、R2、MinIO、甚至本地目录，
接口只需要三个操作：`put(key, bytes, {mime})` / `get(key)` / `delete(key)`。

**用独立的 bucket / namespace。** 别和应用里其他文件（头像、附件、别的图库）混在一个命名空间里，
理由是 [5.4](#54-读取端点的安全模型) 那条越权面。混用不是不能跑，只是把一个本可以靠"前缀校验"
关死的洞变成了"必须靠 key 猜不到"来撑。

### 5.2 为什么不塞进数据库

不建议把照片二进制（或 base64）存进 `journey_stops.src`：

1. **列表接口会被撑爆。** `GET /api/journeys` 是全量返回、内嵌所有 stops。一趟 6 张图、
   每张 300 KB base64 就是 2.4 MB，10 趟就是 24 MB 的 JSON。分页也救不了——你总要在某个
   地方一次读出一整趟的 6 张图。
2. **拿不到 CDN 缓存。** 独立的图片 URL 才能带 `immutable` 长缓存、才能被边缘节点缓存住。
   埋在 JSON 里的 base64 每次都得重传，而 JSON 本身是 `no-store`（数据要实时）。
3. **base64 白涨 33% 体积**，而且每次读都要在服务端做一次解码/编码，纯浪费 CPU。
4. **D1 / SQLite 有单行和单响应大小限制**，几 MB 的 TEXT 列会直接触到；
   Postgres 的 TOAST 能扛，但每次 `SELECT *` 都会把它拉出来。
5. **备份和迁移会变得很痛。** 数据库导出从几百 KB 变成几个 G，还没法增量。

反过来，**数据库存 key 的唯一代价是"删记录时要记得删对象"**——这就是 [4.5](#45-delete-apijourneysid)
和 [4.8](#48-delete-apijourneysstopsstopid) 里那几步。这个代价划算得多。

### 5.3 照片规格

故事页是**整屏铺满的竖图**，所以对源图有硬要求：

- **比例接近 19.5:9**（如 1290×2796）。3:4、4:3 这种"矮竖图"在长条屏上要按高度撑满，
  就得放大近两倍、左右各裁掉两成，真正用上的像素很少，看着糊。
- **短边不低于 1080。** 缩放是乘法：比例和分辨率两样都得够。
- 大小控制在上传闸门以内（默认 4,000,000 个 base64 字符 ≈ 3 MB 原图）。JPEG q85 的 1290×2796 通常在 400–800 KB。

**如果前端要做 Ken Burns（照片缓慢推近），上面这个尺寸还不够，要再乘一个动画的最大 scale**
（1290×2796 的屏、最大 scale 1.16 → 要 1500×3250）。公式和验算见[第 7 节 · 渲染侧的硬约束](#渲染侧的硬约束)。

如果照片来自图库网站，多数都支持在 URL 上挂裁剪参数（`?w=1500&h=3250&fit=crop&q=85` 之类），
直接让它输出钉死比例的图，比下载回来自己裁省事。

### 5.4 读取端点的安全模型

`GET /api/journeys/photo/:key` **不鉴权**。原因很实际：`<img>` 标签不会带 `Authorization` header，
而给图片 URL 挂 `?token=` 等于把 token 写进每一个 img src、进浏览器历史、进 Referer、进服务端访问日志。

所以安全模型是 **unlisted URL**：key 不可猜（时间戳 base36 + 6 位随机 ≈ 22 亿组合，
且要配对正确的时间戳前缀），知道 URL 的人就能看。

**这是"不公开"，不是"访问控制"。** 请在你的 README 里对使用者明说这一点。
照片里如果有不能外流的内容，就得改成签名 URL（带过期时间的 HMAC）或走 cookie 鉴权，
别指望 key 的随机性。参考实现的 `REQUIRE_MEDIA_TOKEN=1` 是个折中——它把读取端点也关进闸门，
代价是 token 得跟着每个 `<img src>` 走进 URL（[第 9 节](#9-鉴权)那条泄漏面照样成立），
比签名 URL 差，但比什么都不做强。

**必须做的一件事：校验前缀。**

```js
if (!/^jp_[\w-]+$/.test(key)) return 400;
```

只校验 `^[\w-]+$` 的话，这个**公开无鉴权**端点就能读出同一存储命名空间里的**任意对象**——
包括其他功能上传的文件。原实现就漏了这一条，是个真实的越权面。

---

## 6. 音频字段

故事页有两路声音，**这份规格一路都不提供**，两路都由使用者自己接：

| | 是什么 | 从哪来 | 不接的后果 |
|---|---|---|---|
| **配乐** | 整趟一首，循环垫底 | 数据里给一个 `song_url`（响应里是 `audio.url`）；自己传一个文件、用自己的音源、或者在前端合成 | 播放器不渲染，其余照常 |
| **旁白** | 把 `note` 念出来 | 可选，接你自己的 TTS，见 [6.5](#65-旁白语音是可选的) | 退化成纯打字机动画，**功能不缺** |

本仓库不带任何音源：参考 UI 里那段音乐是页面内用 Web Audio 现合成的，
不联网、不外链，只是为了让你打开文件就有声音。

### 6.1 设计原则：只存地址，不绑定任何音源

`song_url` 是**一个地址**，不是某个音乐平台的曲目 ID。两种取值：

- `kv:<key>` —— 自托管音频，走 `/api/journeys/audio/:key`（见 [6.3](#63-range-请求)）
- 完整 URL —— 任意公网直链

不内置任何音乐平台的搜索 / 解析 / 反代。这类做法要么依赖私有基础设施（带登录态的中转服务器），
要么直接踩版权，两条都不适合开源分发。**曲子从哪来是使用者自己的事**，这份规格只负责把地址存好、播好。

### 6.2 为什么建议自托管而不是只给个外链字段

因为 **CORS**。全屏故事页要做"念白时把背景音压低"（ducking），
而这件事在 iOS Safari / WKWebView 上**只能靠 Web Audio 的 GainNode**——
`HTMLAudioElement.volume` 在 iOS 上是只读的，赋值静默无效。

于是链路必须是 `<audio>` → `createMediaElementSource()` → `GainNode` → destination。
而 `createMediaElementSource` 一旦接上**跨域且没有 CORS 头**的音频：

> 浏览器不会报错，它会**静音**。

声音没了，控制台干净，极难 debug。这就是建议提供同源 `/api/journeys/audio/:key` 的全部理由——
同源天然没有这个问题。

如果坚持用外链，两件事：

1. README 写明"音频源必须返回 `Access-Control-Allow-Origin`，否则播放器会静音"。
2. 做降级：检测到跨域时**跳过 Web Audio、直接用裸 `<audio>`**。能出声、能 seek，
   只是 ducking 失效——比静音好得多。

### 6.3 Range 请求

`GET /api/journeys/audio/:key` **必须支持 Range，返回 206**。
不支持的话，`<audio>` 的进度条要么拖不动、要么每次 seek 都重新整段下载。

从对象存储拿到完整 buffer 后自己切：

```js
const total = buf.byteLength;
const range = request.headers.get("Range");
if (range) {
  const m = /bytes=(\d+)-(\d*)/.exec(range);
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
  if (start >= total || start > end) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "content-type": mime,
      "content-range": `bytes ${start}-${end}/${total}`,
      "accept-ranges": "bytes",
      "content-length": String(end - start + 1),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
return new Response(buf, {
  headers: {
    "content-type": mime,
    "accept-ranges": "bytes",           // ← 没有 Range 头时也要声明支持
    "content-length": String(total),
    "cache-control": "public, max-age=31536000, immutable",
  },
});
```

如果你的对象存储原生支持 Range（S3、R2 都支持），直接把 Range 头透传下去、
把 `content-range` 透传回来，别先读全量再切。

`POST /api/journeys/audio` 和照片上传同构，只有三处不同：key 前缀 `ja_`、
体积上限建议放宽到 12 MB base64（≈ 9 MB 音频，够一首 5 分钟的 128 kbps mp3）、
默认 mime `audio/mpeg`。

### 6.4 前端播放的四条硬约束

写给自带前端的接入方，四条都是踩出来的：

1. **必须 `<audio>` + `MediaElementAudioSourceNode` + `GainNode`。**
   别用 `decodeAudioData` + `BufferSource`（要等整首下载完才能出声，一首 4 分钟的曲子几秒起步，
   而且 seek 要自己拿 `ctx.currentTime` 手算，非常容易写坏）；
   也别用裸 `<audio>`（iOS 上调不了音量，ducking 做不了）。

   ```js
   const el = new Audio();
   el.crossOrigin = "anonymous";      // ← 跨域时决定成败的一行
   el.loop = true;
   el.src = journey.audio.url;

   const ctx = new (window.AudioContext || window.webkitAudioContext)();
   const src = ctx.createMediaElementSource(el);
   const gain = ctx.createGain();
   src.connect(gain).connect(ctx.destination);

   el.currentTime = ratio * el.duration;                      // seek，真能用
   el.addEventListener("timeupdate", () => setT(el.currentTime));   // 进度，不用手算
   gain.gain.setTargetAtTime(0.3, ctx.currentTime, 0.1);      // ducking，见 6.5
   ```

2. **iOS 上 AudioContext 必须在用户手势的同步调用栈里 `new` + `resume()`。**
   时机是**"打开故事页"那一次点击**，不是等到用户点播放按钮——那时可能已经隔了一个 `await`，
   手势上下文丢了，`resume()` 会被拒。

3. **卸载后的竞态要处理。** 音频加载要几秒，这期间用户可能已经关掉故事页。
   加载完成的回调必须先确认组件还活着（一个 `deadRef` 或比对当前 journey id），
   否则曲子会在一个已经关掉的页面里一直响。卸载时 `el.pause(); el.src = ""; ctx.close()`。

4. **`audio.dur` 只是占位。** 元数据加载完（`loadedmetadata`）就用 `el.duration` 覆盖它。
   保留这个字段是为了让播放器在加载完成前也能显示一个合理的总时长，不至于跳一下。

### 6.5 旁白语音是可选的

故事页翻到一处，`note` 是逐字打出来的。**配了 TTS 就同时有人念，不配就只有打字机动画**——
两种都是完整形态，没有"缺了一半"的状态，所以后端不需要为此加任何字段。

接 TTS 的话，链路就三步（**这份规格不提供 TTS，接哪家、什么声音、按句还是整段合成，都是你自己的事**）：

```
1. 前端拿到 stops[i].note（纯文本，本来就是要念的那段话）
2. 请求你自己的 TTS 端点 → 拿到一段音频（Blob / URL / ArrayBuffer 都行）
3. 播这段音频，同时把配乐 duck 到 0.3；念完（`ended`）再拉回 1.0
```

三条要留意的：

- **duck 的对象是配乐那条 GainNode**，不是旁白自己的音量。两路声音同时全音量放一定打架，
  人声会被垫底的音乐盖住。0.3 是够用的经验值（参考 UI 用的是 0.32）。
  两个方向都用 `gain.gain.setTargetAtTime(narrating ? 0.3 : 1, ctx.currentTime, 0.12)`，
  **别直接给 `gain.value` 赋值**——一刀切下去会有可闻的咔哒声。
- **打字机的节奏跟着音频走，不要各跑各的。** 最省事的做法是拿到音频时长以后按字数均分，
  字打完 = 话念完。两边各用一套定时器，翻页快一点就会看到"字打完了人还在念"。
- **翻页 / 关页面要立刻停。** 停旁白（`pause()` + 置空 src）、取消还没回来的 TTS 请求
  （`AbortController`）、把配乐拉回 1.0。漏掉最后一条，音乐会永远停在被压低的音量上。

---

## 7. 前端消费契约

后端只要满足这张表，任何前端都能接上。

**卡片（聊天流里那一张）需要：**

| 字段 | 用途 | 缺失时 |
|---|---|---|
| `cover` | 卡片背景图 | 显示占位底色 |
| `title` | 主标题 | 必填，不会缺 |
| `titleEn` | 副标题（小字） | 省略这一行 |
| `year` | 元信息行 | 省略 |
| `stops.length` | 元信息行"N 处停留" | 显示 0 |
| `hint` | 卡片底下那行小字 | **回落到前端 CONFIG 里的默认句子**，见下 |

卡片上其余的固定文案（前缀语、kicker、标题模板）**不来自后端**，在前端的 CONFIG 块里，
使用者自己改成想要的名字和句子。后端不掺和文案。

**`hint` 是个例外，规则是"数据优先"：**

```js
const hint = journey.hint || CONFIG.cardHint;
```

这一行就是全部。之所以让它能从数据来，是因为这行小字最适合**每趟写一句**——
跟着那趟的情绪走（去看雪和去看海不该是同一句），由建这趟的人或 AI 顺手写掉；
CONFIG 里那句只是数据没给时的兜底。**兜底那句请自己写**，别沿用示例里的——
它是示例，不是默认值。

**全屏故事页需要：**

| 字段 | 用途 |
|---|---|
| `stops[i].src` | 铺满整屏的背景照片 |
| `stops[i].place` | 顶部地名（大字） |
| `stops[i].placeEn` | 顶部地名上方的小字 |
| `stops[i].date` | 顶部日期 |
| `stops[i].note` | 左下角那段话。**长文本，要能滚动 / 展开** |
| `audio.title` / `audio.artist` | 底部播放器的曲名和艺人 |
| `audio.url` | 播放源 |
| `audio.dur` | 加载完成前的占位总时长 |
| `audio.hue` | 播放器主色调：`oklch(0.62 0.13 <hue>)` |
| `stops.length` | 底部圆点数量 |

`hue` 是整数 0–360，前端直接拼进 `oklch()`。用 oklch 而不是 hsl 是因为
**同一个亮度/饱和度参数在不同色相下的观感亮度是一致的**——换 hue 不会让某些颜色突然刺眼、
某些又发灰。缺省 32 是暖橙。

### 渲染侧的硬约束

下面三条**不属于后端契约**——接口全对、数据全对，照样能踩。但不遵守，成品就一定难看，
而且三条都很难靠"看代码"发现（第一条尤其反直觉）。
这里只写结论，症状、根因和完整 CSS 见 **[INTEGRATE.md](INTEGRATE.md) 第 6 节「不抄会踩坑」**。

**① 压在照片上的正文，用贴字的紧阴影**

```css
text-shadow: 0 1px 2px rgba(0,0,0,.9), 0 0 5px rgba(0,0,0,.45);
```

反例是 `0 2px 14px rgba(0,0,0,.6)` 这种大模糊。14px 的模糊半径配 21–28px 的行距，
**相邻两行的阴影会在行间叠加**，糊成一整块均匀的灰雾——看上去像给这段文字加了个半透明灰底框。

这个坑反直觉的地方在于：**CSS 里根本没有 `background`**，只看代码永远找不到那个"框"是谁画的。
收起态（4 行）和展开态（整段长文）都会出现，行数越多越明显，
所以紧阴影**要写在基础样式上**，不要只在展开态覆盖。

**② 要做 Ken Burns，源图必须比屏幕大一圈**

照片缓慢推近（`scale` 1.04 → 1.16）时，图会被放大到超过屏幕。源图不够大就是在拉伸像素，
边缘先糊。所需尺寸是可推导的：

```
目标尺寸 = 屏幕物理像素 × 动画的最大 scale
```

以 19.5:9 的 1290×2796 屏、最大 scale 1.16 为例：

```
1290 × 1.16 ≈ 1500        2796 × 1.16 ≈ 3250      →  要 1500×3250 的图
```

验算：1500 宽的图 `cover` 进 1290 宽的屏，先缩到 **0.86**；再被动画推到 **1.16 倍**；
净值 `0.86 × 1.16 = 0.998 < 1`——一个像素都没有被拉伸，刚好卡在原尺寸以内。

**动画幅度不是 1.16 就按自己的最大 scale 重算**，别直接抄 1500×3250 这个数字。
屏幕尺寸同理，**不要硬编码某个机型**：1290×2796 是覆盖大多数现役手机的通用默认值，
真要准，问一句"你用什么手机"，或者让对方截张图看真实分辨率，按那个算。

**③ 放大要有地方长**

卡片上那排竖条照片（横向磁力轮播），划到中间那张会放大。这里有两个容易做错的地方：

- **容器高度必须留余量。** 例：竖条静止 188px、划到中间放大到 276px，容器就得给 284px。
  容器高度正好等于放大后的高度 = 白放大一场，一点"顶出来"的劲儿都没有。
- **左右溢出卡片是刻意的。** 最边上那张被卡片边缘切掉半张，是要的效果，不是 bug，
  别去加 `overflow: hidden` 或者把 padding 调到刚好放得下——切一半才有"这排还长着呢"的感觉。

放大的同时要**加重阴影 + 抬 `z-index`**。"浮起来"这件事是靠影子说话的，
光把尺寸放大而阴影不变，看着只是"这张比较大"，不是"这张浮在上面"。

---

## 8. 错误处理

响应体统一：

```json
{ "error": "文件太大（base64 上限 4000000 字符），先压一压", "code": "TOO_LARGE" }
```

`error` 是给人看的（语言随你），`code` 是给程序看的（稳定、不随文案变）。
原实现只有中文 `error` 字符串，前端要判具体错误就只能匹配中文——**加一个 `code` 字段，
两行代码，省掉所有这类麻烦**。

| HTTP | `code` | 触发条件 |
|:--:|---|---|
| 400 | `BAD_ID` | 路径参数不匹配 `^[\w-]+$`，或落在保留字上（`upload` / `audio` / …） |
| 400 | `BAD_KEY` | 存储 key 前缀不对（照片必须 `jp_`、音频必须 `ja_`），见 [5.4](#54-读取端点的安全模型) |
| 400 | `TITLE_REQUIRED` | 建 / 改 journey 时 `title` 为空 |
| 400 | `PLACE_REQUIRED` | 建 / 改 stop 时 `place` 为空 |
| 400 | `NO_FIELDS` | PATCH 请求里一个可识别字段都没有 |
| 400 | `BAD_BASE64` | 上传的 base64 解不开 |
| 400 | `BAD_MIME` | 上传的类型不在白名单里（图片 / 音频各一张） |
| 400 | `BAD_BODY` | body 空、`order` 不是数组、`src_data` 不是字符串之类 |
| 401 | `UNAUTHORIZED` | token 缺失或不对 |
| 404 | `NOT_FOUND` | 目标 journey / stop / 对象不存在，或路径不存在 |
| 405 | `METHOD_NOT_ALLOWED` | 路径对、方法不对 |
| 413 | `TOO_LARGE` | 超过上传体积闸门（照片 4 MB base64 / 音频 12 MB base64） |
| 416 | — | Range 越界（响应无 body） |
| 500 | `INTERNAL` | 其它 |

两条原则：

- **请求体 JSON 解析失败不要抛 500。** `await request.json().catch(() => ({}))`，
  然后让字段校验自然报 `TITLE_REQUIRED` 之类，或者显式返回 `400 BAD_BODY`。
- **base64 解码必须 try/catch。** 这是最常见的 500 来源：调用方忘了剥 `data:` 前缀，
  解码函数直接抛异常。用户看到的是"服务器炸了"，实际上是他自己传错了——应该告诉他这一点。

照片 / 音频读取端点的错误体给 `text/plain`（`bad key` / `not found`）还是给同样的 JSON 都行——
`<img>` / `<audio>` 都读不到 body。参考实现给的是 JSON，只是为了跟其余接口共用一套 CORS 头。

---

## 9. 鉴权

**单个共享 token**，环境变量注入，没有用户体系、没有过期、没有刷新。

```js
function authed(request, env) {
  const secret = env.AUTH_TOKEN || "";
  if (!secret) return false;                                    // 没配 token 就一律拒，别裸奔
  const auth = request.headers.get("Authorization") || "";
  let t = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!t) t = new URL(request.url).searchParams.get("token") || "";   // 兜底，见下方告警
  return safeEqual(t, secret);                                  // 定长比较，别用 ===
}
```

**第一行不能省。** 环境变量漏配（secret 是空串）+ 请求不带 token（也是空串），
定长比较的第一步通常是比长度——`0 === 0`，循环一次都不跑，直接返回"相等"，整套接口就裸奔了。
与其去推自己那个写法会不会漏，不如开头显式挡掉。

这套东西的典型部署是"一个人（或一对人 + 一个 AI）自己用"，单 token 完全够，
也省掉了整个用户系统。要接进已有的多用户应用，把 `authed()` 换成你自己的会话校验即可——
**其余接口一行都不用改**（数据模型里没有 `user_id`；真要多租户，两张表各加一列，
所有查询加一个 `WHERE user_id = ?`）。

**闸门位置：除了 `/api/journeys/photo/:key` 和 `/api/journeys/audio/:key`，
所有路由都在鉴权之后。** 这两个读取端点要在闸门之前放行，理由见 [5.4](#54-读取端点的安全模型)。

### `?token=` 的告警

支持 query string 里带 token 是因为 `<iframe>` / `<img>` 带不了 header。
**这是个真实的泄漏面，务必在面向使用者的文档里说清楚：**

- token 会进服务端访问日志、进 CDN 日志
- 会进浏览器历史
- 页面跳转时会经 `Referer` 泄给第三方站点

能用 header 的地方就用 header。真需要给浏览器直接加载的 URL 鉴权，
更好的做法是 **HttpOnly cookie**（同源自动带上，不进 URL），或者**短期签名 URL**。
`?token=` 是最省事的那个选项，不是最好的那个。

其它两条：

- token 请用足够长的随机串（32 字节以上），别用容易猜的。
- 上面那个 `safeEqual` 就是**定长比较**：先比长度，再逐字符异或累加，最后一次性判 0。
  能用 `crypto.timingSafeEqual` 就直接用。`===` 会在第一个不同的字符处短路，
  有理论上的时序侧信道——这个场景下风险很低，但也没有理由不做对。

---

## 10. 卡片标签协议（可选）

如果这套东西要接 AI——让模型自己建一趟旅行、然后在回复里发出卡片——用一个内联标签就够：

```
……写完那段话之后，落一个标签：
<journey>{"id":"j_m9xk2p3_a3f9c"}</journey>
```

前端在渲染消息时：

1. 用正则把正文切成 `[{type:"text", …}, {type:"journey", id}, …]`
2. `JSON.parse` 标签内容，要求有 `id`；解析失败就当普通文本，别让一个坏标签炸掉整条消息
3. 拿 id 去 `GET /api/journeys/:id`（原实现是拉全量再 find，那是因为当时没有单趟接口），
   拿到就渲染卡片，拿不到就渲染"载入中"，缓存一份避免重复请求
4. **朗读 / 摘要 / 复制纯文本时要先把标签剥掉**，不然会念出一串 JSON

模型建一趟的调用序列：

```
1. POST /api/journeys                → 拿 journey id；hint 就在这一步顺手写掉
2. 对每一处：
   a. POST /api/journeys/upload      → 传照片 base64，拿 key
   b. POST /api/journeys/<id>/stops  → src 填 'kv:<key>'
3. 在回复正文里落 <journey>{"id":"<id>"}</journey>
```

`hint` 是卡片底下那行小字，**建议每趟让模型自己写一句**，跟着这趟的情绪走；
不写就回落到前端的默认文案，不影响流程（见[第 7 节](#7-前端消费契约)）。

给模型的具体写作指引（挑什么地方、`note` 怎么写、`hint` 什么口吻、照片什么比例）
不属于后端契约，是提示词的事，不在这份文档里。

---

## 11. 实现顺序建议

按这个顺序做，**每一步做完都能看到东西**，不用等全套写完才第一次跑起来。

### 第 0 步：建表（10 分钟）

跑 [2.4](#24-建表-sqlsqlite--d1) 的 SQL。手动 `INSERT` 一趟 + 两处，`src` 直接填一个公网图片 URL。
这一步的产出是"数据库里有东西了"。

### 第 1 步：`GET /api/journeys`（半小时）—— 到这里就能看见完整的 UI

只做这一个只读接口，加上鉴权。**做完就能把参考前端接上，卡片和全屏故事页全都能看**，
因为前端只依赖这一个接口的数据形状。

先不做上传：`src` 填公网图片 URL，`song_url` 填一个公网 mp3 直链（或干脆留空）。
**这一步是整个实现的分水岭**——UI 一出来，后面所有工作都有得验证了。

自检：

```bash
curl -s "$HOST/api/journeys" -H "Authorization: Bearer $TOKEN" | jq '.journeys[0] | {id,title,cover,audio,stops:(.stops|length)}'
```

要点全在字段映射上：`title_en` → `titleEn`、`kv:` 前缀转 URL、`audio` 对象的组装和判空
（见 [4.1](#41-get-apijourneys)）。这里错一个字段，前端就是空白，别急着往下走。

### 第 2 步：`POST /api/journeys` + `POST /api/journeys/:id/stops`（半小时）

写入闭环。做完就能用 curl 造一整趟，不用再手写 SQL。
两个容易漏的点：journey 的 `position = MIN - 1`、stop 的**封面自动回填**。

自检：建一趟、加三处、`GET` 回来看顺序对不对、`cover` 是不是自动等于第一处的 `src`。

### 第 3 步：照片上传 + 读取（一小时）

`POST /api/journeys/upload` + `GET /api/journeys/photo/:key`。
到这里就不依赖外部图床了，可以传自己的照片。

三件必须做对：**剥 `data:` 前缀**、**base64 解码 try/catch**、**读取端点校验 `^jp_` 前缀**。

自检：

```bash
B64=$(base64 -i photo.jpg | tr -d '\n')
KEY=$(curl -s -XPOST "$HOST/api/journeys/upload" -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d "{\"src_data\":\"$B64\"}" | jq -r .key)
curl -sI "$HOST/api/journeys/photo/$KEY" | head -3   # 期望 200 + image/jpeg
curl -sI "$HOST/api/journeys/photo/xx_notaphoto"     # 期望 400（前缀不是 jp_）
```

### 第 4 步：PATCH / DELETE（一小时）

改和删。删的时候记得**事务** + **清对象存储**（见 [4.5](#45-delete-apijourneysid)）。
到这里 CRUD 齐了，可以做编辑页。

### 第 5 步：音频（两小时）

`POST /api/journeys/audio` + `GET /api/journeys/audio/:key`（**带 Range**）。

自检 Range 是否真的对：

```bash
curl -sI -H "Range: bytes=100-199" "$HOST/api/journeys/audio/$KEY" | grep -i 'content-range\|^HTTP'
# 期望：HTTP/1.1 206 / content-range: bytes 100-199/<total>
```

Range 不对，前端表现就是"进度条拖不动"——而不是报错，所以务必用 curl 单独验一次。

前端那边照 [6.4](#64-前端播放的四条硬约束) 的四条接。iOS 上一定要用真机验一次
（Simulator 的音频行为和真机不一样）。

### 第 6 步（可选）：单趟接口、reorder、分页

`GET /api/journeys/:id` 建议早点做（省掉"拉全量再 find"）。
`reorder` 和分页等到真的觉得慢了再说。

---

## 12. 明确不做的事

写下来是为了省掉重复的讨论：

- **不做用户系统。** 单 token。要多租户自己在数据模型上加一列。
- **基础契约不做分页。** 几十趟以内全量返回没有任何问题。
  （参考实现顺手加了 `?limit=&offset=&stops=0`，不传参数时行为完全一样。）
- **不做草稿 / 版本 / 回收站。** 删了就是删了，包括对象存储里的照片。
- **不做图片处理。** 不缩放、不转格式、不生成缩略图。上传什么存什么，
  裁剪和压缩在客户端或图源那边做完。
- **不带音源、不接任何音乐服务。** 只存地址，曲子自己准备（[第 6 节](#6-音频字段)）。
- **不带 TTS。** 旁白语音接你自己的；不接就是纯打字机动画，功能不缺（[6.5](#65-旁白语音是可选的)）。
- **不校验 `year` / `date` / `hint` 的格式。** 它们是纯展示文本，原样存原样返回。
- **不限制 stop 数量。** 6 处是约定，不是约束。

---

## 附：从原实现迁移

如果你手上是这套东西的早期版本，有三处差异，一次 `ALTER TABLE` 加一次响应层改动就完了。

**1. 曲目 ID → 音频地址。** 早期版本存的是某音乐平台的 `song_id`，靠一个带登录态的中转服务解析播放。
这份规格只认地址，所以：

```sql
ALTER TABLE journeys ADD COLUMN song_url TEXT;   -- 完整 URL 或 'kv:<key>'
-- song_id 无法自动转成地址（曲目 ID 换个平台就没意义），只能重新填
-- journey_stops 上那套 stop 级的 song_* 列是历史包袱，直接删：曲子挂在 journey 上
```

**列名保持 `song_*` 不用改**——响应字段叫 `audio`，映射只在一个函数里（见 [4.1](#41-get-apijourneys)），
为了名字好看去做一次列改名不划算。

**2. 响应加 `audio`，`song` 留成别名。** 两个键指向同一个对象，老前端照旧能跑，新前端只读 `audio`。

**3. 加 `hint` 列。**

```sql
ALTER TABLE journeys ADD COLUMN hint TEXT NOT NULL DEFAULT '';
```

老数据全是空串，前端会自动回落到默认文案，不用回填。
