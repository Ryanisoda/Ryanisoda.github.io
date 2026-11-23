/* Pure question-bank validation and scoring; shared by browser, validator and tests. */
(function (root) {
  'use strict';
  const TYPES = Object.freeze({A1:'A1型题', A2:'A2型题', A3:'A3型题', A4:'A4型题', B:'B型题', X:'X型题（多选）'});
  const safeId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
  const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const text = v => typeof v === 'string' && v.trim().length > 0;
  function validateBank(bank, expectedId) {
    const errors = [];
    const fail = (path, msg) => errors.push(path + ': ' + msg);
    const id = (v,p) => { if (typeof v !== 'string' || !safeId.test(v)) fail(p,'ID须为1–80位英文字母、数字、下划线或连字符，并以字母或数字开头'); };
    const fields = (obj, allowed, path) => { Object.keys(obj).filter(k=>!allowed.includes(k)).forEach(k=>fail(path+'.'+k,'未知字段，请检查拼写')); };
    if (!isRecord(bank)) return ['题库必须是对象'];
    fields(bank,['schemaVersion','course','chapters','questions'],'bank');
    if (bank.schemaVersion !== '1.0') fail('schemaVersion','必须为字符串 "1.0"');
    if (!isRecord(bank.course)) fail('course','必须是课程对象');
    else {
      fields(bank.course,['id','title','description','version'],'course'); id(bank.course.id,'course.id');
      if (expectedId && bank.course.id !== expectedId) fail('course.id','与课程目录中的ID不一致');
      if (!text(bank.course.title)) fail('course.title','课程名称不能为空');
      if (bank.course.description !== undefined && typeof bank.course.description !== 'string') fail('course.description','必须是字符串');
      if (!text(bank.course.version)) fail('course.version','版本不能为空');
    }
    const chapters = new Set(), questionIds = new Set(), groups = new Map();
    if (!Array.isArray(bank.chapters) || !bank.chapters.length) fail('chapters','至少需要一个章节');
    else bank.chapters.forEach((c,i)=>{
      const p='chapters['+i+']'; if (!isRecord(c)) return fail(p,'必须是对象');
      fields(c,['id','title'],p); id(c.id,p+'.id');
      if(chapters.has(c.id)) fail(p+'.id','章节ID重复'); chapters.add(c.id);
      if(!text(c.title)) fail(p+'.title','章节名称不能为空');
    });
    if (!Array.isArray(bank.questions) || !bank.questions.length) fail('questions','至少需要一道题');
    else bank.questions.forEach((q,i)=>{
      const p='questions['+i+']'; if (!isRecord(q)) return fail(p,'必须是对象');
      fields(q,['id','chapterId','type','num','stem','options','answers','groupId','sharedStem','explanation','source'],p);
      id(q.id,p+'.id'); if(questionIds.has(q.id)) fail(p+'.id','题目ID重复'); questionIds.add(q.id);
      if(!chapters.has(q.chapterId)) fail(p+'.chapterId','找不到所属章节');
      if(!Object.prototype.hasOwnProperty.call(TYPES,q.type)) fail(p+'.type','仅支持A1/A2/A3/A4/B/X');
      if(!Number.isInteger(q.num)||q.num<1) fail(p+'.num','须为正整数原题号');
      if(!text(q.stem)) fail(p+'.stem','题干不能为空');
      const optIds = new Set();
      if(!Array.isArray(q.options)||q.options.length<2||q.options.length>10) fail(p+'.options','须含2–10个选项');
      else q.options.forEach((o,j)=>{
        const op=p+'.options['+j+']'; if(!isRecord(o)) return fail(op,'必须是对象');
        fields(o,['id','text'],op);
        if(typeof o.id!=='string'||!/^[A-J]$/.test(o.id)) fail(op+'.id','须为大写A–J');
        if(optIds.has(o.id)) fail(op+'.id','选项ID重复');optIds.add(o.id);
        if(!text(o.text)) fail(op+'.text','选项内容不能为空');
      });
      if(!Array.isArray(q.answers)||!q.answers.length) fail(p+'.answers','须为非空答案ID数组');
      else {
        if(new Set(q.answers).size!==q.answers.length) fail(p+'.answers','不能含重复答案');
        q.answers.forEach(a=>{if(!optIds.has(a)) fail(p+'.answers','答案 '+String(a)+' 不在选项中');});
        if(q.type==='X' && q.answers.length<2) fail(p+'.answers','X型题至少有两个正确选项');
        if(q.type!=='X' && q.answers.length!==1) fail(p+'.answers','单选题必须恰有一个正确选项');
      }
      for (const k of ['sharedStem','explanation','source']) if(q[k]!==undefined && typeof q[k]!=='string') fail(p+'.'+k,'必须是字符串');
      if(q.groupId!==undefined){
        id(q.groupId,p+'.groupId');
        const groupKey=q.chapterId+'|'+q.groupId;
        if(groups.has(groupKey)){
          const prev=groups.get(groupKey);
          if(prev.type!==q.type) fail(p+'.groupId','同组题型必须一致');
          if((prev.sharedStem||'')!==(q.sharedStem||'')) fail(p+'.sharedStem','同组的共用题干必须一致');
          if(q.type==='B' && JSON.stringify(prev.options)!==JSON.stringify(q.options)) fail(p+'.options','B型同组选项须完全一致（含ID与顺序）');
        } else groups.set(groupKey,q);
      }
    });
    return errors;
  }
  function sameAnswers(picked, answers) {
    return picked.length === answers.length && new Set(picked).size === picked.length && answers.every(a=>picked.includes(a));
  }
  function shuffle(items, random=Math.random) {
    const out=items.slice(); for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;
  }
  function prepareQuestions(questions, shuffleOptions, random=Math.random){
    const groups=new Map();
    return questions.map(q=>{
      let options=q.options.slice();
      if(shuffleOptions){
        if(q.type==='B'&&q.groupId){
          const key=q.chapterId+'|'+q.groupId;
          if(!groups.has(key)) groups.set(key,shuffle(options,random));options=groups.get(key).slice();
        } else options=shuffle(options,random);
      }
      return {...q, displayOptions: options.map((o,i)=>({...o,label:String.fromCharCode(65+i)}))};
    });
  }
  function countTypes(questions, chapters){
    const result=Object.fromEntries(Object.keys(TYPES).map(t=>[t,0]));
    questions.forEach(q=>{if(chapters.includes(q.chapterId))result[q.type]++;});return result;
  }
  const api={TYPES,validateBank,sameAnswers,shuffle,prepareQuestions,countTypes};
  root.QuizEngine=api;
  if(typeof module==='object'&&module.exports) module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
