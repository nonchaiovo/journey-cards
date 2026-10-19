// 只放公开配置；不要将真实 token 提交到仓库。
window.JOURNEYS_CONFIG = {
  demo: true, // false 时连接下方 API
  apiBase: "", // 同源留空；跨域填 https://your-worker.example
  token: "", // 真实应用请在运行时注入，勿公开发布
  ttsEndpoint: "", // 可选，POST {text} -> {voice:{audio_data_url,duration}}
};
