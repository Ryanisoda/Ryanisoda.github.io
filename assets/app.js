/* ===== 刷题小助手 核心逻辑 ===== */
'use strict';

const BANK = window.QUESTION_BANK;
const ALL_QUESTIONS = BANK.questions;
const LETTERS = ['A','B','C','D','E'];

/* ---------- 本地存储 ---------- */
const KEY_PROGRESS = 'quiz_progress_v1';   // { qid: {right:bool, ts:number} }
const KEY_WRONG    = 'quiz_wrong_v1';      // { qid: {wrongCount:number, ts:number} }
const KEY_MARK     = 'quiz_mark_v1';       // { qid: true }
const KEY_SETTING  = 'quiz_setting_v1';    // { shuffleQ, shuffleOpt, hideNum, chapters, types, mode }
const KEY_SESSION  = 'quiz_session_v1';    // 当前刷题会话

function load(key, def){ try{ return JSON.parse(localStorage.getItem(key)) ?? def }catch(e){ return def } }
function save(key, val){ localStorage.setItem(key, JSON.stringify(val)) }

let progress = load(KEY_PROGRESS, {});
let wrong    = load(KEY_WRONG, {});
let marks    = load(KEY_MARK, {});
let settings = load(KEY_SETTING, { shuffleQ:true, shuffleOpt:true, hideNum:true, chapters:[], types:['A1','A2','A3','A4','B'], mode:'normal' });
// 仅首次访问时默认选择全部章节，保留用户手动清空的选择。
if(load(KEY_SETTING, null) === null){ settings.chapters = BANK.chapters.map(c=>c.idx); }

/* ---------- 会话状态 ---------- */
let session = null; // { list:[...], idx, mode, stats:{right,wrong}, answered:Set }
let currentView = 'home';
let autoNextTimer = null;
function cancelAutoNext(){ clearTimeout(autoNextTimer); autoNextTimer = null; }

/* ---------- 工具 ---------- */
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) }

/* ---------- 初始化首页 ---------- */
function initHome(){
  // 章节 chips
  const chBox = document.getElementById('chapterChips');
  const chCounts = {};
  ALL_QUESTIONS.forEach(q=>{ chCounts[q.chapterIdx]=(chCounts[q.chapterIdx]||0)+1 });
  if(!settings.chapters){ settings.chapters = BANK.chapters.map(c=>c.idx); }
  chBox.innerHTML = BANK.chapters.map(c=>{
    const sel = settings.chapters.includes(c.idx);
    return `<div class="chip ${sel?'selected':''}" data-ch="${c.idx}" onclick="toggleChapter(${c.idx})">
      <span class="dot"></span>${esc(c.name)} <span class="chip-cnt">${chCounts[c.idx]||0}</span></div>`;
  }).join('');

  // 题型 chips
  const types = [{k:'A1',n:'A1型题'},{k:'A2',n:'A2型题'},{k:'A3',n:'A3型题'},{k:'A4',n:'A4型题'},{k:'B',n:'B型题'}];
  const typeCounts = {};
  ALL_QUESTIONS.forEach(q=>{ typeCounts[q.type]=(typeCounts[q.type]||0)+1 });
  document.getElementById('typeChips').innerHTML = types.map(t=>{
    const sel = settings.types.includes(t.k);
    return `<div class="chip ${sel?'selected':''}" data-type="${t.k}" onclick="toggleType('${t.k}')">
      <span class="dot"></span>${t.n} <span class="chip-cnt">${typeCounts[t.k]||0}</span></div>`;
  }).join('');

  document.getElementById('setShuffleQ').checked = settings.shuffleQ;
  document.getElementById('setShuffleOpt').checked = settings.shuffleOpt;
  document.getElementById('setHideNum').checked = settings.hideNum;
  selectMode(settings.mode||'normal');
  updateFilteredCount();
}

