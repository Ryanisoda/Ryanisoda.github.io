#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../assets/engine.js');
const root=path.resolve(__dirname,'..');
function loadSite(){
  const ctx=vm.createContext({window:{}});
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const scripts=[...html.matchAll(/<script\s+src="\.\/([^\"]+)"/g)].map(m=>m[1]).filter(p=>p.startsWith('data/'));
  for(const file of scripts){
    const abs=path.resolve(root,file);
    if(!abs.startsWith(root+path.sep))throw new Error('脚本路径越界');
    vm.runInContext(fs.readFileSync(abs,'utf8'),ctx,{filename:file,timeout:2000});
  }
  const catalog=ctx.window.QUIZ_COURSE_CATALOG,banks=ctx.window.QUIZ_BANKS;
  if(!Array.isArray(catalog)||!catalog.length)throw new Error('课程目录必须为非空数组');
  if(new Set(catalog).size!==catalog.length)throw new Error('课程目录ID重复');
  const errors=[];
  for(const id of catalog){
    const findings=E.validateBank(banks?.[id],id);findings.forEach(s=>errors.push(id+': '+s));
  }
  if(errors.length)throw new Error(errors.join('\n'));
  return {catalog,banks};
}
if(require.main===module){
  try{
    const files=process.argv.slice(2);
    if(files.length){
      for(const file of files){const bank=JSON.parse(fs.readFileSync(file,'utf8'));const errors=E.validateBank(bank);if(errors.length)throw new Error(file+'\n'+errors.join('\n'));console.log('通过:',file,bank.questions.length,'题');}
    }else{
      const {catalog,banks}=loadSite();for(const id of catalog){const b=banks[id];console.log('通过:',id,b.questions.length,'题；X型',b.questions.filter(q=>q.type==='X').length,'题');}
    }
  }catch(e){console.error('校验失败:\n'+e.message);process.exitCode=1;}
}
module.exports={loadSite};
