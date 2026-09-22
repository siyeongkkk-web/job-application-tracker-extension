import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { AI_FIELDS, canAdoptSuggestion, shouldAutoAdopt } from '../lib/ai-enrichment.js';

const source = fs.readFileSync(new URL('../popup.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness({ provider = 'deepseek', key = 'test', delaySettings = false, fail = false } = {}) {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {value:'',textContent:'',hidden:false,disabled:false,files:[],childNodes:[{}],handlers:{},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      append(){}, focus(){}, scrollIntoView(){}, querySelector(selector){return node(id+selector);}});
    return nodes.get(id);
  }
  let releaseSettings;
  const settingsGate = delaySettings ? new Promise(resolve => {releaseSettings=resolve;}) : Promise.resolve();
  let calls=0, captures=0, finish;
  const result=Object.fromEntries(AI_FIELDS.map(field=>[field,{value:field+' AI',evidence:field+'证据',confidence:'high',basis:'explicit'}]));
  const context=vm.createContext({
    document:{querySelector:selector=>node(selector.replace(/^#/,'')), createElement:tag=>node('created-'+Math.random())},
    AI_FIELDS, canAdoptSuggestion, shouldAutoAdopt, DEFAULT_AI_PROVIDER:'deepseek', STATUSES:[],
    captureCurrentPage(){}, normalizeSnapshot:()=>({url:'https://jobs.test/1',fieldEvidence:{},captureQuality:'visible-text'}),
    requestAiEnrichment:async()=>{calls++; if(fail) throw new Error('测试识别失败'); return new Promise(resolve=>{finish=()=>resolve(result);});},
    chrome:{
      storage:{local:{get:async keys=>{if(keys==='lastResumeVersion')return {};await settingsGate;return {aiProvider:provider,deepseekApiKey:key};},set:async()=>{}}},
      tabs:{query:async()=>[{id:1,windowId:1,url:'https://jobs.test/1'}],captureVisibleTab:async()=>{captures++;return 'data:image/png;base64,test';}},
      scripting:{executeScript:async()=>[{result:{url:'https://jobs.test/1'}}]},runtime:{openOptionsPage(){}}
    },
  });
  vm.runInContext(source,context);
  return {node,get calls(){return calls;},get captures(){return captures;},releaseSettings:()=>releaseSettings?.(),finish:()=>finish?.()};
}

test('opening popup waits for settings, starts once, preserves edits during recognition and permits retry', async()=>{
  const app=harness({delaySettings:true}); await tick(); assert.equal(app.calls,0);
  app.releaseSettings();await tick();assert.equal(app.calls,1);assert.equal(app.captures,1);
  app.node('location').value='规则提取旧地点';
  await app.node('aiEnrich').handlers.click();assert.equal(app.calls,1);
  app.node('role').value='手动岗位';app.node('role').handlers.input();
  app.finish();await tick();assert.equal(app.node('role').value,'手动岗位');assert.equal(app.node('location').value,'location AI');
  assert.equal(app.node('aiEnrich').textContent,'重新识别');
  const retry=app.node('aiEnrich').handlers.click();await tick();assert.equal(app.calls,2);app.finish();await retry;
});

test('disabled AI does not capture or request on opening',async()=>{
  const app=harness({provider:'none'});await tick();assert.equal(app.calls,0);assert.equal(app.captures,0);assert.equal(app.node('aiEnrich').disabled,true);
});

test('missing key prompts settings and saving the first key automatically recognizes',async()=>{
  const app=harness({key:''});await tick();assert.equal(app.calls,0);assert.equal(app.node('aiSettings').open,true);
  app.node('aiApiKey').value='new-key';const saving=app.node('saveAiSettings').handlers.click();await tick();assert.equal(app.calls,1);app.finish();await saving;
});

test('automatic failure keeps the form and allows manual retry without automatic retry loop',async()=>{
  const app=harness({fail:true});await tick();assert.equal(app.calls,1);assert.equal(app.node('applicationForm').hidden,false);
  assert.equal(app.node('aiStatus').textContent,'测试识别失败');assert.equal(app.node('aiEnrich').disabled,false);
});
