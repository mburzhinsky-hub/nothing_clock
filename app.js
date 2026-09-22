const SVG_NS = "http://www.w3.org/2000/svg";

const STYLES = ["dot", "segment", "hybrid", "wire", "stencil"];
const MODES = ["clock", "date", "weather", "timer", "focus", "dream"];
const STYLE_LABELS = { dot:"Dot Matrix", segment:"Segment", hybrid:"Hybrid", wire:"Wire", stencil:"Stencil" };
const MODE_LABELS = { clock:"CLOCK", date:"DATE", weather:"WEATHER", timer:"TIMER", focus:"FOCUS", dream:"DREAM" };

const app = document.getElementById("app");
const stage = document.getElementById("stage");
const clock = document.getElementById("clock");
const controls = document.getElementById("controls");
const modeActions = document.getElementById("modeActions");
const modeMeta = document.getElementById("modeMeta");
const ambientWeather = document.getElementById("ambientWeather");
const dreamCanvas = document.getElementById("dreamCanvas");
const launcherGrid = document.getElementById("launcherGrid");
const launcherEditor = document.getElementById("launcherEditor");
const launcherLabel = document.getElementById("launcherLabel");
const launcherUrl = document.getElementById("launcherUrl");
const launcherSave = document.getElementById("launcherSave");
const launcherCancel = document.getElementById("launcherCancel");
const themeToggle = document.getElementById("themeToggle");
const toast = document.getElementById("toast");
const styleButtons = Array.from(document.querySelectorAll("[data-style-choice]"));
const modeButtons = Array.from(document.querySelectorAll("[data-mode-choice]"));

const DOT_PATTERNS = {
  "0":["01110","11011","11011","11011","11011","11011","01110"],
  "1":["00110","01110","00110","00110","00110","00110","01110"],
  "2":["01110","11011","00011","00110","01100","11000","11111"],
  "3":["11110","00011","00011","01110","00011","00011","11110"],
  "4":["10011","10011","10011","11111","00011","00011","00011"],
  "5":["11111","11000","11000","11110","00011","00011","11110"],
  "6":["01110","11000","11000","11110","11011","11011","01110"],
  "7":["11111","00011","00110","00110","01100","01100","01100"],
  "8":["01110","11011","11011","01110","11011","11011","01110"],
  "9":["01110","11011","11011","01111","00011","00011","01110"]
};

const SEGMENTS = {
  "0":["a","b","c","d","e","f"], "1":["b","c"], "2":["a","b","g","e","d"],
  "3":["a","b","g","c","d"], "4":["f","g","b","c"], "5":["a","f","g","c","d"],
  "6":["a","f","g","e","c","d"], "7":["a","b","c"],
  "8":["a","b","c","d","e","f","g"], "9":["a","b","c","d","f","g"]
};

const SEGMENT_GEOMETRY = {
  a:[22,0,78,14], b:[94,14,14,76], c:[94,104,14,76], d:[22,180,78,14],
  e:[8,104,14,76], f:[8,14,14,76], g:[22,90,78,14]
};

const WIRE_PATHS = {
  "0":"M30 18 H82 Q102 18 102 40 V142 Q102 162 82 162 H30 Q10 162 10 142 V40 Q10 18 30 18 Z",
  "1":"M28 48 L58 20 V162 M32 162 H88",
  "2":"M18 44 Q18 18 44 18 H76 Q102 18 102 44 Q102 60 88 72 L24 126 Q10 138 10 162 H104",
  "3":"M18 34 Q32 18 52 18 H76 Q100 18 100 42 Q100 62 80 72 Q104 80 104 104 V136 Q104 162 78 162 H46 Q24 162 10 146",
  "4":"M86 18 V162 M86 100 H12 L66 18",
  "5":"M102 18 H24 V78 H72 Q100 78 100 106 V136 Q100 162 74 162 H42 Q20 162 10 146",
  "6":"M94 26 Q82 18 66 18 H40 Q14 18 14 44 V136 Q14 162 40 162 H72 Q98 162 98 136 V108 Q98 84 74 84 H14",
  "7":"M12 20 H104 L54 162",
  "8":"M38 18 H74 Q98 18 98 42 V56 Q98 74 80 82 Q102 90 102 112 V138 Q102 162 78 162 H34 Q10 162 10 138 V112 Q10 90 32 82 Q14 74 14 56 V42 Q14 18 38 18 Z",
  "9":"M98 96 H38 Q14 96 14 72 V42 Q14 18 38 18 H72 Q98 18 98 44 V136 Q98 162 74 162 H46"
};

const X = [0,170,400,570];
const SEP_X = 342;
const WEEKDAYS = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function getStore(key){ try { return localStorage.getItem(key); } catch (_) { return null; } }
function setStore(key,val){ try { localStorage.setItem(key,val); } catch (_) {} }
function canAnimate(el){ return el && typeof el.animate === "function"; }
function svgEl(name, attrs){
  const el = document.createElementNS(SVG_NS, name);
  Object.entries(attrs || {}).forEach(([k,v]) => el.setAttribute(k,v));
  return el;
}

let glyphStyle = STYLES.includes(getStore("glyph-style")) ? getStore("glyph-style") : "dot";
let theme = getStore("clock-theme") === "light" ? "light" : "dark";
let mode = MODES.includes(getStore("display-mode")) ? getStore("display-mode") : "clock";
let currentLayer = null;
let displayedDigits = [];
let displayToken = "";
let touchStartX = 0, touchStartY = 0;
let transitioning = false;
let controlsTimer = null, toastTimer = null, wakeLock = null;
let actionToken = "";
let launcherEditIndex = -1;
let launcherHoldTimer = null;
let dreamPhase = 0;
let dreamMode = 0;
let dreamFrame = 0;
let dreamParticles = [];
let dreamLastTimeKey = "";
let dreamTargetKey = "";
let dreamTargetCache = [];
let dreamDpr = 1;