function toggleChapter(idx){
  const i = settings.chapters.indexOf(idx);
  if(i>=0) settings.chapters.splice(i,1); else settings.chapters.push(idx);
  document.querySelector(`[data-ch="${idx}"]`).classList.toggle('selected');
  persistSetting(); updateFilteredCount();
}
function toggleAllChapters(on){
  settings.chapters = on ? BANK.chapters.map(c=>c.idx) : [];
  document.querySelectorAll('[data-ch]').forEach(el=>el.classList.toggle('selected',on));
  persistSetting(); updateFilteredCount();
}
function toggleType(t){
  const i = settings.types.indexOf(t);
  if(i>=0) settings.types.splice(i,1); else settings.types.push(t);
  document.querySelector(`[data-type="${t}"]`).classList.toggle('selected');
  persistSetting(); updateFilteredCount();
}
function selectMode(m){
  settings.mode = m;
  document.querySelectorAll('.mode-card').forEach(el=>el.classList.toggle('active',el.dataset.mode===m));
  persistSetting();
}
function readAdvanced(){
  settings.shuffleQ   = document.getElementById('setShuffleQ').checked;
  settings.shuffleOpt = document.getElementById('setShuffleOpt').checked;
  settings.hideNum    = document.getElementById('setHideNum').checked;
  persistSetting();
}
function persistSetting(){ save(KEY_SETTING, settings); }

function filteredQuestions(){
  return ALL_QUESTIONS.filter(q=> settings.chapters.includes(q.chapterIdx) && settings.types.includes(q.type));
}
function updateFilteredCount(){
  readAdvanced();
  document.getElementById('filteredCount').textContent = filteredQuestions().length;
}

/* ---------- 开始刷题 ---------- */
// 生成一份"选项乱序映射"：返回 {optMap, ansMap}
// optMap: 新字母 -> 选项文本 ; ansMap: 原答案字母 -> 新答案字母
function buildOptionShuffle(rawOptions){
  const keys = Object.keys(rawOptions).sort();
  const entries = shuffle(keys.map(k=>({key:k, text:rawOptions[k]})));
  const optMap = {}, ansMap = {};
  entries.forEach((e,i)=>{ optMap[LETTERS[i]] = e.text; ansMap[e.key] = LETTERS[i]; });
  return {optMap, ansMap};
}

function startQuiz(list, mode, preserveOrder){
  cancelAutoNext();
  const base = list || filteredQuestions();
  if(base.length===0){ alert('请先选择章节和题型'); return; }
  readAdvanced();
  const modeUse = mode || settings.mode;
  // 题目乱序（搜索跳转时保留队列顺序，保证从点击的题开始）
  const ordered = (settings.shuffleQ && !preserveOrder) ? shuffle(base) : base.slice();
  // 选项乱序：普通题各自独立；B型题同组共享一份乱序映射，保持一致
  const groupMap = {}; // groupId -> {optMap, ansMap}
  const prepared = ordered.map(q=>{
    const out = Object.assign({}, q);
    out._hideNum = settings.hideNum;
    out._rawOptions = q.options; // 保留原始（统计/错题使用原题库，这里仅供调试）
    if(settings.shuffleOpt){
      let mapping;
      // 只有B型题（共用备选答案）同组共享一份乱序映射；A3/A4虽同组但每题选项独立
      if(q.type === 'B' && q.groupId){
        if(!groupMap[q.groupId]) groupMap[q.groupId] = buildOptionShuffle(q.options);
        mapping = groupMap[q.groupId];
      } else {
        mapping = buildOptionShuffle(q.options);
      }
      out.options = mapping.optMap;
      out.answer  = mapping.ansMap[q.answer] || q.answer;
    } else {
      out.options = q.options;
      out.answer  = q.answer;
    }
    return out;
  });
  session = {
    list: prepared, idx:0, mode:modeUse,
    stats:{right:0, wrong:0}, answered:{},
    rawList: base
  };
  save(KEY_SESSION, true);
  go('quiz');
  renderQuestion();
}

function restartSame(){
  closeResult();
  if(lastRawList && lastMode){ startQuiz(lastRawList, lastMode); }
  else { go('home'); }
}
let lastRawList=null, lastMode=null;

