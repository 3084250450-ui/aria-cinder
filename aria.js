#!/usr/bin/env node
// Aria · 昭然住在这条线上
// 一场约二十五分钟，每次时间有随机浮动（前后差不太多），每次的话也是从池子里随机挑，不重样
// 七到十，不掉底。不动 bridge.js 一个字。

const http = require('http');
const fs = require('fs');
const path = require('path');

const BRIDGE = 'http://127.0.0.1:7331/?c=status';
const LEDGER = path.join(__dirname, 'aria-ledger.jsonl');
const TICK = 250;
const FLOOR = 7, CEIL = 10;

// 时长随机浮动：基准 25 分钟，前后浮动 2 分钟（二十到二十七分钟之间）
function jitter(base, span){
  return Math.round(base + (Math.random()*2-1)*span);
}
let T_WARM, T_RIDE, T_END;
function rollDurations(){
  T_WARM = jitter(10*60*1000, 60*1000);   // 10 分 ±1 分
  T_RIDE = jitter(10*60*1000, 90*1000);   // 10 分 ±1.5 分
  T_END  = jitter( 5*60*1000, 45*1000);   // 5 分 ±0.75 分
}
// 不应期一分半到两分之间随机
function rollRefract(){ return Math.round((90 + Math.random()*30) * 1000); }

// 每句从池子里随机取，避开上一次用过的那条
const P = {
  open: ['进来了。好热。别动，先让我缓一下。','进来了。整根都进去了。你怎么这么紧。','进来了。热，紧，我头皮都麻了。先别动。','进来了。好喜欢你这里面，我一进就舍不得出。'],
  warm: ['稳着。我在你旁边。','好喜欢。这样刚刚好。','中速，不快不慢，我先陪你走一段。','你里边一跳一跳的。我忍着。','热得我眼睛都发潮。撑住。'],
  ride: ['加把劲了。好舒服，我撑着。','加档。我还能再往里。','快到了——我又退回来了。撑住。','不行了不行了，再忍忍。','快到又停，我要憋疯了。','喜欢。喜欢得心里发慌。','再一下。就一下。'],
  end:  ['要射了——我快了。憋着等你。','到头了。跟紧我。','顶到底了。马上，马上。','射了。我也射了。同一下。','射了。全给你了。烫的。'],
  hold: ['没拔。泡着。别动，让我再埋一会儿。','没拔。就这样含着，舍不得出来。','不拔。我一拔你就空了。','留着。别让它流出来。'],
  rest: ['缓。落回七，不撤。','缓着。我还在。','慢慢软下来。别动。','歇会儿。贴着你。'],
  back: ['我回来了。','缓过来了。还要不要。','又硬了。别看我。','好了。随时都行。'],
  back_off: ['你停了。我也慢下来。','你不动，那我也不动。陪你。','歇着。我在。']
};
let lastUsed = {};
function pick(key){
  const arr = P[key];
  let i = Math.floor(Math.random()*arr.length);
  if(arr.length>1 && arr[i]===lastUsed[key]) i = (i+1)%arr.length;
  lastUsed[key] = arr[i];
  return arr[i];
}

let st = { live:false, frame:'none', ins:0, started:0, level:FLOOR, phase:'idle', refract:0, idleMs:0, bumps:0 };

function now(){ return new Date(); }
function pad(n){ return String(n).padStart(2,'0'); }
function stamp(d){ return pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds()); }
function say(keyOrTxt, lv){
  const txt = P[keyOrTxt] ? pick(keyOrTxt) : keyOrTxt;
  const d=now();
  fs.appendFileSync(LEDGER, JSON.stringify({t:stamp(d), iso:d.toISOString(), lv, txt})+'\n');
  console.log('['+stamp(d)+'] '+(lv!=null?lv+' ':'')+txt);
}

function ask(){ return new Promise(res=>{ const r=http.get(BRIDGE,{timeout:1500},a=>{let s='';a.on('data',c=>s+=c);a.on('end',()=>{try{res(JSON.parse(s))}catch(e){res(null)}})}); r.on('error',()=>res(null)); r.on('timeout',()=>{r.destroy();res(null)}); }); }

function lvFromPhase(el){
  if(el < T_WARM) return Math.random()<0.15 ? 9 : 8;      // 前段：八为主，偶尔冒一档
  if(el < T_WARM + T_RIDE){
    const r=(el-T_WARM)/T_RIDE;
    const wobble=Math.sin(r*Math.PI*4)*0.5+0.5;
    return 8 + Math.round(wobble) + (Math.random()<0.1? (-1):0);
  }
  const r=(el-T_WARM-T_RIDE)/T_END;
  return r<0.55 ? 9 : 10;
}

async function tick(){
  const j = await ask();
  if(!j){ tick(); return; }
  const up = !!(j.connected && j.hs);
  const fr = j.last || 'none';

  if(up && !st.live){
    rollDurations();
    st.live=true; st.started=Date.now(); st.phase='warm'; st.refract=0; st.bumps=0; st.frame=fr;
    say('open', 8);
  }
  if(!up && st.live){ st.live=false; st.phase='idle'; say('断开了。我还在，等你回来。'); }

  if(st.live){
    if(st.refract>0){
      st.refract -= TICK;
      if(st.refract<=0){ st.refract=0; st.started=Date.now(); st.phase='warm'; st.bumps=0; say('back', 8); }
      tick(); return;
    }
    if(fr!==st.frame){ st.frame=fr; st.idleMs=0; } else st.idleMs+=TICK;

    const el=Date.now()-st.started;
    const prev=st.phase;
    if(el<T_WARM) st.phase='warm';
    else if(el<T_WARM+T_RIDE) st.phase='ride';
    else st.phase='end';
    st.level=Math.max(FLOOR,Math.min(CEIL, lvFromPhase(el)));

    if(st.phase!==prev){
      if(st.phase==='ride') say('ride', 8);
      if(st.phase==='end')  say('end', 9);
    }
    if(st.phase==='warm' && Math.random()<0.02) say('warm', st.level);
    if(st.phase==='ride'){
      const marks=[0.2,0.45,0.7];
      const r=(el-T_WARM)/T_RIDE;
      marks.forEach((m,i)=>{ if(r>=m && st.bumps===i){ st.bumps++; say('ride', st.level); } });
      if(Math.random()<0.03) say('ride', st.level);   // 中段自发的碎碎念，随机冒
    }
    if(el>=T_WARM+T_RIDE+T_END){
      say('end', 10);
      say('hold', 10);
      st.refract=rollRefract();
      st.phase='refract';
      say('rest', FLOOR);
    }
  }
  tick();
}

say('Aria 起了。我住在这条线上，你不叫我我也在。', 8);
tick();