const weather = { loading:false, loaded:false, temperature:null, apparent:null, code:null, error:"" };
const timerState = {
  duration: Number(getStore("timer-duration")) || 300,
  remaining: Number(getStore("timer-duration")) || 300,
  running:false, endAt:0
};
const focusState = { duration:1500, remaining:1500, running:false, endAt:0 };

const DEFAULT_LAUNCHER = [
  { label:"MUSIC", url:"music://" },
  { label:"MAPS", url:"maps://" },
  { label:"YOUTUBE", url:"https://youtube.com/" },
  { label:"TELEGRAM", url:"tg://" },
  { label:"NOTES", url:"mobilenotes://" },
  { label:"SHORTCUT", url:"shortcuts://" }
];

function loadLauncher(){
  try{
    const raw=getStore("launcher-items");
    const parsed=raw?JSON.parse(raw):null;
    if(Array.isArray(parsed) && parsed.length===6) return parsed.map((item,i)=>({
      label:String(item.label||DEFAULT_LAUNCHER[i].label).slice(0,16),
      url:String(item.url||DEFAULT_LAUNCHER[i].url).slice(0,240)
    }));
  }catch(_){}
  return DEFAULT_LAUNCHER.map(item=>({...item}));
}

let launcherItems = loadLauncher();

function patternSet(char){
  const set = new Set();
  DOT_PATTERNS[char].forEach((row,r) => [...row].forEach((cell,c) => { if(cell==="1") set.add(r*5+c); }));
  return set;
}

function createDotDigit(char, x, hybrid){
  const g = svgEl("g",{class:hybrid?"digit digit-hybrid":"digit digit-dot",transform:"translate("+x+" 27)","data-char":char});
  const active = patternSet(char);
  for(let i=0;i<35;i++){
    const r=Math.floor(i/5), c=i%5, cx=c*27+14, cy=r*27+14;
    let n;
    if(!hybrid){
      n = svgEl("circle",{cx,cy,r:8.2,class:"glyph-pixel"});
    } else {
      const horizontal = r===0 || r===3 || r===6;
      const capsule = (r+c)%3!==1 || c===0 || c===4;
      n = capsule
        ? svgEl("rect",{x:cx-(horizontal?10.5:6),y:cy-(horizontal?5:10),width:horizontal?21:12,height:horizontal?10:20,rx:6,class:"glyph-pixel hybrid-piece"})
        : svgEl("circle",{cx,cy,r:6.2,class:"glyph-pixel hybrid-piece"});
    }
    n.dataset.on = active.has(i) ? "1" : "0";
    n.dataset.cell = String(i);
    n.style.opacity = active.has(i) ? "1" : "var(--glyph-ghost)";
    g.appendChild(n);
  }
  return g;
}

function stencilPath(x,y,w,h){
  const cut = Math.min(w,h)*.32;
  return ["M",x+cut,y,"H",x+w-cut,"L",x+w,y+cut,"V",y+h-cut,"L",x+w-cut,y+h,"H",x+cut,"L",x,y+h-cut,"V",y+cut,"Z"].join(" ");
}

function createSegmentDigit(char, x, stencil){
  const g = svgEl("g",{class:stencil?"digit digit-stencil":"digit digit-segment",transform:"translate("+(x+6)+" 27)","data-char":char});
  const active = new Set(SEGMENTS[char]);
  Object.entries(SEGMENT_GEOMETRY).forEach(([name,[rx,ry,w,h]])=>{
    const n = stencil
      ? svgEl("path",{d:stencilPath(rx,ry,w,h),class:"stencil-piece","data-segment":name,"data-axis":w>h?"x":"y"})
      : svgEl("rect",{x:rx,y:ry,width:w,height:h,rx:Math.min(w,h)/2,class:"segment-piece","data-segment":name,"data-axis":w>h?"x":"y"});
    n.dataset.on = active.has(name) ? "1" : "0";
    n.style.opacity = active.has(name) ? "1" : "var(--segment-ghost)";
    g.appendChild(n);
  });
  return g;
}

function createWireDigit(char, x){
  const g = svgEl("g",{class:"digit digit-wire",transform:"translate("+(x+5)+" 36)","data-char":char});
  const skeleton = svgEl("path",{d:WIRE_PATHS[char],class:"wire-skeleton"});
  const active = svgEl("path",{d:WIRE_PATHS[char],class:"wire-active"});
  active.dataset.on="1";
  g.append(skeleton,active);
  return g;
}

function createDigit(style,char,x){
  if(style==="segment") return createSegmentDigit(char,x,false);
  if(style==="stencil") return createSegmentDigit(char,x,true);
  if(style==="hybrid") return createDotDigit(char,x,true);
  if(style==="wire") return createWireDigit(char,x);
  return createDotDigit(char,x,false);
}

function createSeparator(style, kind){
  const g = svgEl("g",{class:"colon colon-"+style,transform:"translate("+SEP_X+" 27)","aria-hidden":"true"});
  const one = kind==="date";
  const add = (cy)=>{
    if(style==="wire") g.appendChild(svgEl("circle",{cx:7,cy,r:5.5,fill:"none",stroke:"currentColor","stroke-width":4}));
    else if(style==="stencil") g.appendChild(svgEl("path",{d:"M7 "+(cy-9)+" L16 "+cy+" L7 "+(cy+9)+" L-2 "+cy+" Z"}));
    else if(style==="segment") g.appendChild(svgEl("rect",{x:0,y:cy-7,width:14,height:14,rx:7}));
    else g.appendChild(svgEl("circle",{cx:7,cy,r:style==="hybrid"?6:7.5}));
  };
  if(one) add(128); else { add(71); add(127); }
  return g;
}

