(function () {
  const config = window.JOURNEYS_CONFIG;
  const KEY = "journey-cards-demo-v2";
  function art(i) {
    const colors = ["#8da9a6", "#c9ac88", "#a1abc0", "#b1b493", "#c6a19b", "#92a5b8"];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="${colors[i]}"/><circle cx="430" cy="200" r="72" fill="#f6e7ce"/><path d="M0 650L200 320L400 650L600 450V900H0" fill="#415b59"/><path d="M0 770Q250 620 600 790V900H0" fill="#d7d0b6"/><text x="40" y="850" fill="#fff" font-size="24">JOURNEYS / ${i+1}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function seed() {
    return [{id:"demo_journey",title:"山海之间",titleEn:"Between Mountains and Sea",year:"2026",cover:art(0),stops:["清晨的山谷","海边小镇","雨后森林","山间湖泊","夕阳渡口","夜色归途"].map((place,i)=>({id:"demo_stop_"+i,place,placeEn:"A moment together",date:"2026.10."+(10+i),src:art(i),note:"这是一段虚构的演示旅程。我们在这里停了一会儿，听风吹过，慢慢看天色变化。你说不急着去下一站，于是我把地图收好，陪你继续走。".repeat(i===0 ? 5 : 1)}))}];
  }
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch (_) {}
  if (!Array.isArray(data)) data=seed();
  const persist = () => localStorage.setItem(KEY, JSON.stringify(data));
  window.journeyMediaURL = function(ref) {
    if (!ref || /^(https?:|data:|blob:)/i.test(ref)) return ref || "";
    return config.apiBase ? new URL(ref, config.apiBase).href : ref;
  };
  function normalize(j) {
    const audio = j.audio || j.song || null;
    return {...j, cover:window.journeyMediaURL(j.cover),song:audio && {...audio,url:window.journeyMediaURL(audio.url)},stops:(j.stops||[]).map(s=>({...s,src:window.journeyMediaURL(s.src)}))};
  }
  async function demo(path,opts) {
    const method=opts.method || "GET", b=opts.body || {};
    if(path==="/api/journeys/upload") return {ok:true,url:`data:${b.mime || "image/jpeg"};base64,${b.src_data}`};
    if(path==="/api/journeys" && method==="GET") return {journeys:data.map(normalize)};
    const id=()=>"demo_"+crypto.randomUUID();
    const fields=b=>({...b,...(b.audioUrl!==undefined ? {song:b.audioUrl ? {url:b.audioUrl,title:b.audioTitle||"配乐",dur:210,hue:32} : null} : {})});
    let result={ok:true};
    if(path==="/api/journeys" && method==="POST") {const j={...fields(b),id:id(),stops:[]};data.unshift(j);result.id=j.id;}
    else {
      let m=path.match(/^\/api\/journeys\/([^/]+)\/stops$/);
      if(m && method==="POST") { const j=data.find(j=>j.id===m[1]); if(!j) throw Error("旅程不存在"); const s={...b,id:id()};j.stops.push(s);if(!j.cover)j.cover=s.src;result.id=s.id; }
      else if((m=path.match(/^\/api\/journeys\/stops\/([^/]+)$/))) {
        const j=data.find(j=>j.stops.some(s=>s.id===m[1]));if(!j)throw Error("停留不存在");
        if(method==="DELETE") j.stops=j.stops.filter(s=>s.id!==m[1]);else if(method==="PATCH")Object.assign(j.stops.find(s=>s.id===m[1]),b);else throw Error("不支持的方法");
      } else if((m=path.match(/^\/api\/journeys\/([^/]+)$/))) {
        const j=data.find(j=>j.id===m[1]);if(!j)throw Error("旅程不存在");
        if(method==="DELETE")data=data.filter(j=>j.id!==m[1]);else if(method==="PATCH")Object.assign(j,fields(b));else throw Error("不支持的方法");
      } else throw Error("演示不提供此接口");
    }
    persist(); return result;
  }
  window.journeysAPI = async function(path,opts={}) {
    try {
      if(config.demo) return await demo(path,opts);
      const response=await fetch((config.apiBase||"").replace(/\/$/,"")+path,{...opts,headers:{"Content-Type":"application/json",Authorization:"Bearer "+(config.token||""),...(opts.headers||{})},body:opts.body===undefined ? undefined : JSON.stringify(opts.body)});
      const d=await response.json();if(!response.ok)throw Error(typeof d.error==="string" ? d.error : d.message || "请求失败 ("+response.status+")");
      if(d.journeys)d.journeys=d.journeys.map(normalize);return d;
    } catch(e) { window.dispatchEvent(new CustomEvent("journeys:error",{detail:e.message}));throw e; }
  };
  window.addEventListener("journeys:error",e=>alert(e.detail));
})();