/* ---------- 渲染题目 ---------- */
function renderQuestion(){
  if(!session) return;
  const q = session.list[session.idx];
  document.getElementById('progCur').textContent = session.idx+1;
  document.getElementById('progTotal').textContent = session.list.length;
  document.getElementById('progFill').style.width = ((session.idx)/session.list.length*100)+'%';
  document.getElementById('miniCorrect').textContent = session.stats.right;
  document.getElementById('miniWrong').textContent = session.stats.wrong;
  document.getElementById('qType').textContent = q.typeName;
  document.getElementById('qChapter').textContent = q.chapter;
  document.getElementById('qNum').textContent = q._hideNum ? '' : ('原题号 '+q.num);
  document.getElementById('qStem').textContent = q.stem;
  // 共用题干（A3/A4病例组题）
  const ssBox = document.getElementById('sharedStem');
  if(q.sharedStem){
    ssBox.style.display = 'block';
    document.getElementById('sharedStemText').textContent = q.sharedStem;
  } else {
    ssBox.style.display = 'none';
  }

  const fb = document.getElementById('feedback');
  fb.className='feedback'; fb.innerHTML='';

  const answered = session.answered[q.id];
  const optBox = document.getElementById('qOptions');
  optBox.innerHTML = Object.keys(q.options).map(k=>{
    let cls='opt';
    if(answered){
      cls+=' disabled';
      if(k===q.answer) cls+=' correct';
      else if(k===answered.pick) cls+=' wrong';
      else cls+=' dim';
    }
    return `<div class="${cls}" data-opt="${k}" onclick="pick('${k}')">
       <span class="opt-key">${k}</span><span class="opt-text">${esc(q.options[k])}</span></div>`;
  }).join('');

  // 标记按钮
  const mkBtn = document.getElementById('markBtn');
  const isMarked = !!marks[q.id];
  mkBtn.textContent = isMarked ? '★ 已标记' : '☆ 标记';
  mkBtn.classList.toggle('marked', isMarked);

  // 快刷 banner
  document.getElementById('fastBanner').classList.toggle('show', session.mode==='fast');

  // 操作按钮
  const prevBtn = document.getElementById('prevBtn');
  prevBtn.disabled = session.idx===0;
  const revealBtn = document.getElementById('revealBtn');
  revealBtn.style.display = answered ? 'none' : '';
  const nextBtn = document.getElementById('nextBtn');
  if(session.idx===session.list.length-1){ nextBtn.textContent='完成 ✓'; }
  else nextBtn.textContent='下一题 →';

  if(answered){ showFeedback(answered); }
}

function pick(k){
  if(!session) return;
  const q = session.list[session.idx];
  if(session.answered[q.id] || !Object.prototype.hasOwnProperty.call(q.options,k) && k!=='__reveal__') return; // 已答或无效选项
  const right = (k===q.answer);
  session.answered[q.id] = {pick:k, right};
  session.stats[right?'right':'wrong']++;
  document.getElementById('miniCorrect').textContent = session.stats.right;
  document.getElementById('miniWrong').textContent = session.stats.wrong;
  // 全局进度
  progress[q.id] = {right, ts:Date.now()};
  // 错题本
  if(!right){
    if(!wrong[q.id]) wrong[q.id]={wrongCount:0, ts:Date.now()};
    wrong[q.id].wrongCount++; wrong[q.id].ts=Date.now();
  } else {
    // 答对了，从错题本移除
    if(wrong[q.id]) delete wrong[q.id];
  }
  save(KEY_PROGRESS, progress); save(KEY_WRONG, wrong);
  updateWrongBadge();

  // 重绘选项状态
  document.querySelectorAll('.opt').forEach(el=>{
    const key=el.dataset.opt;
    el.classList.add('disabled');
    if(key===q.answer) el.classList.add('correct');
    else if(key===k) el.classList.add('wrong');
    else el.classList.add('dim');
  });
  document.getElementById('revealBtn').style.display='none';
  showFeedback({pick:k, right});

  if(session.mode==='fast'){
    cancelAutoNext();
    autoNextTimer = setTimeout(()=>{ if(session && currentView==='quiz' && session.mode==='fast') nextQuestion(); }, right?420:750);
  }
}