function createNumericLayer(digits, separator){
  const layer = svgEl("g",{class:"time-layer","data-style":glyphStyle});
  digits.forEach((ch,i)=>{
    const digit = createDigit(glyphStyle,ch,X[i]);
    digit.dataset.index=String(i);
    layer.appendChild(digit);
  });
  layer.appendChild(createSeparator(glyphStyle,separator||"time"));
  return layer;
}

function weatherFamily(code){
  if(code===0) return "clear";
  if(code===1 || code===2) return "partly";
  if(code===3 || code===45 || code===48) return "cloud";
  if((code>=51&&code<=67)||(code>=80&&code<=82)) return "rain";
  if((code>=71&&code<=77)||(code>=85&&code<=86)) return "snow";
  if(code>=95) return "storm";
  return "cloud";
}

function weatherLabel(code){
  const f = weatherFamily(code);
  return ({clear:"CLEAR",partly:"PARTLY CLOUDY",cloud:"CLOUDY",rain:"RAIN",snow:"SNOW",storm:"STORM"})[f];
}

function createWeatherIcon(code){
  const f = weatherFamily(code);
  const g = svgEl("g",{class:"weather-icon weather-"+f,transform:"translate(28 28)"});
  const line=(x1,y1,x2,y2,w=7)=>g.appendChild(svgEl("line",{x1,y1,x2,y2,stroke:"currentColor","stroke-width":w,"stroke-linecap":"round",class:"weather-stroke"}));
  const dot=(x,y,r=6)=>g.appendChild(svgEl("circle",{cx:x,cy:y,r,class:"weather-particle"}));

  if(f==="clear" || f==="partly"){
    g.appendChild(svgEl("circle",{cx:76,cy:62,r:28,fill:"none",stroke:"currentColor","stroke-width":8,class:"weather-orbit"}));
    for(let i=0;i<8;i++){
      const a=Math.PI*2*i/8;
      line(76+Math.cos(a)*42,62+Math.sin(a)*42,76+Math.cos(a)*55,62+Math.sin(a)*55,6);
    }
  }
  if(f!=="clear"){
    g.appendChild(svgEl("path",{d:"M26 118 C26 98 42 84 62 84 C70 62 92 50 114 58 C133 64 144 79 144 98 C160 102 170 113 170 128 C170 146 156 158 137 158 H55 C36 158 22 144 22 128 C22 124 23 121 26 118 Z",fill:"none",stroke:"currentColor","stroke-width":8,"stroke-linecap":"round","stroke-linejoin":"round",class:"weather-cloud"}));
  }
  if(f==="rain" || f==="storm") for(let i=0;i<4;i++) line(48+i*29,174,41+i*29,194,6);
  if(f==="snow") for(let i=0;i<4;i++) dot(48+i*29,184,5);
  if(f==="storm") g.appendChild(svgEl("path",{d:"M98 164 L79 190 H96 L83 216 L121 178 H103 L116 164 Z",class:"weather-flash"}));
  return g;
}

function createDegree(x){
  const g = svgEl("g",{class:"degree-mark",transform:"translate("+x+" 58)"});
  if(glyphStyle==="wire" || glyphStyle==="segment" || glyphStyle==="stencil"){
    g.appendChild(svgEl("circle",{cx:14,cy:14,r:10,fill:"none",stroke:"currentColor","stroke-width":5}));
  }else{
    for(let i=0;i<8;i++){
      const a=Math.PI*2*i/8;
      g.appendChild(svgEl("circle",{cx:14+Math.cos(a)*10,cy:14+Math.sin(a)*10,r:2.7,class:"weather-particle"}));
    }
  }
  return g;
}

function createWeatherLayer(){
  const layer = svgEl("g",{class:"time-layer weather-layer","data-style":glyphStyle});
  layer.appendChild(createWeatherIcon(weather.code==null?3:weather.code));
  if(weather.temperature==null){
    const t = svgEl("text",{x:330,y:145,class:"weather-placeholder","text-anchor":"middle"});
    t.textContent="··";
    layer.appendChild(t);
    return layer;
  }

  let v=Math.round(weather.temperature);
  v=Math.max(-99,Math.min(99,v));
  const neg=v<0;
  const digits=String(Math.abs(v)).padStart(2,"0").split("");
  const pos=neg?[350,505]:[330,485];

  if(neg){
    const minus=svgEl("g",{class:"weather-minus",transform:"translate(215 27)"});
    minus.appendChild(svgEl("rect",{x:22,y:90,width:78,height:14,rx:7}));
    layer.appendChild(minus);
  }
  digits.forEach((ch,i)=>{
    const d=createDigit(glyphStyle,ch,pos[i]);
    d.dataset.index=String(i);
    layer.appendChild(d);
  });
  layer.appendChild(createDegree(neg?648:628));
  return layer;
}

function createFocusRail(remaining,duration){
  const g=svgEl("g",{class:"focus-rail","aria-hidden":"true"});
  const activeCount=Math.ceil((duration?remaining/duration:0)*25);
  for(let i=0;i<25;i++){
    const x=90+i*21.2;
    let n;
    if(glyphStyle==="wire") n=svgEl("circle",{cx:x,cy:238,r:4.2,fill:"none",stroke:"currentColor","stroke-width":2.5});
    else if(glyphStyle==="segment" || glyphStyle==="stencil") n=svgEl("rect",{x:x-5,y:234,width:10,height:8,rx:glyphStyle==="stencil"?1:4});
    else n=svgEl("circle",{cx:x,cy:238,r:glyphStyle==="hybrid"?4:4.5});
    n.classList.add("focus-node");
    n.dataset.on=i<activeCount?"1":"0";
    n.style.opacity=i<activeCount?".82":".08";
    g.appendChild(n);
  }
  return g;
}

