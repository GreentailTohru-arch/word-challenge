const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
class Element {constructor(tag='div',opts={}){this.tag=tag;this.text=opts.text;this.cls=opts.cls||'';this.events={};this.children=[];this.value='';}createEl(tag,opts){const e=new Element(tag,opts);this.children.push(e);return e;}addEventListener(name,fn){this.events[name]=fn;}setAttribute(){}addClass(){}empty(){this.children=[];} }
test('完整流程：加载真实词库、翻卡、评分、存档恢复、遗忘补练、今日上限',async()=>{
 let saved={folder:'Word Challenge/词库'};let viewFactory;const notices=[];
 class Plugin {async loadData(){return saved;}async saveData(d){saved=JSON.parse(JSON.stringify(d));}registerView(t,f){viewFactory=f;}addRibbonIcon(){}addCommand(){}addSettingTab(){}registerEvent(){} }
 class ItemView {constructor(){this.containerEl=new Element();this.containerEl.children=[new Element(),new Element()];}registerDomEvent(){} }
 let lastMenu;
 class Menu {constructor(){this.items=[];lastMenu=this;}addItem(fn){const item={setTitle(t){this.title=t;return this;},setChecked(v){this.checked=v;return this;},setDisabled(v){this.disabled=v;return this;},onClick(fn){this.action=fn;return this;}};fn(item);this.items.push(item);return this;}showAtMouseEvent(){}}
 class Settings{};
 const mock={Menu,Plugin,ItemView,PluginSettingTab:Settings,Setting:class{},Notice:class{constructor(t){notices.push(t);}}};const context={module:{exports:{}},require:n=>{assert.equal(n,'obsidian');return mock;},console};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../main.js'),'utf8'),context);
 const fixture='| Word | Meaning |\n| --- | --- |\n'+Array.from({length:60},(_,i)=>'| word'+i+' | meaning '+i+' |').join('\n');
 const files=[{path:'Word Challenge/词库/Unit.md',extension:'md'}];
 const app={vault:{getMarkdownFiles:()=>files,cachedRead:async()=>fixture,on:()=>{}},workspace:{onLayoutReady:()=>{},getLeavesOfType:()=>[],openLinkText:()=>{}}};const p=new context.module.exports();p.app=app;await p.onload();const v=viewFactory({});v.app=app;await v.onOpen();assert.equal(p.words.length,60);assert.ok(v.page.children.length>5);
 await v.start('new');assert.equal(saved.session.ids.length,20);assert.equal(v.revealed,false);v.revealed=true;v.render();await v.grade(0);assert.equal(saved.session.ids.length,21);assert.equal(Object.keys(saved.states).length,1);assert.equal(saved.session.index,1);const key=Object.keys(saved.log)[0];assert.equal(saved.log[key].length,1);assert.equal(saved.newLog[key].length,1);
 const p2=new context.module.exports();p2.app=app;await p2.onload();await p2.loadWords();assert.equal(p2.data.session.index,1);assert.equal(Object.keys(p2.data.states).length,1);
 while(p.data.session){v.revealed=true;await v.grade(2);}assert.equal(Object.keys(saved.states).length,20);assert.equal(saved.log[key].length,20);assert.equal(saved.newLog[key].length,20);
 // Completing the daily target permits another unseen batch without resetting the target or progress.
 await v.start('new');assert.equal(p.data.session.ids.length,20);assert.ok(p.data.session.ids.every(id=>!p.data.states[id]));assert.equal(p.data.daily,20);assert.equal(saved.newLog[key].length,20);v.revealed=true;await v.grade(2);assert.equal(saved.newLog[key].length,21);await v.finish();
 // Make one record due and prove review selection and persistence without adding a new word.
 const id=p.words[0].id;p.data.states[id].due=0;await v.start('review');assert.equal(p.data.session.ids.length,1);v.revealed=true;await v.grade(1);assert.equal(p.data.session,null);assert.equal(saved.newLog[key].length,21);assert.equal(saved.states[id].interval,1);

 // Manual status edits change the due date without inflating learning statistics or reviews.
 const manual=p.words[0];const beforeReviews=p.data.states[manual.id].reviews;const beforeLog=JSON.stringify(p.data.log),beforeNewLog=JSON.stringify(p.data.newLog);
 for(const grade of [0,1,2]){const now=Date.now();assert.equal(await v.setWordStatus(manual,grade),true);const state=saved.states[manual.id];assert.equal(state.grade,grade);assert.equal(state.interval,grade===0?0:1);assert.ok(Math.abs(state.due-now-(grade===0?600000:86400000))<1000);assert.equal(state.reviews,beforeReviews);}
 assert.equal(JSON.stringify(p.data.log),beforeLog);assert.equal(JSON.stringify(p.data.newLog),beforeNewLog);
 const unseen=p.words.find(w=>!p.data.states[w.id]);await v.setWordStatus(unseen,0);assert.equal(saved.states[unseen.id].reviews,0);assert.equal(JSON.stringify(p.data.newLog),beforeNewLog);
 v.screen='list';v.render();assert.ok(v.page.children.length>3);
 const flatten=e=>[e,...e.children.flatMap(flatten)];
 const choose=label=>{const chip=flatten(v.page).find(e=>e.cls.includes('qcz-filter-chip')&&e.text.startsWith(label+' '));assert.ok(chip);chip.events.click();};
 choose('忘记');let rows=flatten(v.page).filter(e=>e.cls==='qcz-list-row');assert.equal(rows.length,1);assert.equal(flatten(rows[0]).find(e=>e.cls.includes('qcz-status-tag')).text,'忘记');
 // Changing a filtered row updates persistence and immediately removes it from that filter.
 const tag=flatten(rows[0]).find(e=>e.cls.includes('qcz-status-tag'));assert.equal(tag.tag,'button');tag.events.click({});assert.equal(lastMenu.items.length,3);assert.equal(lastMenu.items[0].checked,true);assert.equal(flatten(rows[0]).some(e=>e.cls==='qcz-status-select'),false);await lastMenu.items[1].action();assert.equal(saved.states[unseen.id].grade,1);assert.equal(flatten(v.page).filter(e=>e.cls==='qcz-list-row').length,0);
 choose('模糊');rows=flatten(v.page).filter(e=>e.cls==='qcz-list-row');assert.equal(rows.length,1);assert.equal(flatten(rows[0]).find(e=>e.cls.includes('qcz-status-tag')).text,'模糊');
 choose('认识');assert.ok(flatten(v.page).filter(e=>e.cls==='qcz-list-row').length>0);
 choose('未学习');assert.ok(flatten(v.page).filter(e=>e.cls==='qcz-list-row').every(row=>flatten(row).find(e=>e.cls.includes('qcz-status-tag')).text==='未学习'));

 // The audio feedback schedules distinct notes and remains optional when audio is unavailable.
 const pitches=[],starts=[],stops=[];
 class FakeAudio {constructor(){this.state='running';this.currentTime=1;this.destination={};}createOscillator(){return {frequency:{setValueAtTime:f=>pitches.push(f)},connect(){},disconnect(){},start:t=>starts.push(t),stop:t=>stops.push(t)}}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}}
 for(const grade of [0,1,2])await p.playFeedback(grade,{AudioContext:FakeAudio});assert.deepEqual(pitches,[330,220,440,440,660,880]);assert.equal(starts.length,6);assert.ok(stops.every((t,i)=>t>starts[i]));
 await p.playFeedback(2,undefined);p.audioContext=null;await p.playFeedback(2,{AudioContext:class{constructor(){throw Error('No audio device')}}});

 // Resume is part of the corresponding main action, not a separate button.
 const freshIds=p.words.filter(w=>!p.data.states[w.id]).slice(0,2).map(w=>w.id);
 p.data.session={ids:freshIds,index:0,mode:'new',retry:[],history:[]};v.screen='home';v.render();
 assert.equal(flatten(v.page).some(e=>e.cls==='qcz-resume'),false);
 const resume=flatten(v.page).find(e=>e.tag==='button'&&e.text?.startsWith('继续新学'));assert.ok(resume);await resume.events.click();assert.equal(p.data.session.index,0);assert.equal(v.screen,'study');
 // Menu replaces End Session; mastering works before reveal and can be undone.
 const more=flatten(v.page).find(e=>e.cls.includes('qcz-more'));assert.ok(more);more.events.click({});assert.deepEqual(lastMenu.items.map(i=>i.title),['掌握','上一题']);assert.equal(lastMenu.items[1].disabled,true);assert.equal(flatten(v.page).some(e=>e.text==='结束本轮'),false);
 const countBefore=Object.keys(p.data.states).length;await lastMenu.items[0].action();assert.equal(p.data.session.index,1);assert.equal(p.data.states[freshIds[0]].grade,2);assert.equal(p.data.states[freshIds[0]].interval,30);
 await v.previousQuestion();assert.equal(p.data.session.index,0);assert.equal(Object.keys(p.data.states).length,countBefore);assert.ok(!p.data.newLog[key]?.includes(freshIds[0]));
 // Forgotten retry insertion and daily counts are rolled back before regrading.
 v.revealed=true;await v.grade(0);assert.equal(p.data.session.ids.length,3);await v.previousQuestion();assert.equal(p.data.session.ids.length,2);assert.equal(p.data.session.retry.length,0);v.revealed=true;await v.grade(2);assert.equal(p.data.session.ids.length,2);
 // New and review queues can both pause without losing their places.
 p.data.states[freshIds[0]].due=0;await v.start('review');assert.equal(p.data.session.mode,'review');assert.equal(p.data.pausedSessions.new.index,1);await v.start('new');assert.equal(p.data.session.mode,'new');assert.equal(p.data.session.index,1);assert.equal(p.data.pausedSessions.review.mode,'review');
 // Legacy sessions have no undo snapshot: revisiting must not inflate review counts.
 p.data.session={ids:freshIds,index:1,mode:'new',retry:[]};const reviews=p.data.states[freshIds[0]].reviews;await v.previousQuestion();assert.equal(p.data.session.index,0);v.revealed=true;await v.grade(2);assert.equal(p.data.states[freshIds[0]].reviews,reviews);

});
