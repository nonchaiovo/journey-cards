# 接进你自己的前端

这个仓库不是 npm 包，也不是组件库。它是**一份数据契约 + 一份可以照抄的参考实现**——
你的存储能存下一段 JSON，你的前端就能把它渲染成一趟点得开的旅行。

框架无所谓。下面第 5 节给了 React / Vue / 原生三段骨架，加起来不到 80 行。

## 目录

1. [数据契约：只有这一件事是硬的](#1-数据契约只有这一件事是硬的)
2. [三块 UI，只有一块是必须的](#2-三块-ui只有一块是必须的)
3. [从参考实现里抄哪几段](#3-从参考实现里抄哪几段)
4. [样式隔离](#4-样式隔离)
5. [React / Vue / 原生](#5-react--vue--原生)
6. [不抄会踩坑](#6-不抄会踩坑)
7. [接完之后自检](#7-接完之后自检)

---

## 1. 数据契约：只有这一件事是硬的

一趟旅行 = 一个 journey + 若干 stop。渲染层只认这个形状：

```json
{
  "id": "j_m9xk2p3_a3f9c",
  "title": "新西兰",
  "titleEn": "New Zealand",
  "year": "2025",
  "hint": "南半球的秋天，从一片湖开始。",
  "cover": "https://your-host/photo/tekapo.jpg",
  "audio": {
    "url": "https://your-host/audio/long-way-north.mp3",
    "title": "Long Way North",
    "artist": "—",
    "dur": 214,
    "hue": 32
  },
  "stops": [
    {
      "id": "s_1",
      "place": "蒂卡波湖",
      "placeEn": "Lake Tekapo",
      "date": "2025.03.14",
      "src": "https://your-host/photo/tekapo.jpg",
      "note": "到的时候刚过四点。风把湖面吹成一块起雾的玻璃，蓝得不像真的。你蹲在岸边试水温，说凉得像薄荷。我们就在那儿站到天完全黑下来，然后抬头，看见了整条银河。"
    },
    {
      "id": "s_2",
      "place": "摩拉基",
      "placeEn": "Moeraki Boulders",
      "date": "2025.03.17",
      "src": "https://your-host/photo/moeraki.jpg",
      "note": "退潮之后，那些圆石头一颗一颗从沙里露出来，像谁把一整袋弹珠忘在了海边。你挑了最大的一颗坐上去，浪一漫过来就没过了鞋。我说会湿，你说湿了才算来过。"
    }
  ]
}
```

**必填 / 可选：**

| 字段 | 必须 | 缺了会怎样 |
|---|:--:|---|
| `stops[].src` | ✅ | 竖屏照片。没有它就没有这个功能 |
| `stops[].note` | ✅ | 故事页正文，也是念白念的内容 |
| `stops[].place` | ✅ | 顶部大字 |
| `stops.length` | ✅ | 底部圆点数量。建议 3–8 |
| `title` | ✅ | 卡片主标题 |
| `stops[].placeEn` / `date` | ○ | 顶部两行小字，缺了就不渲染那一行 |
| `titleEn` / `year` | ○ | 卡片副标题，同上 |
| `cover` | ○ | 卡片背景；缺了拿第一处的 `src` 顶上 |
| `audio` | ○ | **整个给 `null`，播放器就不渲染**，故事页照样能看 |
| `hint` | ○ | 卡片底下那行小字。缺了才回落到前端配置里的默认值（见[坑 6](#坑-6卡片底下那行小字是别人写的话)） |
| `id` / `position` / `createdAt` | ○ | 只跟你自己的存储有关，渲染用不到 |

（曲子那个对象叫 `audio`。参考实现为了兼容老前端还会同时给一个同值的 `song` 键，
新代码只读 `audio`，别两个都判。）

**数据从哪来无所谓。** REST、GraphQL、一个静态 JSON 文件、甚至写死在前端常量里
（参考实现就是写死的）——渲染那一层不关心。

`SPEC.md` 那套两张表 + 9 个接口，是**"要让 AI 自己攒一趟"时的完整版**：它得能建 journey、
逐处传照片、拿到 id 落进回复里。如果你只想手动放几趟进去展示，你连数据库都可以不要。

一条要先说清楚：**本项目不带任何音源，也不带任何语音。** `audio.url` 是你自己的地址，
旁白语音（TTS）配不配都行——细节见[坑 4](#坑-4音乐和念白一起响两边都听不清)。

---

## 2. 三块 UI，只有一块是必须的

| UI | 必须吗 | 说明 |
|---|:--:|---|
| **全屏故事浮层** | **必须** | 这就是这个功能本身：照片铺满、地名在顶、念白在正中一句句打出来、落定后收到左下角、底部播放器和圆点、左右滑翻页。省掉它，剩下的只是一个相册。 |
| 聊天入口卡片 | 可换 | 只是"点进去"的那个入口。参考实现做成了一排竖条照片 + 磁力轮播；换成一张封面图、一个列表项、一行带缩略图的链接，都成立。你的 app 里没有聊天流的话，就用你自己的入口。 |
| 管理编辑页 | 可不要 | 参考实现里**没有**。如果每一趟都是 AI 建的，你可能一辈子用不上。真要做，需要的接口 SPEC §4.4 / §4.5 / §4.7 / §4.8 / §4.11（PATCH、DELETE、reorder）都已经写好了。 |

入口卡片也可以只要一半：保留卡片外壳（标题 / 副标题 / 那行小字），把磁力轮播换成一张静态封面，
`bindCard()` 那一整段就不用抄。

---

## 3. 从参考实现里抄哪几段

`examples/journey-cards.html` 是一个自包含单文件。想要什么效果，去下面这张表里对着拿。

**故事浮层（必须那块）：**

| 想要的效果 | CSS | JS |
|---|---|---|
| 照片铺满 + 缓慢推近（Ken Burns） | `.jstory-photo` `.jstory-photo-bg` `@keyframes jstoryKen` | `renderStop()` 里"重启 Ken Burns"那一行 |
| 照片再亮字也看得清 | `.jstory-centerscrim` | — |
| 一句一句打出来的念白 | `.jstory-narr` `.jstory-narr-line` `.jstory-narr-cursor` | `typewriter()` `splitSentences()` |
| 念完落到左下角、长文能滚 | `.jstory-settled` `.jstory-settled-note` | `onNarrDone()` |
| 展开 / 收起按钮该不该出现 | `.jstory-settled-more` | `onNarrDone()` 最后三行（量真实高度，别按字数估） |
| 顶部地名 / 日期，点地名重播 | `.jstory-cap` `.jstory-cap-place` `.cap-replay-hint` | `replayNarration()` |
| 左右滑切换 | — | `bindStory()` 里 `photo` 那三个 pointer 监听 |
| 底部圆点 | `.jstory-dots` | `renderDots()` `navStop()` |
| 播放器外壳 / 进度条 / 均衡器 | `.jstory-foot` `.jstory-player*` `.jstory-eq` | `startProgress()` `fmtTime()` |
| 进度条手指点得中、拖得动 | `.jstory-player-track::before`（把 3px 的线撑成 25px 热区） | `SEEK` `seekRatioFromEvent()` `previewSeek()` |
| 念白时把音乐压低 | — | `duck()` |
| 一次"打开"的生命周期，关掉后不留声音 | — | `STORY.session` `newSession()` `clearTimers()` `later()` `closeStory()` |
| 刘海 / 小黑条不挡内容 | 所有带 `env(safe-area-inset-*)` 的那几处 | — |
| 桌面上不要把竖图裁成一条 | `@media (min-width: 760px)` 那一段 | — |

**入口卡片（可换那块）：**

| 想要的效果 | CSS | JS |
|---|---|---|
| 卡片外壳（毛玻璃、标题三行、底下小字） | `.jcard` `.jcard-head` `.jcard-kicker` `.jcard-title` `.jcard-sub` `.jcard-hint` | `renderChat()` |
| 一排竖条照片 + 磁力轮播 | `.mc-row` `.mc-bar` `.mc-bar-label` | `bindCard()` |
| 窄屏能横划、且不吃掉竖向滚动 | `.mc-row` 那几条注释里写了为什么不能写 `touch-action` | — |
| 主题色跟着每趟数据变 | `--jc-accent` | `OKLCH_OK` 那三行（老浏览器不认 `oklch()` 时的兜底） |

**不用抄的：**

| 这些是什么 | 为什么在文件里 | 你换成什么 |
|---|---|---|
| `SCENES` `svgURI()` `rng()` `grad()` `PHOTOS` `photoOf()` | 现画的假照片，为了断网也能跑 | `stop.src` 直接用真 URL |
| `buildLoopBuffer()` 和 `AUDIO` 里 BufferSource 那一套 | 现合成的假音乐，同上 | `<audio>` + `MediaElementSource` + `GainNode`，见 SPEC §6.4 |
| `.page*` `.row` `.bubble` `.who` `CONFIG.demoAsk/demoReply` | demo 的聊天骨架 | 你自己的聊天流 |

---

## 4. 样式隔离

### 现状（先说清楚，免得你以为已经隔离好了）

- **CSS 变量已经全部带前缀**（`--jc-bg` `--jc-accent` `--jc-serif`……）✅
- **类名没有统一前缀** ❌
  - `.jcard*` / `.jstory*` 够独特，撞车概率极低；
  - `.mc-row` `.mc-bar` `.mc-bar-label` `.cap-replay-hint` 是半吊子；
  - `.page` `.row` `.bubble` `.who` 是**裸名**——这几个是 demo 骨架，本来就不该抄进去。
- 文件顶部有 `* { box-sizing: border-box }` 和 `html, body {…}` `body {…}`——
  **全局重置，原样抄进宿主一定打架。**

### 抄之前先改名

一次性替换掉就干净了（`@keyframes` 的名字会被同一条规则一起改，定义和引用同时变，没有副作用）：

```bash
sed -E -e 's/jstory/jc-story/g' \
       -e 's/jcard/jc-card/g' \
       -e 's/mc-bar/jc-rail-item/g' \
       -e 's/mc-row/jc-rail/g' \
       -e 's/cap-replay-hint/jc-replay-hint/g' \
       examples/journey-cards.html > /tmp/jc.html
```

### 重置收进容器，不要放 `:root` / `body`

```css
/* 两处都要写：浮层通常会被挂到 body 下（见下），那时它不在 .jc-root 里面 */
.jc-root, .jc-root *,
.jc-story-overlay, .jc-story-overlay * { box-sizing: border-box; }

.jc-root {
  font-family: var(--jc-sans);
  font-size: 15px;
  line-height: 1.6;
  color: var(--jc-text);
}
```

`--jc-*` 变量留在 `:root` 上最省事。要收窄的话同理——**`.jc-root` 和 `.jc-story-overlay` 两处都得定义**，
只写一处，浮层里所有 `var()` 会拿不到值。

### 层叠：把浮层挂到 `document.body` 下

参考实现是 `position: fixed; inset: 0; z-index: 120`。嵌进宿主 app 会遇到两件事：

1. 宿主的顶栏 / 底栏 / Toast 如果 `z-index` 比它高，就直接盖在浮层上；
2. 更阴的一个：**宿主任何一个祖先节点带 `transform`、`filter`、`contain`、`will-change`，
   `position: fixed` 就不再相对视口定位，而是相对那个祖先**——浮层于是缩在聊天气泡那一小块里。
   聊天列表为了性能加个 `will-change: transform` 是很常见的事。

两个问题一个解法：**渲染时把浮层节点 portal 到 `document.body` 下**
（React `createPortal`、Vue `<Teleport to="body">`、原生就直接 `document.body.appendChild`）。
比调 `z-index` 稳得多。

### 字体继承

浮层里的字都显式写了 `var(--jc-serif)` / `var(--jc-mono)` / `var(--jc-sans)`，
宿主换字体不会串。但如果宿主有 `* { font-family: … !important }` 这种，
`!important` 会赢——遇到了就在自己的规则上也加，或者干脆别用全局 `*`。

### 滚动锁

参考实现打开时 `document.body.style.overflow = "hidden"`，关闭时置空。
宿主 app 通常自己有一套滚动锁（尤其带虚拟列表的聊天流），**用宿主的那一套，别两套一起改**——
关闭时会互相把对方的还原值覆盖掉，最后 body 卡在 hidden 上，整个页面滚不动了。

浮层内部可滚的区域（那段长 note）自己要写 `overscroll-behavior: contain`，
不然滚到底会把滚动继续传给背后的页面。

---

## 5. React / Vue / 原生

三段骨架都只演示**最容易写坏的那三件事**：portal、生命周期失效标记、定时器清理。
剩下的结构照抄参考实现的 HTML。

### React

```jsx
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export function JourneyStory({ journey, onClose }) {
  const [i, setI] = useState(0);
  const [settled, setSettled] = useState(false);   // 念完了没有
  const stop = journey.stops[i];
  const alive = useRef(true);                      // ← 对应参考实现的 session.dead

  useEffect(() => () => { alive.current = false; }, []);

  // 念白：换一处就重开一条定时器链，清理函数负责断链
  useEffect(() => {
    setSettled(false);
    const timers = [];
    typewriter(stop.note, {
      schedule: (fn, ms) => timers.push(setTimeout(fn, ms)),
      onDone: () => { if (alive.current) setSettled(true); },
    });
    return () => timers.forEach(clearTimeout);
  }, [stop]);

  return createPortal(
    <div className="jc-story-overlay"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="jc-story">
        <div className="jc-story-photo">
          {/* key 一变节点重建，Ken Burns 自动从头开始 ——
              省掉参考实现里 void el.offsetWidth 那种强制重排的写法 */}
          <div key={stop.id}
               className="jc-story-photo-bg"
               style={{ backgroundImage: `url("${stop.src}")` }} />
          <div className="jc-story-centerscrim" />
          {/* 顶部地名 / 正中念白 / 落定后的左下角段落 / 底部播放器：结构照抄参考实现 */}
        </div>
      </div>
      <Dots n={journey.stops.length} i={i} onPick={setI} />
    </div>,
    document.body        // ← 别省这一句，理由见 §4「层叠」
  );
}
```

### Vue 3

```vue
<script setup>
import { ref, watch, onBeforeUnmount } from "vue";
const props = defineProps({ journey: Object });

const i = ref(0), settled = ref(false);
let timers = [];
const clearAll = () => { timers.forEach(clearTimeout); timers = []; };

watch(() => props.journey.stops[i.value], (stop) => {
  clearAll();
  settled.value = false;
  typewriter(stop.note, {
    schedule: (fn, ms) => timers.push(setTimeout(fn, ms)),
    onDone: () => (settled.value = true),
  });
}, { immediate: true });

onBeforeUnmount(() => { clearAll(); stopMusic(); });   // 少了这行，关掉之后歌还在响
</script>

<template>
  <Teleport to="body">                                 <!-- 等价于 createPortal -->
    <div class="jc-story-overlay">
      <div class="jc-story">
        <div class="jc-story-photo">
          <div class="jc-story-photo-bg"
               :key="journey.stops[i].id"
               :style="{ backgroundImage: `url(&quot;${journey.stops[i].src}&quot;)` }" />
          <div class="jc-story-centerscrim" />
          <!-- 其余结构照抄参考实现 -->
        </div>
      </div>
    </div>
  </Teleport>
</template>
```

### 原生

参考实现本身就是原生的，拿 `examples/journey-cards.html` 改三处即可：

```js
// 1) 删掉 ③「假照片」整节（SCENES / svgURI / rng / grad / PHOTOS / photoOf），
//    渲染时把 photoOf(stop) 换成 stop.src。

// 2) ②「数据」那个写死的 JOURNEY 常量换成真数据：
const res = await fetch(API_BASE + "/api/journeys", {
  headers: { Authorization: "Bearer " + TOKEN },
});
const { journeys } = await res.json();

// 3) ⑥「音乐」整节换成 <audio> + MediaElementSource + GainNode（SPEC §6.4 有完整片段）。
//    duck() / togglePlay() / 进度条那些外壳都不用动，只换"声音是怎么出来的"那一层。
```

---

## 6. 不抄会踩坑

这一节是全文最值得看的。每条都是真踩出来的，而且大部分**只看代码找不到**。

### 坑 1：文字底下多出一块灰板——可 CSS 里根本没有 background

**症状**　压在照片上的正文，看着像被塞进了一个半透明灰色方块里。翻 DOM、翻 CSS，
那一段一个 `background` 都没写。收起态（4 行）就有，长文展开更明显。

**根因**　`text-shadow` 的模糊半径大于行距。`0 2px 14px` 意思是每个字往外糊 14px，
而正文行距只有 21–28px——上一行的阴影铺到下一行的字上，下一行又铺回来，
整段的阴影在行与行之间连成一片均匀的灰。

反直觉的地方在这儿：视觉上它是一个"背景块"，但它不是任何一个元素的背景，
是几十个字的阴影**逐行叠加**出来的。按"去找那个 background"的思路查，永远查不到。
而且单行的时候完全正常，设计稿上看不出来，只有真塞进一段五六句的 note 才现形。

**怎么办**　换成贴字的紧阴影，**写在基础样式上**：

```css
text-shadow: 0 1px 2px rgba(0,0,0,.9), 0 0 5px rgba(0,0,0,.45);
```

第一层给字勾一圈几乎不糊的深边（1–2px，压得住任何亮照片），
第二层 5px 是极轻的一圈托底——比任何正常行距都小，叠不起来。

两个要点：

- **别只写在展开态上。** 收起态只有 4 行，照样够叠。紧阴影写在基础样式上，展开态不再覆盖。
- **判断标准是"模糊半径有没有超过行距的一半"，不是"哪一块地方"。** 正中那行念白是
  21px 字配 `line-height: 2`（42px 行距），16px 的模糊够不到上下行，留着大光晕没问题；
  行距一收窄就得跟着换。
- 想更抗亮底就**加不透明度**（`.9` → `1`），**别加模糊半径**——加模糊就是在往回踩这个坑。

### 坑 2：加了 Ken Burns，照片变糊了

**症状**　静止时很锐的照片，一开缓慢推近的动画就越推越糊，最后一帧像被拉过。

**根因**　`background-size: cover` 只保证图**刚好**铺满，不多一个像素。
再 `scale(1.16)` 就是把已经 1:1 的像素放大 16%，浏览器只能插值。
**动画要放大，图就得先有富余可放。**

**怎么办**　按公式准备图，别拍脑袋定一个数：

```
目标尺寸 = 屏幕物理尺寸 × 动画最大 scale
```

以 19.5:9 的 1290×2796 屏、`scale(1.04) → scale(1.16)` 为例：

```
1290 × 1.16 = 1496  → 取 1500
2796 × 1.16 = 3243  → 取 3250
```

验算：1500 宽的图 `cover` 进 1290，先缩小到 0.86；动画推到 1.16 时净值 0.86 × 1.16 = 0.998
——始终 ≤ 1，一个像素都没被拉伸。

你的动画幅度不是 1.16 就换个数代进去：只推到 1.08，1290 × 1.08 ≈ 1400 宽就够；
`prefers-reduced-motion` 那一档不推近，1290 原尺寸就行。
**先定动画幅度，再算图的尺寸**，反过来一定会有一档是糊的。

（比例也得对。比例不对时 `cover` 会先按高度撑满再左右裁掉，有效像素还要再打一次折——
AI-GUIDE §2 有一张不同比例的对照表。）

### 坑 3：照片放大了，但看不出放大

**症状**　卡片上那排竖条照片，鼠标划过去确实变宽变高了，可就是没有"跳出来"的感觉，
像在原地鼓了一下。

**根因**　容器高度正好等于放大后的高度。放大后的那张被容器上下卡死，
等于在一个刚好装得下它的盒子里长大——没有任何一块地方是它"顶出来"的。**放大要有地方长。**

**怎么办**　三件事一起做：

- **容器留余量。** 例：静止 188、放大到 276，容器给 284。多出来那几个像素就是"顶出来"的空间。
- **左右溢出是刻意的。** 整排变宽之后必然比卡片宽，最边上那张被卡片边缘切掉半张——
  这是要的效果（暗示"还有更多"），不是 bug，别加 `overflow: hidden` 把它裁齐。
  （参考实现里磁吸模式下 `.mc-row` 是 `overflow: visible`，注释写了原因：
  设成 `auto` 的话，鼠标一划过就同时触发横向滚动，照片会在指针底下自己跑掉。）
- **同步加重阴影 + 抬 `z-index`。** 几十个像素的尺寸变化，眼睛其实不太吃；
  "浮起来"是靠影子说话的。放大的同时把 `box-shadow` 加深加长、`z-index` 抬到相邻几张之上，
  让它真的压在别人上面。

### 坑 4：音乐和念白一起响，两边都听不清

**症状**　背景音乐正放着，念白开口，两条声音同一个音量往上顶，谁也听不清。

**根因**　没做 ducking。

**怎么办**　念白开口把音乐压到约 0.3，念完拉回 1.0。音乐**全程不停**，只是变小：

```js
gain.gain.setTargetAtTime(narrating ? 0.3 : 1.0, ctx.currentTime, 0.12);
```

用 `setTargetAtTime` 而不是直接赋值——直接赋值是一刀切下去，会有可闻的咔哒声；
第三个参数是时间常数，0.12 秒左右过渡听着最自然。

顺带把两件相关的事说清楚：

- **本项目不带任何音源。** 音乐是数据里给的一个地址（`audio.url`），或者你自己合成一段
  （参考实现为了断网能跑，就是当场用 Web Audio 合成的）。放什么、版权怎么办，是接入方的事。
- **旁白语音是可选的。** 配了 TTS 就是逐字念白 + 真人声配音；不配就是纯打字机动画，
  功能一点不缺——打字机负责视觉节奏，语音只是再加一层。真接了 TTS 就让两边同源：
  要么用朗读的 boundary 事件驱动打字，要么按同一段文本各算各的时长，
  别一边念完了另一边还在打。
- iOS 上 `<audio>.volume = 0.3` 是**静默无效**的（不报错也不生效），
  ducking 只有走 `GainNode` 才真的管用。见 SPEC §6.4。

### 坑 5：照片该按谁的屏幕准备

**症状**　按自己那台机器调好的图，换一台手机就要么糊、要么构图被裁掉一块。

**根因**　硬编码了某个机型的尺寸。

**怎么办**　别在文档或提示词里钉死一个机型。1290×2796（19.5:9）是覆盖绝大多数现役手机的
通用默认值，够用就用它。

但照片如果是让 AI 去找、去裁的，**明确告诉 AI：可以先问一句"你用什么手机"，
或者让对方随手截一张图看尺寸，按真实的屏来算**，再代进[坑 2](#坑-2加了-ken-burns照片变糊了)的公式。
多问这一句的成本，比六张图全部重来低得多。

### 坑 6：卡片底下那行小字，是别人写的话

**症状**　接进去跑起来，卡片底部那行斜体小字还是参考实现里带的那句——
跟你的产品、你的角色一点关系都没有，而且每一趟都一样。

**根因**　把示例文案当成了默认值。

**怎么办**　**数据优先，配置兜底**：

```js
// journey 数据里可以带一个可选的 hint —— AI 每建一趟自己写一句，跟着那趟的情绪走
const hint = journey.hint || CONFIG.cardHint;
```

```js
// CONFIG 里那一行只是数据没给时的兜底 —— 写你们自己的话
cardHint: "……",
```

`hint` 是可选字段，后端不校验、不生成，原样存原样返回（跟 `year` / `date` 一样是纯展示文本）。
让 AI 每趟写一句才是这个字段存在的意义——六张照片的气质每趟都不一样，
底下那句跟着变才对味；一句写死的口号翻到第三趟就废了。

### 另外三条在 SPEC 里

- **两张表的 `position` 方向是反的**：journey 取 `MIN - 1`（新的排前面），
  stop 取 `MAX + 1`（按走的顺序递增）。照抄时最容易搞混。SPEC §3。
- **跨域音频不设 `crossOrigin = "anonymous"` 会静音，而且不报错。** SPEC §6.4。
- **iOS 上 `AudioContext` 必须在用户手势的同步调用栈里 `new` + `resume()`**，
  时机是"打开故事页"那一次点击，不是等用户点播放键。SPEC §6.4。

---

## 7. 接完之后自检

- [ ] 浮层是挂在 `document.body` 下的，不是嵌在聊天气泡里
- [ ] 宿主页面里打开浮层，四个边都顶到屏幕边缘（没被祖先的 `transform` 收进笼子）
- [ ] 关掉浮层，音乐停了，定时器断了，body 的滚动恢复了
- [ ] 打开浮层立刻关掉、再立刻打开，第二次照样能自动播（在途的异步回调认的是"此刻"的会话）
- [ ] 长 note（六句以上）压在亮照片上，**文字底下没有灰板**，收起态和展开态都没有
- [ ] 照片按"屏幕物理尺寸 × 动画最大 scale"备的，推到最近那一帧不糊
- [ ] 磁力轮播放大时能看出"浮起来"，最边上那张被卡片切掉半张（这是对的）
- [ ] 念白开口时音乐降下去了，念完拉回来了，中间没有咔哒声
- [ ] `audio` 给 `null` 时播放器不渲染，故事页其余部分正常
- [ ] 卡片底下那行小字来自 `journey.hint`，没有 hint 才用你自己写的兜底
- [ ] 类名全带前缀，没有把 `* { box-sizing }` 和 `body {}` 抄进宿主