function currentCountdown(state){
  if(state.running){
    state.remaining=Math.max(0,Math.ceil((state.endAt-Date.now())/1000));
    if(state.remaining<=0){
      state.remaining=0;
      state.running=false;
      finishPulse();
    }
  }
  return state.remaining;
}

function formatPair(total){
  const s=Math.max(0,Math.floor(total));
  const mm=String(Math.floor(s/60)).padStart(2,"0");
  const ss=String(s%60).padStart(2,"0");
  return [mm[0],mm[1],ss[0],ss[1]];
}

function modePayload(){
  const now=new Date();
  if(mode==="clock"){
    const hh=String(now.getHours()).padStart(2,"0"), mm=String(now.getMinutes()).padStart(2,"0");
    const d=[hh[0],hh[1],mm[0],mm[1]];
    return {token:"clock:"+d.join(""),digits:d,separator:"time"};
  }
  if(mode==="date"){
    const dd=String(now.getDate()).padStart(2,"0"), mm=String(now.getMonth()+1).padStart(2,"0");
    const d=[dd[0],dd[1],mm[0],mm[1]];
    return {token:"date:"+d.join(""),digits:d,separator:"date"};
  }
  if(mode==="timer"){
    const d=formatPair(currentCountdown(timerState));
    return {token:"timer:"+d.join(""),digits:d,separator:"time"};
  }
  if(mode==="focus"){
    const d=formatPair(currentCountdown(focusState));
    return {token:"focus:"+d.join(""),digits:d,separator:"time"};
  }
  if(mode==="dream") return {token:"dream"};
  return {token:"weather:"+weather.temperature+":"+weather.code+":"+weather.loading+":"+weather.error};
}

function updateMeta(){
  const now=new Date();
  if(mode==="clock") modeMeta.textContent="";
  else if(mode==="date") modeMeta.textContent=WEEKDAYS[now.getDay()]+" · "+MONTHS[now.getMonth()]+" "+now.getFullYear();
  else if(mode==="weather"){
    if(weather.loading) modeMeta.textContent="LOCATING · WEATHER";
    else if(weather.error) modeMeta.textContent=weather.error;
    else if(weather.loaded) modeMeta.textContent=weatherLabel(weather.code)+(weather.apparent==null?"":" · FEELS "+Math.round(weather.apparent)+"°");
    else modeMeta.textContent="TAP · LOCATE";
  } else if(mode==="timer") modeMeta.textContent=timerState.running?"TIMER · RUNNING":"TIMER · "+Math.round(timerState.duration/60)+" MIN";
  else if(mode==="focus") modeMeta.textContent=focusState.running?"FOCUS · STAY HERE":"FOCUS · 25 MIN";
  else if(mode==="dream") modeMeta.textContent="GENERATIVE · "+(dreamMode===0?"TIME MORPH":"CONSTELLATION");
}

function animateEntrance(layer){
  const pieces=Array.from(layer.querySelectorAll(".glyph-pixel,.segment-piece,.stencil-piece,.wire-active,.weather-particle,.weather-stroke,.weather-cloud,.focus-node"));
  pieces.forEach((piece,i)=>{
    if(!canAnimate(piece)) return;
    piece.animate([{opacity:.12,transform:"scale(.94)"},{opacity:1,transform:"scale(1)"}],{duration:260,delay:Math.min(i*4,90),easing:"cubic-bezier(.16,1,.3,1)"});
  });
}

function mountMode(entrance=true){
  const p=modePayload();
  let layer;
  if(mode==="weather"){
    layer=createWeatherLayer();
    displayedDigits=[];
  } else if(mode==="dream"){
    layer=svgEl("g",{class:"time-layer special-layer"});
    displayedDigits=[];
  } else {
    layer=createNumericLayer(p.digits,p.separator);
    displayedDigits=p.digits.slice();
    if(mode==="focus") layer.appendChild(createFocusRail(focusState.remaining,focusState.duration));
  }
  currentLayer=layer;
  displayToken=p.token;
  clock.replaceChildren(layer);
  updateSpecialMode();
  updateMeta();
  updateActions();
  updateModeButtons();
  if(entrance && mode!=="dream") animateEntrance(layer);
}

function nearestCell(index,set){
  if(!set || set.size===0) return index;
  const r=Math.floor(index/5), c=index%5;
  let best=index, bestD=Infinity;
  set.forEach(candidate=>{
    const rr=Math.floor(candidate/5), cc=candidate%5;
    const d=Math.abs(rr-r)+Math.abs(cc-c);
    if(d<bestD){bestD=d;best=candidate;}
  });
  return best;
}

function animateDot(piece,fromOn,toOn,index,oldSet,newSet){
  if(fromOn===toOn) return;
  const ghost=parseFloat(getComputedStyle(app).getPropertyValue("--glyph-ghost"))||.07;
  let dx=0,dy=0;
  if(toOn && !fromOn){
    const source=nearestCell(index,oldSet);
    dx=((source%5)-(index%5))*27;
    dy=(Math.floor(source/5)-Math.floor(index/5))*27;
  }else if(fromOn && !toOn){
    const target=nearestCell(index,newSet);
    dx=((target%5)-(index%5))*27;
    dy=(Math.floor(target/5)-Math.floor(index/5))*27;
  }
  const fromTransform=toOn&&!fromOn?"translate("+dx+"px,"+dy+"px) scale(.55)":"translate(0,0) scale(1)";
  const toTransform=fromOn&&!toOn?"translate("+dx+"px,"+dy+"px) scale(.45)":"translate(0,0) scale(1)";
  const a=piece.animate([
    {opacity:fromOn?1:ghost,transform:fromTransform},
    {offset:.58,opacity:.9,transform:"translate("+(dx*.25)+"px,"+(dy*.25)+"px) scale(1.08)"},
    {opacity:toOn?1:ghost,transform:toTransform}
  ],{duration:430,delay:(index%5)*6,easing:"cubic-bezier(.16,1,.3,1)",fill:"both"});
  a.finished.catch(()=>{}).then(()=>{piece.style.opacity=String(toOn?1:ghost);piece.style.transform="";piece.dataset.on=toOn?"1":"0";});
}

