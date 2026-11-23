'use strict';
const E = QuizEngine;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let BANK, ALL_QUESTIONS, byId, chapterNames, courseId;
let progress={}, wrong={}, marks={}, settings={};
let session=null, lastRawList=null, lastMode=null, currentView='home';
let searchFilter='all', searchResults=[];
const availableCourses=[];
function notice(message){ $('systemNotice').textContent=message; $('systemNotice').hidden=!message; }
function load(key,fallback){try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{notice('浏览器未能保存学习记录，请允许网站存储或导出本课程数据备份。');return false;}}
function storageKey(suffix){return 'quiz:v2:'+courseId+':'+suffix;}
function persistSetting(){save(storageKey('settings'),settings);}
function persistLearning(){save(storageKey('progress'),progress);save(storageKey('wrong'),wrong);save(storageKey('marks'),marks);}
function validMap(value){return value && typeof value==='object' && !Array.isArray(value) ? value : {};}
function migrateLegacy(){
  if(courseId!=='preventive-medicine' || load(storageKey('migrated'),false))return;
  // Keep legacy keys intact. Never overwrite an existing v2 category.
  let ok=true;
  for(const [old,suffix] of [['quiz_progress_v1','progress'],['quiz_wrong_v1','wrong'],['quiz_mark_v1','marks']]){
    const data=load(old,null);
    if(data && load(storageKey(suffix),null)===null)ok=save(storageKey(suffix),validMap(data))&&ok;
  }
  const old=load('quiz_setting_v1',null);
  if(old && load(storageKey('settings'),null)===null){
    const migrated={...old,chapters:Array.isArray(old.chapters)?old.chapters.map(i=>'chapter-'+(i+1)):BANK.chapters.map(c=>c.id),types:Array.isArray(old.types)?[...new Set([...old.types,'X'])]:Object.keys(E.TYPES)};
    ok=save(storageKey('settings'),migrated)&&ok;
  }
  if(ok)save(storageKey('migrated'),true);
}
function changeCourse(nextId){
  if(nextId===courseId)return;
  if(!availableCourses.includes(nextId)){ $('courseSelect').value=courseId;return; }
  if(session && currentView==='quiz' && !confirm('切换课程将结束本轮刷题，已提交的学习记录会保留。确定切换吗？')){ $('courseSelect').value=courseId;return; }
  activateCourse(nextId);
}
function activateCourse(id){
  courseId=id;BANK=window.QUIZ_BANKS[id];ALL_QUESTIONS=BANK.questions;
  byId=new Map(ALL_QUESTIONS.map(q=>[q.id,q]));chapterNames=new Map(BANK.chapters.map(c=>[c.id,c.title]));
  migrateLegacy();
  progress=validMap(load(storageKey('progress'),{}));wrong=validMap(load(storageKey('wrong'),{}));marks=validMap(load(storageKey('marks'),{}));
  // Stale IDs from removed questions are excluded from all counters and re-exports.
  for(const map of [progress,wrong,marks]) for(const key of Object.keys(map))if(!byId.has(key))delete map[key];
  const defaults={shuffleQ:true,shuffleOpt:true,hideNum:true,chapters:BANK.chapters.map(c=>c.id),types:Object.keys(E.TYPES),mode:'normal'};
  const stored=validMap(load(storageKey('settings'),{}));settings={...defaults,...stored};
  settings.chapters=Array.isArray(settings.chapters)?settings.chapters.filter(c=>chapterNames.has(c)):defaults.chapters;
  settings.types=Array.isArray(settings.types)?settings.types.filter(t=>Object.hasOwn(E.TYPES,t)):defaults.types;
  for(const k of ['shuffleQ','shuffleOpt','hideNum'])if(typeof settings[k]!=='boolean')settings[k]=defaults[k];
  if(!['normal','fast'].includes(settings.mode))settings.mode='normal';
  session=null;lastRawList=null;lastMode=null;searchFilter='all';searchResults=[];
  $('searchInput').value='';$('searchResults').innerHTML='';$('searchResultHead').style.display='none';$('searchClear').style.display='none';
  $('resultOverlay').classList.remove('show');$('courseSelect').value=id;
  document.title='刷题小助手 · '+BANK.course.title;$('courseDescription').textContent=BANK.course.description||BANK.course.title;
  save('quiz:v2:last-course',id);
  renderSearchFilters();go('home');updateWrongBadge();
}
function initHome(){
  const chapterCounts=new Map(BANK.chapters.map(c=>[c.id,0]));
  ALL_QUESTIONS.forEach(q=>chapterCounts.set(q.chapterId,chapterCounts.get(q.chapterId)+1));
  $('chapterChips').innerHTML=BANK.chapters.map(c=>`<button type="button" class="chip ${settings.chapters.includes(c.id)?'selected':''}" data-action="chapter" data-id="${c.id}" aria-pressed="${settings.chapters.includes(c.id)}"><span class="dot"></span>${esc(c.title)}<span class="chip-cnt">${chapterCounts.get(c.id)}</span></button>`).join('');
  $('setShuffleQ').checked=settings.shuffleQ;$('setShuffleOpt').checked=settings.shuffleOpt;$('setHideNum').checked=settings.hideNum;
  selectMode(settings.mode);renderTypeChips();updateFilteredCount();
}
function renderTypeChips(){
  const counts=E.countTypes(ALL_QUESTIONS,settings.chapters);
  $('typeChips').innerHTML=Object.entries(E.TYPES).map(([type,title])=>`<button type="button" class="chip ${settings.types.includes(type)?'selected':''} ${counts[type]===0?'empty-chip':''}" data-action="type" data-id="${type}" aria-pressed="${settings.types.includes(type)}"><span class="dot"></span>${title}<span class="chip-cnt" data-count="${type}">${counts[type]}</span></button>`).join('');
}
function toggleChapter(id){
  if(!chapterNames.has(id))return;
  settings.chapters=settings.chapters.includes(id)?settings.chapters.filter(x=>x!==id):[...settings.chapters,id];persistSetting();initHome();
}
function toggleAllChapters(on){settings.chapters=on?BANK.chapters.map(c=>c.id):[];persistSetting();initHome();}
function toggleType(type){if(!Object.hasOwn(E.TYPES,type))return;settings.types=settings.types.includes(type)?settings.types.filter(t=>t!==type):[...settings.types,type];persistSetting();renderTypeChips();updateFilteredCount();}
function selectMode(mode){settings.mode=mode;document.querySelectorAll('.mode-card').forEach(el=>el.classList.toggle('active',el.dataset.mode===mode));persistSetting();}
function readAdvanced(){settings.shuffleQ=$('setShuffleQ').checked;settings.shuffleOpt=$('setShuffleOpt').checked;settings.hideNum=$('setHideNum').checked;persistSetting();}
function filteredQuestions(){return ALL_QUESTIONS.filter(q=>settings.chapters.includes(q.chapterId)&&settings.types.includes(q.type));}
function updateFilteredCount(){const n=filteredQuestions().length;$('filteredCount').textContent=String(n);document.querySelector('.start-btn').disabled=n===0;}
function startQuiz(list,mode,preserveOrder){
  readAdvanced();const base=list||filteredQuestions();if(!base.length){alert('请先选择有题目的章节和题型');return;}
  const ordered=settings.shuffleQ&&!preserveOrder?E.shuffle(base):base.slice();
  session={courseId,list:E.prepareQuestions(ordered,settings.shuffleOpt),idx:0,mode:mode||settings.mode,stats:{right:0,wrong:0},answered:{},drafts:{},rawList:base};
  go('quiz');
}
function getCurrent(){return session?.list[session.idx];}
function answerText(q,ids,display=false){
  const opts=display?q.displayOptions:q.options;
  return opts.filter(o=>ids.includes(o.id)).map(o=>(display?o.label:o.id)+'. '+o.text).join('；');
}
function renderQuestion(){
  const q=getCurrent();if(!q)return;
  const ans=session.answered[q.id], selected=ans?ans.picks:(session.drafts[q.id]||[]), multiple=q.type==='X';
  $('progCur').textContent=String(session.idx+1);$('progTotal').textContent=String(session.list.length);
  $('progFill').style.width=((session.idx+1)/session.list.length*100)+'%';
  $('miniCorrect').textContent=String(session.stats.right);$('miniWrong').textContent=String(session.stats.wrong);
  $('qType').textContent=E.TYPES[q.type];$('qChapter').textContent=chapterNames.get(q.chapterId);$('qNum').textContent=settings.hideNum?'':'原题号 '+q.num;
  $('qStem').textContent=q.stem;$('sharedStem').style.display=q.sharedStem?'block':'none';$('sharedStemText').textContent=q.sharedStem||'';
  $('questionHint').textContent=multiple?(ans?'多选题已提交，以下显示本次结果。':'多选题：选好后点击“提交答案”。少选、多选或错选均判错。'):'单选题：选择一个选项即可判分。';
  $('qOptions').innerHTML=q.displayOptions.map(o=>{
    let cls='opt';const picked=selected.includes(o.id),correct=q.answers.includes(o.id);
    if(ans){cls+=' disabled';if(correct)cls+=picked?' correct':' missed';else if(picked)cls+=' wrong';else cls+=' dim';}
    else if(picked)cls+=' selected';
    return `<button type="button" class="${cls}" data-action="pick" data-id="${o.id}" data-label="${o.label}" aria-pressed="${picked}" ${ans?'disabled':''}><span class="opt-key">${o.label}</span><span class="opt-text">${esc(o.text)}</span>${multiple?'<span class="opt-check" aria-hidden="true">'+(picked?'☑':'☐')+'</span>':''}</button>`;
  }).join('');
  $('markBtn').textContent=marks[q.id]?'★ 已标记':'☆ 标记';$('markBtn').classList.toggle('marked',!!marks[q.id]);
  $('fastBanner').classList.toggle('show',session.mode==='fast');$('prevBtn').disabled=session.idx===0;
  $('submitBtn').hidden=!multiple||!!ans;$('submitBtn').disabled=selected.length===0;
  $('revealBtn').hidden=multiple||!!ans;$('revealBtn').style.display=multiple||ans?'none':'';
  $('nextBtn').disabled=multiple&&!ans;$('nextBtn').textContent=session.idx===session.list.length-1?'完成 ✓':'下一题 →';
  $('feedback').className='feedback';$('feedback').innerHTML='';if(ans)showFeedback(ans);
}
function pick(id){
  const q=getCurrent();if(!q||session.answered[q.id]||!q.options.some(o=>o.id===id))return;
  if(q.type==='X'){
    const picks=session.drafts[q.id]||[];session.drafts[q.id]=picks.includes(id)?picks.filter(x=>x!==id):[...picks,id];renderQuestion();
  } else recordAnswer([id],false);
}
function submitMultiple(){const q=getCurrent();if(!q||q.type!=='X'||session.answered[q.id])return;const picks=session.drafts[q.id]||[];if(!picks.length)return;recordAnswer(picks.slice(),false);}
function recordAnswer(picks,revealed){
  const q=getCurrent();if(!q||session.answered[q.id])return;
  const right=!revealed&&E.sameAnswers(picks,q.answers);
  session.answered[q.id]={picks:picks.slice(),right,revealed};session.stats[right?'right':'wrong']++;
  progress[q.id]={right,ts:Date.now()};
  if(right)delete wrong[q.id];else wrong[q.id]={wrongCount:(wrong[q.id]?.wrongCount||0)+1,ts:Date.now()};
  persistLearning();updateWrongBadge();
  // Fast mode advances synchronously only on a correct submitted answer.
  if(session.mode==='fast'&&right)nextQuestion();else renderQuestion();
}
function showFeedback(ans){
  const q=getCurrent();$('feedback').className='feedback '+(ans.right?'ok':'bad')+' show';
  const title=ans.revealed?'已查看答案，计入待复习':ans.right?'✓ 回答正确':'✗ 回答错误';
  $('feedback').innerHTML=`<div class="fb-title">${title}</div><div>你的选择：${ans.picks.length?esc(answerText(q,ans.picks,true)):'未作答'}</div><div>正确答案：<b>${esc(answerText(q,q.answers,true))}</b></div>${q.explanation?'<div class="explanation">解析：'+esc(q.explanation)+'</div>':''}`;
}
function revealAnswer(){const q=getCurrent();if(q&&q.type!=='X'&&!session.answered[q.id])recordAnswer([],true);}
function nextQuestion(){
  const q=getCurrent();if(!q||(q.type==='X'&&!session.answered[q.id]))return;
  if(session.idx===session.list.length-1){finishQuiz();return;}session.idx++;renderQuestion();
}
function prevQuestion(){if(session&&session.idx>0){session.idx--;renderQuestion();}}
function toggleMark(){const q=getCurrent();if(!q)return;if(marks[q.id])delete marks[q.id];else marks[q.id]=true;save(storageKey('marks'),marks);renderQuestion();}
function quitQuiz(){if(session&&!confirm('结束本轮刷题？已提交的答题记录会保留，未提交的多选不计入记录。'))return;session=null;go('home');}
function finishQuiz(){
  if(!session)return;lastRawList=session.rawList;lastMode=session.mode;
  const t=session.stats.right+session.stats.wrong,rate=t?Math.round(session.stats.right/t*100):0;
  $('rsTotal').textContent=String(t);$('rsCorrect').textContent=String(session.stats.right);$('rsWrong').textContent=String(session.stats.wrong);$('rsRate').textContent=rate+'%';
  $('resultEmoji').textContent=rate>=80?'🎉':rate>=60?'👍':'💪';$('resultTitle').textContent='本轮刷题完成';
  $('resultOverlay').classList.add('show');session=null;updateWrongBadge();
}
function closeResult(){$('resultOverlay').classList.remove('show');go('home');}
function restartSame(){const list=lastRawList,mode=lastMode;closeResult();if(list&&mode)startQuiz(list,mode);}
function updateWrongBadge(){const n=Object.keys(wrong).length;$('wrongBadge').textContent=String(n);$('wrongBadge').classList.toggle('zero',n===0);}
function renderWrong(){
  const ids=Object.keys(wrong).sort((a,b)=>(wrong[b].ts||0)-(wrong[a].ts||0));updateWrongBadge();
  $('wrongSubtitle').textContent=ids.length?'本课程共 '+ids.length+' 道错题，答对后自动移出错题本':'做错的题目会自动收录到这里';
  $('wrongToolbar').style.display=ids.length?'flex':'none';
  $('wrongList').innerHTML=ids.length?ids.map(id=>{const q=byId.get(id);return `<div class="wrong-item"><button type="button" class="wi-remove" data-action="remove-wrong" data-id="${id}" aria-label="移除错题">×</button><div class="wi-head"><span class="q-type">${E.TYPES[q.type]}</span><span class="q-chapter">${esc(chapterNames.get(q.chapterId))}</span><span class="q-num">原题号 ${q.num}</span></div>${q.sharedStem?'<div class="wi-shared">'+esc(q.sharedStem)+'</div>':''}<div class="wi-stem">${esc(q.stem)}</div><div class="wi-ans">正确答案：<b class="ok">${esc(answerText(q,q.answers))}</b> · 错 ${wrong[id].wrongCount} 次</div></div>`;}).join(''):'<div class="empty-tip"><div class="e-emoji">🎯</div>还没有错题，去刷几题吧！</div>';
}
function removeWrong(id){delete wrong[id];save(storageKey('wrong'),wrong);renderWrong();}
function clearWrong(){if(!confirm('确定清空本课程错题本吗？'))return;wrong={};save(storageKey('wrong'),wrong);renderWrong();}
function startWrongQuiz(){const list=Object.keys(wrong).map(id=>byId.get(id)).filter(Boolean);if(list.length)startQuiz(list,settings.mode);}
function renderStats(){
  const done=Object.keys(progress),correct=done.filter(id=>progress[id].right).length,rate=done.length?Math.round(correct/done.length*100):0;
  $('statsGrid').innerHTML=[[done.length,'已作答题目'],[correct,'最近作答正确题数'],[rate+'%','最近作答正确率'],[Object.keys(marks).length,'标记题目']].map(([n,title])=>`<div class="stat-card"><div class="sc-num">${n}</div><div class="sc-label">${title}</div></div>`).join('');
  $('statsDetail').innerHTML='<div class="sd-title">本课程各章节掌握情况</div>'+BANK.chapters.map(c=>{
    const qs=ALL_QUESTIONS.filter(q=>q.chapterId===c.id),d=qs.filter(q=>progress[q.id]).length,r=qs.filter(q=>progress[q.id]?.right).length;
    return `<div class="sd-row"><div class="sd-row-head"><span>${esc(c.title)}　${d}/${qs.length} 已做</span><span class="rate">正确率 ${d?Math.round(r/d*100):0}%</span></div><div class="sd-bar"><div class="sd-bar-fill" style="width:${qs.length?d/qs.length*100:0}%"></div></div></div>`;
  }).join('');
}
function exportData(){
  const data={format:'quiz-progress-v2',courseId,courseVersion:BANK.course.version,progress,wrong,marks,settings,exportAt:new Date().toISOString()};
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.href=url;a.download=courseId+'-学习数据.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function resetProgress(){if(!confirm('确定重置本课程的答题记录、错题和标记吗？其他课程不受影响。'))return;progress={};wrong={};marks={};persistLearning();renderStats();updateWrongBadge();}
function renderSearchFilters(){
  $('searchFilter').innerHTML=[{id:'all',title:'全部章节'},...BANK.chapters].map(c=>`<button type="button" class="filter-chip ${searchFilter===c.id?'active':''}" data-action="search-filter" data-id="${c.id}">${esc(c.title)}</button>`).join('');
}
function setSearchFilter(id){searchFilter=id;renderSearchFilters();doSearch();}
function clearSearch(){$('searchInput').value='';doSearch();$('searchInput').focus();}
function doSearch(){
  const kw=$('searchInput').value.trim().toLowerCase();$('searchClear').style.display=kw?'block':'none';
  if(!kw){searchResults=[];$('searchResultHead').style.display='none';$('searchResults').innerHTML='<div class="empty-tip">输入关键词，搜索本课程题干、选项和共用题干。</div>';return;}
  searchResults=ALL_QUESTIONS.filter(q=>(searchFilter==='all'||q.chapterId===searchFilter)&&(q.stem+' '+q.options.map(o=>o.text).join(' ')+' '+(q.sharedStem||'')+' '+q.num).toLowerCase().includes(kw));
  $('searchResultHead').style.display='block';$('searchResultHead').textContent='找到 '+searchResults.length+' 道相关题目';
  $('searchResults').innerHTML=searchResults.slice(0,200).map((q,i)=>`<button type="button" class="search-item" data-action="search-quiz" data-id="${i}"><span class="sr-head"><span class="q-type">${E.TYPES[q.type]}</span><span class="q-chapter">${esc(chapterNames.get(q.chapterId))}</span><span class="q-num">题号 ${q.num}</span></span>${q.sharedStem?'<span class="sr-shared">'+esc(q.sharedStem.slice(0,80))+'</span>':''}<span class="sr-stem">${esc(q.stem)}</span><span class="sr-answer">正确答案：${esc(answerText(q,q.answers))}</span><span class="sr-go">点击此题开始刷 →</span></button>`).join('')+(searchResults.length>200?'<div class="sr-more">仅显示前200条，请增加关键词缩小范围。</div>':'');
}
function quizFromSearch(i){if(searchResults[i])startQuiz(searchResults.slice(i).concat(searchResults.slice(0,i)),settings.mode,true);}
function go(view){
  if(!BANK)return;
  currentView=view;document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+view));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));
  if(view==='home')initHome();if(view==='wrong')renderWrong();if(view==='stats')renderStats();if(view==='quiz')renderQuestion();if(view==='search'){$('searchInput').focus();doSearch();}
  window.scrollTo(0,0);
}
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]');if(!el||el.disabled)return;
  const id=el.dataset.id;
  switch(el.dataset.action){
    case 'nav':go(id);break;case 'chapters-all':toggleAllChapters(true);break;case 'chapters-clear':toggleAllChapters(false);break;
    case 'mode':selectMode(id);break;case 'start':startQuiz();break;case 'search-clear':clearSearch();break;
    case 'quit':quitQuiz();break;case 'prev':prevQuestion();break;case 'mark':toggleMark();break;
    case 'submit':submitMultiple();break;case 'reveal':revealAnswer();break;case 'next':nextQuestion();break;
    case 'wrong-quiz':startWrongQuiz();break;case 'wrong-clear':clearWrong();break;case 'export':exportData();break;
    case 'reset':resetProgress();break;case 'result-close':closeResult();break;case 'restart':restartSame();break;
    case 'chapter':toggleChapter(id);break;case 'type':toggleType(id);break;case 'pick':pick(id);break;case 'remove-wrong':removeWrong(id);break;case 'search-filter':setSearchFilter(id);break;case 'search-quiz':quizFromSearch(Number(id));break;}
});
document.addEventListener('keydown',e=>{
  if(currentView!=='quiz'||!session||$('resultOverlay').classList.contains('show')||e.ctrlKey||e.altKey||e.metaKey||e.repeat)return;
  if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable)return;
  const q=getCurrent(),key=e.key.toUpperCase();
  if(/^[A-J]$/.test(key)){e.preventDefault();const opt=q.displayOptions.find(o=>o.label===key);if(opt)pick(opt.id);}
  else if(e.key==='ArrowRight'){e.preventDefault();nextQuestion();}else if(e.key==='ArrowLeft'){e.preventDefault();prevQuestion();}
  else if((e.key==='Enter'||e.code==='Space')&&e.target.tagName==='BUTTON')return; // native button activation
  else if(e.key==='Enter'&&q.type==='X'){e.preventDefault();submitMultiple();}
  else if(e.code==='Space'&&q.type!=='X'){e.preventDefault();if(!session.answered[q.id])revealAnswer();else nextQuestion();}
});
function boot(){
  const failures=[];
  for(const id of window.QUIZ_COURSE_CATALOG||[]){
    if(availableCourses.includes(id)){failures.push('课程目录ID重复：'+id);continue;}
    const errors=E.validateBank(window.QUIZ_BANKS?.[id],id);
    if(errors.length)failures.push(id+'：'+errors.slice(0,3).join('；'));else availableCourses.push(id);
  }
  $('courseSelect').innerHTML=availableCourses.map(id=>`<option value="${id}">${esc(window.QUIZ_BANKS[id].course.title)}</option>`).join('');
  if(!availableCourses.length){notice('没有可用的题库。'+failures.join('；'));document.querySelectorAll('button,select').forEach(el=>el.disabled=true);return;}
  const last=load('quiz:v2:last-course',availableCourses[0]);activateCourse(availableCourses.includes(last)?last:availableCourses[0]);
  if(failures.length)notice('以下课程未加载，请修正题库格式：'+failures.join('；'));
}
$('courseSelect').addEventListener('change',event=>changeCourse(event.target.value));
$('searchInput').addEventListener('input',doSearch);
document.querySelectorAll('.switch-item input').forEach(input=>input.addEventListener('change',readAdvanced));
boot();
