'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../assets/engine.js'),{loadSite}=require('../tools/validate-banks.cjs');
const {banks}=loadSite();
const copy=v=>JSON.parse(JSON.stringify(v));
test('所有已注册题库通过统一校验，现有课程与示例题数量正确',()=>{
 assert.equal(banks['preventive-medicine'].questions.length,867);
 assert.equal(banks['format-demo'].questions.filter(q=>q.type==='X').length,2);
 for(const [id,b] of Object.entries(banks))assert.deepEqual(E.validateBank(b,id),[]);
});
test('多选完整匹配：顺序无关，漏选、多选、错选、重复选项均不通过',()=>{
 assert.equal(E.sameAnswers(['D','B'],['B','D']),true);
 for(const picks of [[],['B'],['B','D','A'],['B','C'],['B','B']])assert.equal(E.sameAnswers(picks,['B','D']),false);
});
test('随机重排始终保留源选项ID、内容及多选答案，B组共享显示顺序',()=>{
 const input=banks['format-demo'].questions;
 for(let i=0;i<100;i++){
  const qs=E.prepareQuestions(input,true);
  const b=qs.filter(q=>q.type==='B');assert.deepEqual(b[0].displayOptions,b[1].displayOptions);
  for(const q of qs){
   const expected=q.options.filter(o=>q.answers.includes(o.id)).map(o=>o.text).sort();
   const actual=q.displayOptions.filter(o=>q.answers.includes(o.id)).map(o=>o.text).sort();assert.deepEqual(actual,expected);
   assert.deepEqual(q.displayOptions.map(o=>o.label),q.options.map((_,i)=>String.fromCharCode(65+i)));
  }
 }
});
test('题型数量按所选章节聚合，清空章节时全部为0',()=>{
 const qs=banks['format-demo'].questions;
 assert.deepEqual(E.countTypes(qs,['single']),{A1:1,A2:1,A3:1,A4:1,B:2,X:0});
 assert.deepEqual(E.countTypes(qs,['multiple']),{A1:0,A2:0,A3:0,A4:0,B:0,X:2});
 assert.deepEqual(E.countTypes(qs,[]),{A1:0,A2:0,A3:0,A4:0,B:0,X:0});
});
test('拒绝错误答案结构、未知字段、重复ID及失效章节引用',()=>{
 for(const edit of [b=>b.questions[0].answers='B',b=>b.questions[0].answer=['B'],b=>b.questions[0].answers=['J'],b=>b.questions[1].id=b.questions[0].id,b=>b.questions[0].chapterId='unknown',b=>b.questions.find(q=>q.type==='X').answers=['B'],b=>b.questions[0].options[1].id='A']){
  const b=copy(banks['format-demo']);edit(b);assert(E.validateBank(b).length>0);
 }
});
test('拒绝不同课程ID和同B组不一致的备选答案',()=>{
 const b=copy(banks['format-demo']);assert(E.validateBank(b,'other').length>0);
 b.questions.find(q=>q.id==='demo-6').options[0].text='被改变';assert(E.validateBank(b).length>0);
});