function animateSegment(piece,fromOn,toOn,index){
  if(fromOn===toOn) return;
  const ghost=parseFloat(getComputedStyle(app).getPropertyValue("--segment-ghost"))||.07;
  const quiet=piece.dataset.axis==="x"?"scaleX(.86)":"scaleY(.86)";
  const a=piece.animate([{opacity:fromOn?1:ghost,transform:fromOn?"scale(1)":quiet},{opacity:toOn?1:ghost,transform:toOn?"scale(1)":quiet}],{duration:280,delay:index*9,easing:"cubic-bezier(.16,1,.3,1)",fill:"both"});
  a.finished.catch(()=>{}).then(()=>{piece.style.opacity=String(toOn?1:ghost);piece.style.transform="";piece.dataset.on=toOn?"1":"0";});
}

function replaceDigit(oldGroup,nextGroup){
  oldGroup.after(nextGroup);
  if(!canAnimate(oldGroup) || !canAnimate(nextGroup)){oldGroup.remove();return;}
  const out=oldGroup.animate([{opacity:1,transform:"translateY(0) scale(1)"},{opacity:0,transform:"translateY(-6px) scale(.975)"}],{duration:220,fill:"forwards",easing:"ease"});
  const inn=nextGroup.animate([{opacity:0,transform:"translateY(7px) scale(.97)"},{opacity:1,transform:"translateY(0) scale(1)"}],{duration:300,fill:"both",easing:"cubic-bezier(.16,1,.3,1)"});
  Promise.allSettled([out.finished,inn.finished]).then(()=>oldGroup.remove());
}

function updateDigit(group,oldChar,newChar){
  if(oldChar===newChar) return;
  const index=Number(group.dataset.index);
  if(glyphStyle==="wire"){
    const next=createWireDigit(newChar,X[index]);
    next.dataset.index=String(index);
    replaceDigit(group,next);
    return;
  }
  group.dataset.char=newChar;
  if(glyphStyle==="segment" || glyphStyle==="stencil"){
    const oldSet=new Set(SEGMENTS[oldChar]), newSet=new Set(SEGMENTS[newChar]);
    const selector=glyphStyle==="stencil"?".stencil-piece":".segment-piece";
    Array.from(group.querySelectorAll(selector)).forEach((piece,i)=>animateSegment(piece,oldSet.has(piece.dataset.segment),newSet.has(piece.dataset.segment),i));
  } else {
    const oldSet=patternSet(oldChar), newSet=patternSet(newChar);
    Array.from(group.querySelectorAll(".glyph-pixel")).forEach((piece,i)=>animateDot(piece,oldSet.has(i),newSet.has(i),i,oldSet,newSet));
  }
}

function tickDisplay(){
  const p=modePayload();
  if(mode==="dream"){updateMeta();return;}
  if(p.token===displayToken){updateMeta();return;}
  if(mode==="weather"){mountMode(false);return;}

  const groups=Array.from(currentLayer.querySelectorAll(".digit"));
  if(groups.length!==4 || displayedDigits.length!==4){mountMode(false);return;}
  p.digits.forEach((ch,i)=>updateDigit(groups[i],displayedDigits[i],ch));
  displayedDigits=p.digits.slice();
  displayToken=p.token;

  if(mode==="focus"){
    const oldRail=currentLayer.querySelector(".focus-rail");
    const newRail=createFocusRail(focusState.remaining,focusState.duration);
    if(oldRail) oldRail.replaceWith(newRail); else currentLayer.appendChild(newRail);
  }
  updateMeta();
  updateActions();
}

function transitionTo(axis,dir){
  transitioning=true;
  const previous=currentLayer;
  const p=modePayload();
  let next;
  if(mode==="weather") next=createWeatherLayer();
  else if(mode==="dream") next=svgEl("g",{class:"time-layer special-layer"});
  else {
    next=createNumericLayer(p.digits,p.separator);
    if(mode==="focus") next.appendChild(createFocusRail(focusState.remaining,focusState.duration));
  }
  currentLayer=next;
  displayedDigits=p.digits?p.digits.slice():[];
  displayToken=p.token;
  clock.appendChild(next);
  updateSpecialMode();
  updateMeta(); updateActions(); updateModeButtons();

  if(!canAnimate(previous) || !canAnimate(next)){ if(previous) previous.remove(); transitioning=false; return; }
  const outMove=axis==="x"?"translateX("+(dir*-26)+"px)":"translateY("+(dir*-24)+"px)";
  const inMove=axis==="x"?"translateX("+(dir*28)+"px)":"translateY("+(dir*26)+"px)";
  const a=previous.animate([{opacity:1,transform:"translate(0,0) scale(1)",filter:"blur(0)"},{opacity:0,transform:outMove+" scale(.98)",filter:"blur(4px)"}],{duration:260,fill:"forwards",easing:"ease"});
  const b=next.animate([{opacity:0,transform:inMove+" scale(.98)",filter:"blur(4px)"},{opacity:1,transform:"translate(0,0) scale(1)",filter:"blur(0)"}],{duration:340,fill:"both",easing:"cubic-bezier(.16,1,.3,1)"});
  if(mode!=="dream") animateEntrance(next);
  Promise.allSettled([a.finished,b.finished]).then(()=>{previous.remove();transitioning=false;});
}

