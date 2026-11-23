import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const {Window}=await import(process.env.QUIZ_TEST_DOM_MODULE||'happy-dom');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function setup(seed={}){
 const w=new Window({url:'https://ryanisoda.github.io/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 w.document.write(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,''));
 w.confirm=()=>true;w.alert=()=>{};
 for(const [key,value]of Object.entries(seed))w.localStorage.setItem(key,JSON.stringify(value));
 const ctx=vm.createContext(w);
 const scripts=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script\s+src="\.\/([^\"]+)"/g)].map(m=>m[1]);
 for(const file of scripts)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
 const run=s=>vm.runInContext(s,ctx), $=s=>w.document.querySelector(s);
 return {w,run,$,close:()=>w.happyDOM.abort()};
}
test('章节按钮实时刷新各题型计数，清空章节禁用开始按钮',async()=>{
 const t=setup();try{
  assert.equal(t.$('#filteredCount').textContent,'867');t.run('changeCourse("format-demo")');
  assert.equal(t.$('[data-count="X"]').textContent,'2');
  t.$('[data-action="chapter"][data-id="multiple"]').click();
  assert.equal(t.$('[data-count="X"]').textContent,'0');assert.equal(t.$('[data-count="A1"]').textContent,'1');
  t.run('toggleAllChapters(false)');
  for(const el of t.w.document.querySelectorAll('[data-count]'))assert.equal(el.textContent,'0');
  assert.equal(t.$('.start-btn').disabled,true);
  t.run('go("stats");go("home")');assert.equal(t.$('#filteredCount').textContent,'0');
 }finally{await t.close();}
});
test('普通单选停留；快刷答对立刻下一题，答错停留且计分只记一次',async()=>{
 const t=setup();try{
  t.run('changeCourse("format-demo");settings.shuffleQ=false;settings.shuffleOpt=false;startQuiz(ALL_QUESTIONS.slice(0,3),"normal",true)');
  t.$('[data-action="pick"][data-id="B"]').click();
  assert.equal(t.run('session.idx'),0);assert.equal(t.$('#miniCorrect').textContent,'1');
  t.run('startQuiz(ALL_QUESTIONS.slice(0,3),"fast",true)');t.$('[data-action="pick"][data-id="B"]').click();assert.equal(t.run('session.idx'),1);
  t.$('[data-action="pick"][data-id="A"]').click();assert.equal(t.run('session.idx'),1);assert.equal(t.$('#miniWrong').textContent,'1');
  t.run('pick("A")');assert.equal(t.run('session.stats.wrong'),1);
  assert.match(t.$('#feedback').textContent,/回答错误/);
  t.run('nextQuestion()');assert.equal(t.run('session.idx'),2);
 }finally{await t.close();}
});
test('X型在两种模式都先选后提交；可取消、保留草稿；漏选多选都判错',async()=>{
 const t=setup();try{
  t.run('changeCourse("format-demo");settings.shuffleQ=false;settings.shuffleOpt=false;startQuiz(ALL_QUESTIONS.filter(q=>q.type==="X"),"normal",true)');
  assert.equal(t.$('#submitBtn').hidden,false);assert.equal(t.$('#submitBtn').disabled,true);assert.equal(t.$('#revealBtn').hidden,true);
  assert.equal(t.$('#nextBtn').disabled,true);
  for(const id of ['B','D','E'])t.$('[data-action="pick"][data-id="'+id+'"]').click();
  assert.equal(t.run('session.stats.right+session.stats.wrong'),0);t.run('toggleMark()');assert.equal(t.$('[data-id="B"][data-action="pick"]').getAttribute('aria-pressed'),'true');
  t.run('submitMultiple()');assert.equal(t.run('session.stats.right'),1);assert.equal(t.run('session.idx'),0);
  t.run('startQuiz(ALL_QUESTIONS.filter(q=>q.type==="X"),"fast",true);pick("B");pick("D");submitMultiple()');
  assert.equal(t.run('session.idx'),0);assert.equal(t.run('session.stats.wrong'),1);assert.match(t.$('#feedback').textContent,/回答错误/);
  t.run('startQuiz(ALL_QUESTIONS.filter(q=>q.type==="X"),"fast",true);pick("B");pick("D");pick("E");pick("A");submitMultiple()');
  assert.equal(t.run('session.stats.wrong'),1);assert.equal(t.run('session.idx'),0);
  t.run('startQuiz(ALL_QUESTIONS.filter(q=>q.type==="X"),"fast",true);pick("A");pick("A");pick("E");pick("D");pick("B");submitMultiple()');
  assert.equal(t.run('session.idx'),1);assert.equal(t.run('session.stats.right'),1);
  t.run('pick("A");pick("B");prevQuestion();nextQuestion()');assert.equal(t.$('[data-id="A"][data-action="pick"]').getAttribute('aria-pressed'),'true');
  t.run('pick("C");submitMultiple()');assert.equal(t.run('session'),null);assert.equal(t.$('#rsCorrect').textContent,'2');
 }finally{await t.close();}
});
test('乱序后的显示字母与多选判分保持一致，错题本完整显示多个答案',async()=>{
 const t=setup();try{
  t.run('changeCourse("format-demo");settings.shuffleQ=false;settings.shuffleOpt=true;startQuiz(ALL_QUESTIONS.filter(q=>q.type==="X"),"normal",true)');
  const ids=t.run('session.list[0].displayOptions.filter(o=>["2","4","6"].includes(o.text)).map(o=>o.id).join(",")').split(',');
  for(const id of ids)t.$('[data-action="pick"][data-id="'+id+'"]').click();t.run('submitMultiple()');assert.equal(t.run('session.stats.right'),1);
  t.run('nextQuestion();pick("E");submitMultiple();go("wrong")');assert.match(t.$('#wrongList').textContent,/A\. 1；B\. 2；C\. 3/);
 }finally{await t.close();}
});
test('课程切换隔离记录和筛选，取消切换保留本轮；旧版记录仅迁移至预防医学',async()=>{
 const seed={quiz_progress_v1:{q1:{right:true,ts:1}},quiz_wrong_v1:{q2:{wrongCount:2,ts:1}},quiz_mark_v1:{q3:true},quiz_setting_v1:{shuffleQ:false,shuffleOpt:false,hideNum:false,chapters:[0],types:['A1'],mode:'normal'}};
 const t=setup(seed);try{
  assert.equal(t.run('progress.q1.right'),true);assert.equal(t.$('#wrongBadge').textContent,'1');assert.equal(t.$('#filteredCount').textContent,'100');
  t.run('changeCourse("format-demo")');assert.equal(t.$('#filteredCount').textContent,'8');assert.equal(t.$('#wrongBadge').textContent,'0');
  t.run('startQuiz([ALL_QUESTIONS[0]],"normal",true);pick("A")');assert.equal(t.$('#wrongBadge').textContent,'1');
  t.w.confirm=()=>false;t.run('changeCourse("preventive-medicine")');assert.equal(t.run('courseId'),'format-demo');assert(t.run('session!==null'));
  t.w.confirm=()=>true;t.run('changeCourse("preventive-medicine")');assert.equal(t.run('progress.q1.right'),true);assert.equal(t.$('#wrongBadge').textContent,'1');
  t.run('changeCourse("format-demo")');assert.equal(t.run('wrong["demo-1"].wrongCount'),1);
  t.run('go("stats");resetProgress();changeCourse("preventive-medicine")');assert.equal(t.run('progress.q1.right'),true);
  assert.equal(JSON.parse(t.w.localStorage.getItem('quiz_progress_v1')).q1.right,true);
 }finally{await t.close();}
});
test('多选不经提交不会因回车以外快捷键或下一题记录结果；搜索按当前课程',async()=>{
 const t=setup();try{
  t.run('changeCourse("format-demo");settings.shuffleOpt=false;startQuiz(ALL_QUESTIONS.filter(q=>q.type==="X"),"normal",true)');
  t.run('pick("B");nextQuestion();revealAnswer()');assert.equal(t.run('session.idx'),0);assert.equal(t.run('Object.keys(progress).length'),0);
  t.w.document.body.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));assert.equal(t.run('session.stats.wrong'),0);
  t.run('go("search");document.getElementById("searchInput").value="偶数";doSearch()');assert.equal(t.run('searchResults.length'),2);
  t.run('changeCourse("preventive-medicine");go("search");document.getElementById("searchInput").value="格式示例";doSearch()');assert.equal(t.run('searchResults.length'),0);
 }finally{await t.close();}
});
test('页面上的课程下拉、模式按钮、开始与多选提交按钮能串联工作',async()=>{
 const t=setup();try{
  t.$('#courseSelect').value='format-demo';t.$('#courseSelect').dispatchEvent(new t.w.Event('change',{bubbles:true}));
  assert.equal(t.run('courseId'),'format-demo');
  t.$('[data-mode="fast"]').click();assert.equal(t.run('settings.mode'),'fast');
  t.run('toggleAllChapters(false);toggleChapter("multiple")');
  t.$('#setShuffleQ').checked=false;t.$('#setShuffleQ').dispatchEvent(new t.w.Event('change',{bubbles:true}));
  t.$('#setShuffleOpt').checked=false;t.$('#setShuffleOpt').dispatchEvent(new t.w.Event('change',{bubbles:true}));
  t.$('.start-btn').click();assert.equal(t.run('session.mode'),'fast');
  for(const id of ['B','D','E'])t.$('[data-action="pick"][data-id="'+id+'"]').click();
  t.$('#submitBtn').click();assert.equal(t.run('session.idx'),1);
 }finally{await t.close();}
});