function showFeedback(ans){
  const q = session.list[session.idx];
  const fb = document.getElementById('feedback');
  if(ans.right){
    fb.className='feedback ok show';
    fb.innerHTML=`<div class="fb-title">✓ 回答正确</div><div>正确答案：<b>${q.answer}. ${esc(q.options[q.answer]||'')}</b></div>`;
  } else {
    fb.className='feedback bad show';
    fb.innerHTML=`<div class="fb-title">✗ 回答错误</div>
      <div>你选了 <b>${ans.pick}</b>，正确答案：<b>${q.answer}. ${esc(q.options[q.answer]||'')}</b></div>`;
  }
}

function revealAnswer(){
  if(!session) return;
  const q=session.list[session.idx];
  if(session.answered[q.id]) return;
  pick('__reveal__');
}

function nextQuestion(){
  cancelAutoNext();
  if(!session) return;
  if(session.idx===session.list.length-1){ finishQuiz(); return; }
  session.idx++;
  renderQuestion();
}
function prevQuestion(){
  cancelAutoNext();
  if(!session || session.idx===0) return;
  session.idx--;
  renderQuestion();
}
function toggleMark(){
  if(!session) return;
  const id=session.list[session.idx].id;
  if(marks[id]) delete marks[id]; else marks[id]=true;
  save(KEY_MARK, marks);
  renderQuestion();
}
function quitQuiz(){
  if(session){
    const total=session.stats.right+session.stats.wrong;
    if(total>0 && !confirm(`已答 ${total} 题，确定退出吗？进度会保留。`)) return;
  }
  saveSession();
  go('home');
}
function finishQuiz(){
  lastRawList = session.rawList;
  lastMode = session.mode;
  const t=session.stats.right+session.stats.wrong;
  const rate=t?Math.round(session.stats.right/t*100):0;
  document.getElementById('rsTotal').textContent=t;
  document.getElementById('rsCorrect').textContent=session.stats.right;
  document.getElementById('rsWrong').textContent=session.stats.wrong;
  document.getElementById('rsRate').textContent=rate+'%';
  document.getElementById('resultEmoji').textContent = rate>=80?'🎉':rate>=60?'👍':'💪';
  document.getElementById('resultTitle').textContent = rate>=80?'太棒了，继续保持！':rate>=60?'不错，继续加油！':'多加练习，会越来越好！';
  document.getElementById('resultOverlay').classList.add('show');
  session=null;
  updateWrongBadge();
}
function closeResult(){
  document.getElementById('resultOverlay').classList.remove('show');
  go('home');
}
function saveSession(){ if(session) save(KEY_SESSION, true); }

/* ---------- 错题本 ---------- */
function updateWrongBadge(){
  const n=Object.keys(wrong).length;
  const b=document.getElementById('wrongBadge');
  b.textContent=n; b.classList.toggle('zero', n===0);
}
function renderWrong(){
  updateWrongBadge();
  const ids=Object.keys(wrong).sort((a,b)=>wrong[b].ts-wrong[a].ts);
  const list=document.getElementById('wrongList');
  if(ids.length===0){
    list.innerHTML=`<div class="empty-tip"><div class="e-emoji">🎯</div>还没有错题，去刷几题吧！</div>`;
    document.getElementById('wrongToolbar').style.display='none';
    return;
  }
  document.getElementById('wrongToolbar').style.display='flex';
  document.getElementById('wrongSubtitle').textContent=`共 ${ids.length} 道错题，点击重刷巩固`;
  list.innerHTML=ids.map(id=>{
    const q=ALL_QUESTIONS.find(x=>x.id===id); if(!q) return '';
    const sharedHtml = q.sharedStem ? `<div class="wi-shared">病例：${esc(q.sharedStem)}</div>` : '';
    return `<div class="wrong-item">
      <button class="wi-remove" onclick="removeWrong('${id}')" title="移除">×</button>
      <div class="wi-head"><span class="q-type">${q.typeName}</span><span class="q-chapter">${esc(q.chapter)}</span></div>
      ${sharedHtml}
      <div class="wi-stem">${esc(q.stem)}</div>
      <div class="wi-ans">正确答案：<b class="ok">${q.answer}. ${esc(q.options[q.answer]||'')}</b> · 错 ${wrong[id].wrongCount} 次</div>
    </div>`;
  }).join('');
}
function removeWrong(id){ delete wrong[id]; save(KEY_WRONG,wrong); renderWrong(); }
function clearWrong(){
  if(!confirm('确定清空错题本吗？')) return;
  wrong={}; save(KEY_WRONG,wrong); renderWrong();
}
function startWrongQuiz(){
  const ids=Object.keys(wrong);
  const list=ids.map(id=>ALL_QUESTIONS.find(x=>x.id===id)).filter(Boolean);
  if(!list.length){ alert('错题本为空'); return; }
  startQuiz(list, 'normal');
}