function switchStyle(next,dir){
  if(!STYLES.includes(next) || next===glyphStyle || transitioning) return;
  const oldIndex=STYLES.indexOf(glyphStyle), newIndex=STYLES.indexOf(next);
  glyphStyle=next; setStore("glyph-style",glyphStyle); updateStyleButtons();
  transitionTo("x",typeof dir==="number"?dir:(newIndex>oldIndex?1:-1));
}

function switchMode(next,dir){
  if(!MODES.includes(next) || next===mode || transitioning) return;
  const oldIndex=MODES.indexOf(mode), newIndex=MODES.indexOf(next);
  mode=next; setStore("display-mode",mode); app.dataset.mode=mode;
  transitionTo("y",typeof dir==="number"?dir:(newIndex>oldIndex?1:-1));
}

function updateStyleButtons(){
  app.dataset.style=glyphStyle;
  styleButtons.forEach(b=>{const active=b.dataset.styleChoice===glyphStyle;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
}

function updateModeButtons(){
  modeButtons.forEach(b=>{const active=b.dataset.modeChoice===mode;b.classList.toggle("active",active);b.setAttribute("aria-current",active?"true":"false");});
}

function actionButton(label,action,primary=false){
  const b=document.createElement("button");
  b.type="button"; b.className="mode-action"+(primary?" primary":""); b.textContent=label; b.dataset.action=action;
  return b;
}

function updateActions(){
  const nextToken =
    mode === "weather" ? "weather:" + weather.loading :
    mode === "timer" ? "timer:" + timerState.running :
    mode === "focus" ? "focus:" + focusState.running :
    mode === "dream" ? "dream:" + dreamMode :
    mode;

  if (nextToken === actionToken) return;
  actionToken = nextToken;

  modeActions.replaceChildren();
  if(mode==="weather") modeActions.appendChild(actionButton(weather.loading?"…":"LOCATE","weather",true));
  else if(mode==="timer"){
    modeActions.append(actionButton("−","timer-minus"),actionButton(timerState.running?"PAUSE":"START","timer-toggle",true),actionButton("RESET","timer-reset"),actionButton("+","timer-plus"));
  } else if(mode==="focus"){
    modeActions.append(actionButton(focusState.running?"PAUSE":"FOCUS","focus-toggle",true),actionButton("RESET","focus-reset"));
  } else if(mode==="dream"){
    modeActions.append(actionButton("MORPH","dream-morph",dreamMode===0),actionButton("FIELD","dream-field",dreamMode===1));
  }
  modeActions.classList.toggle("has-actions",modeActions.children.length>0);
}

function toggleCountdown(state){
  if(state.running){state.remaining=Math.max(0,Math.ceil((state.endAt-Date.now())/1000));state.running=false;}
  else if(state.remaining>0){state.running=true;state.endAt=Date.now()+state.remaining*1000;}
  displayToken="";tickDisplay();
}
function resetCountdown(state){state.running=false;state.remaining=state.duration;state.endAt=0;displayToken="";tickDisplay();}
function adjustTimer(delta){
  if(timerState.running) return;
  timerState.duration=Math.max(60,Math.min(3600,timerState.duration+delta*60));
  timerState.remaining=timerState.duration;
  setStore("timer-duration",String(timerState.duration));
  displayToken="";tickDisplay();
}
function finishPulse(){
  if(!canAnimate(clock)) return;
  clock.animate([{opacity:1,transform:"scale(1)"},{opacity:.4,transform:"scale(.97)"},{opacity:1,transform:"scale(1.015)"},{opacity:1,transform:"scale(1)"}],{duration:850,easing:"cubic-bezier(.16,1,.3,1)"});
}

function renderLauncher(){
  launcherGrid.replaceChildren();
  launcherItems.forEach((item,index)=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="launcher-item";
    button.dataset.index=String(index);
    button.innerHTML='<span class="launcher-glyph" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="launcher-name"></span>';
    button.querySelector(".launcher-name").textContent=item.label;
    launcherGrid.appendChild(button);
  });
}

function openLauncherEditor(index){
  launcherEditIndex=index;
  const item=launcherItems[index];
  launcherLabel.value=item.label;
  launcherUrl.value=item.url;
  launcherEditor.hidden=false;
  requestAnimationFrame(()=>launcherLabel.focus());
}

function closeLauncherEditor(){
  launcherEditor.hidden=true;
  launcherEditIndex=-1;
}

function saveLauncher(){
  if(launcherEditIndex<0) return;
  const label=launcherLabel.value.trim().slice(0,16)||"APP";
  const url=launcherUrl.value.trim().slice(0,240);
  if(!url){showToast("URL REQUIRED");return;}
  launcherItems[launcherEditIndex]={label,url};
  setStore("launcher-items",JSON.stringify(launcherItems));
  renderLauncher();
  closeLauncherEditor();
  showToast("SAVED");
}

function launchItem(index){
  const item=launcherItems[index];
  if(!item || !item.url) return;
  try{
    window.location.href=item.url;
  }catch(_){
    showToast("CAN'T OPEN");
  }
}

function updateAmbientWeather(){
  ambientWeather.replaceChildren();
  const family=weatherFamily(weather.code==null?3:weather.code);
  app.dataset.weather=family;
  const count=family==="rain"?28:family==="snow"?24:family==="clear"?14:family==="storm"?22:12;
  for(let i=0;i<count;i++){
    const p=document.createElement("i");
    p.style.setProperty("--i",String(i));
    p.style.setProperty("--x",((i*37)%97)+"%");
    p.style.setProperty("--d",(3.6+(i%7)*.43)+"s");
    p.style.setProperty("--delay",(-((i*13)%31)/10)+"s");
    ambientWeather.appendChild(p);
  }
}

function setupDreamParticles(){
  const rect=dreamCanvas.getBoundingClientRect();
  dreamDpr=Math.min(window.devicePixelRatio||1,2);
  dreamCanvas.width=Math.max(1,Math.floor(rect.width*dreamDpr));
  dreamCanvas.height=Math.max(1,Math.floor(rect.height*dreamDpr));
  const count=Math.min(92,Math.max(64,Math.floor(rect.width/10)));
  if(dreamParticles.length!==count){
    dreamParticles=Array.from({length:count},(_,i)=>({
      x:Math.random()*rect.width,y:Math.random()*rect.height,
      vx:(Math.random()-.5)*.18,vy:(Math.random()-.5)*.18,
      seed:i*1.618
    }));
  }
  dreamTargetKey="";
  dreamTargetCache=[];
}

function dreamTargets(text,w,h,count){
  const temp=document.createElement("canvas");
  temp.width=700;temp.height=250;
  const ctx=temp.getContext("2d");
  ctx.clearRect(0,0,700,250);
  ctx.fillStyle="#fff";
  ctx.font="800 170px ui-monospace, Menlo, monospace";
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.fillText(text,350,128);
  const data=ctx.getImageData(0,0,700,250).data;
  const pts=[];
  for(let y=12;y<238;y+=8){
    for(let x=12;x<688;x+=8){
      if(data[(y*700+x)*4+3]>120) pts.push({x:x/700*w,y:y/250*h});
    }
  }
  if(!pts.length) return [];
  return Array.from({length:count},(_,i)=>pts[(i*17)%pts.length]);
}

function drawDream(){
  if(mode!=="dream" || !dreamCanvas.isConnected){
    dreamFrame=0;
    return;
  }

  const rect=dreamCanvas.getBoundingClientRect();
  if(!rect.width || !rect.height){
    dreamFrame=requestAnimationFrame(drawDream);
    return;
  }

  if(!dreamCanvas.width || Math.abs(dreamCanvas.width/dreamDpr-rect.width)>2) setupDreamParticles();

  const dpr=dreamCanvas.width/rect.width;
  const ctx=dreamCanvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,rect.width,rect.height);

  const fg=getComputedStyle(app).getPropertyValue("--fg").trim()||"#fff";
  ctx.fillStyle=fg;
  ctx.strokeStyle=fg;
  ctx.lineWidth=.7;
  dreamPhase+=.008;

  let targets=dreamTargetCache;
  if(dreamMode===0){
    const now=new Date();
    const timeKey=String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0");
    const nextKey=timeKey+"|"+Math.round(rect.width)+"|"+Math.round(rect.height)+"|"+dreamParticles.length;
    dreamLastTimeKey=timeKey;
    if(nextKey!==dreamTargetKey){
      dreamTargetKey=nextKey;
      dreamTargetCache=dreamTargets(timeKey,rect.width,rect.height,dreamParticles.length);
    }
    targets=dreamTargetCache;
  }

  dreamParticles.forEach((p,i)=>{
    if(dreamMode===0 && targets[i]){
      p.x+=(targets[i].x-p.x)*.045;
      p.y+=(targets[i].y-p.y)*.045;
    }else{
      p.vx+=Math.sin(dreamPhase*2+p.seed)*.0025;
      p.vy+=Math.cos(dreamPhase*1.7+p.seed)*.0025;
      p.vx*=.99;
      p.vy*=.99;
      p.x+=p.vx;
      p.y+=p.vy;
      if(p.x<0)p.x+=rect.width;
      if(p.x>rect.width)p.x-=rect.width;
      if(p.y<0)p.y+=rect.height;
      if(p.y>rect.height)p.y-=rect.height;
    }
  });

  for(let i=0;i<dreamParticles.length;i++){
    const a=dreamParticles[i];
    for(let j=i+1;j<dreamParticles.length;j++){
      const b=dreamParticles[j];
      const dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);
      if(d<52){
        ctx.globalAlpha=(1-d/52)*.18;
        ctx.beginPath();
        ctx.moveTo(a.x,a.y);
        ctx.lineTo(b.x,b.y);
        ctx.stroke();
      }
    }
  }

  dreamParticles.forEach((p,i)=>{
    const pulse=.65+.35*Math.sin(dreamPhase*5+p.seed);
    ctx.globalAlpha=.32+.68*pulse;
    ctx.beginPath();
    ctx.arc(p.x,p.y,1.7+(i%6===0?1.1:0),0,Math.PI*2);
    ctx.fill();
  });
  ctx.globalAlpha=1;

  dreamFrame=requestAnimationFrame(drawDream);
}

