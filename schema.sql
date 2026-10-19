CREATE TABLE IF NOT EXISTS journeys (
  id          TEXT    PRIMARY KEY,           -- 'j_<base36时间戳>_<随机5位>'
  title       TEXT    NOT NULL,              -- 主标题（地名，如"新西兰"）
  title_en    TEXT    NOT NULL DEFAULT '',   -- 副标题 / 英文名
  year        TEXT    NOT NULL DEFAULT '',   -- 纯文本年份，不是数字类型
  cover       TEXT    NOT NULL DEFAULT '',   -- 封面：完整 URL 或 'kv:<key>'
  hint        TEXT    NOT NULL DEFAULT '',   -- 卡片底下那行小字，每趟一句，可选
  song_url    TEXT,                          -- 音频直链：完整 URL 或 'kv:<key>'
  song_title  TEXT,                          -- 歌名
  song_artist TEXT,                          -- 艺人
  song_cover  TEXT,                          -- 可选：专辑封面
  song_dur    INTEGER,                       -- 秒；只用于音频加载完成前占位显示
  song_hue    INTEGER,                       -- 0-360，播放器主色调
  position    INTEGER NOT NULL DEFAULT 0,    -- 排序值，越小越靠前（见下面"排序"）
  created_at  INTEGER NOT NULL,              -- 毫秒时间戳
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journeys_order ON journeys (position, created_at DESC);

-- 一趟里的一处停留
CREATE TABLE IF NOT EXISTS journey_stops (
  id          TEXT    PRIMARY KEY,           -- 's_<base36时间戳>_<随机5位>'
  journey_id  TEXT    NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  place       TEXT    NOT NULL,              -- 地名（必填）
  place_en    TEXT    NOT NULL DEFAULT '',
  date        TEXT    NOT NULL DEFAULT '',   -- 纯文本，如 '2025.03.16'，不校验格式
  src         TEXT    NOT NULL DEFAULT '',   -- 竖屏照片：完整 URL 或 'kv:<key>'
  note        TEXT    NOT NULL DEFAULT '',   -- 第一人称那段话（故事页左下角正文）
  position    INTEGER NOT NULL DEFAULT 0,    -- 0,1,2… 递增
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jstops_journey ON journey_stops (journey_id, position, created_at);