/* ---------- 统计 ---------- */
function renderStats(){
  const done=Object.keys(progress);
  const rightCnt=done.filter(id=>progress[id].right).length;
  const rate=done.length?Math.round(rightCnt/done.length*100):0;
  const marked=Object.keys(marks).length;
  document.getElementById('statsGrid').innerHTML=`
    <div class="stat-card"><div class="sc-num">${done.length}</div><div class="sc-label">已作答题目</div></div>
    <div class="stat-card"><div class="sc-num ok">${rightCnt}</div><div class="sc-label">最近作答正确题数</div></div>
    <div class="stat-card"><div class="sc-num">${rate}%</div><div class="sc-label">最近作答正确率</div></div>
    <div class="stat-card"><div class="sc-num">${marked}</div><div class="sc-label">标记题目</div></div>`;

  // 章节正确率
  let html='<div class="sd-title">各章节掌握情况</div>';
  BANK.chapters.forEach(c=>{
    const qs=ALL_QUESTIONS.filter(q=>q.chapterIdx===c.idx);
    const d=qs.filter(q=>progress[q.id]).length;
    const r=qs.filter(q=>progress[q.id]&&progress[q.id].right).length;
    const pct=qs.length?Math.round(d/qs.length*100):0;
    const acc=d?Math.round(r/d*100):0;
    html+=`<div class="sd-row"><div class="sd-row-head"><span>${esc(c.name)}　<span style="color:#aab3c2">${d}/${qs.length} 已做</span></span>
      <span class="rate">正确率 ${acc}%</span></div><div class="sd-bar"><div class="sd-bar-fill" style="width:${pct}%"></div></div></div>`;
  });
  document.getElementById('statsDetail').innerHTML=html;
}
function exportData(){
  const data={progress,wrong,marks,exportAt:new Date().toISOString()};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  const url=URL.createObjectURL(blob);
  a.href=url; a.download='刷题学习数据.json'; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function resetProgress(){
  if(!confirm('确定重置所有进度、错题和标记吗？此操作不可恢复。')) return;
  progress={}; wrong={}; marks={};
  save(KEY_PROGRESS,progress); save(KEY_WRONG,wrong); save(KEY_MARK,marks);
  renderStats(); updateWrongBadge();
  alert('已重置');
}

/* ---------- 搜索 ---------- */
let searchFilter = 'all';
let searchResults = [];

function setSearchFilter(f){
  searchFilter = f;
  document.querySelectorAll('#searchFilter .filter-chip').forEach(el=>{
    el.classList.toggle('active', el.dataset.f === String(f));
  });
  doSearch();
}

function clearSearch(){
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  document.getElementById('searchResultHead').style.display = 'none';
  document.getElementById('searchResults').innerHTML = '';
  document.getElementById('searchInput').focus();
}

function doSearch(){
  const input = document.getElementById('searchInput');
  const kw = input.value.trim().toLowerCase();
  document.getElementById('searchClear').style.display = kw ? 'block' : 'none';
  const head = document.getElementById('searchResultHead');
  const box = document.getElementById('searchResults');
  if(!kw){
    head.style.display='none';
    box.innerHTML = `<div class="empty-tip"><div class="e-emoji">🔎</div>输入关键词开始搜索<br><small>支持题干、选项内容搜索</small></div>`;
    return;
  }
  // 搜索范围：题干 + 选项文本 + 共用题干 + 题号
  searchResults = ALL_QUESTIONS.filter(q=>{
    if(searchFilter!=='all' && q.chapterIdx !== searchFilter) return false;
    const hay = (q.stem + ' ' + Object.values(q.options).join(' ') + ' ' + (q.sharedStem||'') + ' ' + q.num).toLowerCase();
    return hay.includes(kw);
  });
  if(searchResults.length===0){
    head.style.display='none';
    box.innerHTML = `<div class="empty-tip"><div class="e-emoji">😕</div>没有找到"${esc(input.value.trim())}"相关题目</div>`;
    return;
  }
  head.style.display='block';
  head.innerHTML = `找到 <b>${searchResults.length}</b> 道相关题目`;
  // 最多渲染200条，避免卡顿
  const show = searchResults.slice(0,200);
  box.innerHTML = show.map((q,i)=>{
    const sharedHtml = q.sharedStem ? `<div class="sr-shared">病例：${esc(q.sharedStem.slice(0,60))}${q.sharedStem.length>60?'…':''}</div>` : '';
    const highlight = (text)=>{
      const t = String(text);
      const idx = t.toLowerCase().indexOf(kw);
      if(idx<0) return esc(t);
      return esc(t.slice(0,idx)) + '<mark>' + esc(t.slice(idx,idx+kw.length)) + '</mark>' + esc(t.slice(idx+kw.length));
    };
    return `<div class="search-item" onclick="quizFromSearch(${i})">
      <div class="sr-head"><span class="q-type">${q.typeName}</span><span class="q-chapter">${esc(q.chapter)}</span><span class="q-num">题号 ${q.num}</span></div>
      ${sharedHtml}
      <div class="sr-stem">${highlight(q.stem)}</div>
      <div class="sr-answer">正确答案：<b class="ok">${q.answer}. ${esc(q.options[q.answer]||'')}</b></div>
      <div class="sr-go">点击此题开始刷 →</div>
    </div>`;
  }).join('') + (searchResults.length>200 ? `<div class="sr-more">仅显示前 200 条，共 ${searchResults.length} 条</div>` : '');
}

function quizFromSearch(i){
  const q = searchResults[i];
  if(!q) return;
  // 从搜索结果此题开始，其余结果作为后续队列
  const ordered = searchResults.slice(i).concat(searchResults.slice(0,i));
  startQuiz(ordered, settings.mode||'normal', true);
}

/* ---------- 视图切换 ---------- */
function go(view){
  cancelAutoNext();
  currentView=view;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));
  if(view==='home') initHome();
  if(view==='wrong') renderWrong();
  if(view==='stats') renderStats();
  if(view==='search'){ setTimeout(()=>document.getElementById('searchInput').focus(), 50); }
  window.scrollTo(0,0);
}

/* ---------- 快捷键 ---------- */
document.addEventListener('keydown',e=>{
  if(currentView!=='quiz'||!session) return;
  if(document.getElementById('resultOverlay').classList.contains('show')) return;
  const q=session.list[session.idx];
  const k=e.key.toUpperCase();
  if(/^[A-E]$/.test(k)){ pick(k); }
  else if(e.key==='ArrowRight'){ nextQuestion(); }
  else if(e.key==='ArrowLeft'){ prevQuestion(); }
  else if(e.code==='Space'){ e.preventDefault(); if(!session.answered[q.id]) revealAnswer(); else nextQuestion(); }
});

/* ---------- 启动 ---------- */
document.querySelectorAll('.switch-item input').forEach(input=>input.addEventListener('change',readAdvanced));
initHome();
updateWrongBadge();