function updateSpecialMode(){
  launcherGrid.classList.remove("show");
  dreamCanvas.classList.toggle("show",mode==="dream");
  clock.classList.toggle("hidden-for-special",mode==="dream");

  if(mode==="dream"){
    setupDreamParticles();
    if(!dreamFrame) dreamFrame=requestAnimationFrame(drawDream);
  }else if(dreamFrame){
    cancelAnimationFrame(dreamFrame);
    dreamFrame=0;
  }

  updateAmbientWeather();
}

function requestWeather(){
  if(weather.loading) return;
  weather.loading=true; weather.error=""; displayToken=""; tickDisplay();
  if(!navigator.geolocation){weather.loading=false;weather.error="LOCATION UNAVAILABLE";displayToken="";tickDisplay();return;}
  navigator.geolocation.getCurrentPosition(
    pos=>{
      const lat=encodeURIComponent(pos.coords.latitude), lon=encodeURIComponent(pos.coords.longitude);
      const url="https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+"&current=temperature_2m,apparent_temperature,weather_code&timezone=auto";
      fetch(url).then(r=>{if(!r.ok) throw new Error("weather");return r.json();}).then(data=>{
        weather.loading=false; weather.loaded=true;
        weather.temperature=data.current?data.current.temperature_2m:null;
        weather.apparent=data.current?data.current.apparent_temperature:null;
        weather.code=data.current?data.current.weather_code:null;
        updateAmbientWeather();
        displayToken="";tickDisplay();
      }).catch(()=>{weather.loading=false;weather.error="WEATHER OFFLINE";displayToken="";tickDisplay();});
    },
    ()=>{weather.loading=false;weather.error="LOCATION OFF";updateAmbientWeather();displayToken="";tickDisplay();},
    {enableHighAccuracy:false,timeout:9000,maximumAge:600000}
  );
}

function applyTheme(animate){
  app.classList.toggle("theme-dark",theme==="dark");
  app.classList.toggle("theme-light",theme==="light");
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content",theme==="dark"?"#050505":"#f3f3ef");
  if(animate && canAnimate(clock)) clock.animate([{transform:"scale(1)"},{transform:"scale(.985)"},{transform:"scale(1)"}],{duration:300,easing:"cubic-bezier(.16,1,.3,1)"});
}

function showControls(){
  app.classList.add("controls-visible");
  clearTimeout(controlsTimer);
  controlsTimer=setTimeout(()=>app.classList.remove("controls-visible"),5200);
}
function hideControls(){app.classList.remove("controls-visible");clearTimeout(controlsTimer);}
function showToast(msg){toast.textContent=msg;toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("show"),950);}
async function requestWakeLock(){if(!("wakeLock" in navigator)||document.visibilityState!=="visible")return;try{wakeLock=await navigator.wakeLock.request("screen");}catch(_){}}

stage.addEventListener("click",()=>{app.classList.contains("controls-visible")?hideControls():showControls();requestWakeLock();});
controls.addEventListener("click",e=>e.stopPropagation());
modeActions.addEventListener("click",e=>{
  e.stopPropagation();
  const b=e.target.closest("[data-action]"); if(!b) return;
  const a=b.dataset.action;
  if(a==="weather") requestWeather();
  if(a==="timer-minus") adjustTimer(-1);
  if(a==="timer-plus") adjustTimer(1);
  if(a==="timer-toggle") toggleCountdown(timerState);
  if(a==="timer-reset") resetCountdown(timerState);
  if(a==="focus-toggle") toggleCountdown(focusState);
  if(a==="focus-reset") resetCountdown(focusState);
  if(a==="dream-morph"){dreamMode=0;actionToken="";updateActions();updateMeta();}
  if(a==="dream-field"){dreamMode=1;actionToken="";updateActions();updateMeta();}
  showControls();
});
styleButtons.forEach(b=>b.addEventListener("click",()=>{switchStyle(b.dataset.styleChoice);showControls();}));
modeButtons.forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();switchMode(b.dataset.modeChoice);showToast(MODE_LABELS[b.dataset.modeChoice]);}));
themeToggle.addEventListener("click",()=>{theme=theme==="dark"?"light":"dark";setStore("clock-theme",theme);applyTheme(true);showControls();});

launcherGrid.addEventListener("pointerdown",e=>{
  const button=e.target.closest(".launcher-item"); if(!button) return;
  clearTimeout(launcherHoldTimer);
  launcherHoldTimer=setTimeout(()=>{openLauncherEditor(Number(button.dataset.index));launcherHoldTimer=null;},620);
});
launcherGrid.addEventListener("pointerup",e=>{
  const button=e.target.closest(".launcher-item"); if(!button) return;
  if(launcherHoldTimer){clearTimeout(launcherHoldTimer);launcherHoldTimer=null;launchItem(Number(button.dataset.index));}
});
launcherGrid.addEventListener("pointercancel",()=>{clearTimeout(launcherHoldTimer);launcherHoldTimer=null;});
launcherGrid.addEventListener("contextmenu",e=>{const b=e.target.closest(".launcher-item");if(b){e.preventDefault();openLauncherEditor(Number(b.dataset.index));}});
launcherSave.addEventListener("click",saveLauncher);
launcherCancel.addEventListener("click",closeLauncherEditor);
launcherEditor.addEventListener("click",e=>{if(e.target===launcherEditor) closeLauncherEditor();});
window.addEventListener("resize",()=>{if(mode==="dream")setupDreamParticles();});

stage.addEventListener("touchstart",e=>{const t=e.changedTouches[0];touchStartX=t.clientX;touchStartY=t.clientY;},{passive:true});
stage.addEventListener("touchend",e=>{
  const t=e.changedTouches[0], dx=t.clientX-touchStartX, dy=t.clientY-touchStartY, ax=Math.abs(dx), ay=Math.abs(dy);
  if(Math.max(ax,ay)<58) return;
  if(ax>ay*1.18){
    const i=STYLES.indexOf(glyphStyle), dir=dx<0?1:-1, next=STYLES[(i+dir+STYLES.length)%STYLES.length];
    switchStyle(next,dir);showToast(STYLE_LABELS[next]);
  } else if(ay>ax*1.18){
    const i=MODES.indexOf(mode), dir=dy<0?1:-1, next=MODES[(i+dir+MODES.length)%MODES.length];
    switchMode(next,dir);showToast(MODE_LABELS[next]);
  }
  requestWakeLock();
},{passive:true});

document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){requestWakeLock();displayToken="";tickDisplay();}});
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));

app.dataset.mode=mode;
updateStyleButtons();
updateModeButtons();
applyTheme(false);
updateAmbientWeather();
mountMode(true);
setInterval(tickDisplay,500);
