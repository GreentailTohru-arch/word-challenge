const {Plugin, ItemView, PluginSettingTab, Setting, Notice, Menu} = require('obsidian');
const {parseWords, schedule, dayKey, streak} = (()=>{const DAY = 86400000;
function dayKey(time = Date.now()) { const d = new Date(time); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function plain(s) { return s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#124;|&vert;/g,'|').replace(/&lt;/g,'<').replace(/&gt;/g,'>'); }
function parseWords(text, path) {
  let section = '', header = null;
  const words = [], seen = new Map();
  const termNames = ['word','term','vocabulary','单词','词语','词条','日文'];
  const meaningNames = ['meaning','definition','translation','释义','意思','翻译'];
  for (const line of text.split(/\r?\n/)) {
    if (/^#{1,6} /.test(line)) { section = line.replace(/^#+ /,'').trim(); header = null; }
    if (!line.trim().startsWith('|')) continue;
    const cols = line.trim().split(/(?<!\\)\|/).slice(1,-1).map(s=>s.trim());
    const names = cols.map(s=>plain(s).trim().toLowerCase());
    const termIndex = names.findIndex(s=>termNames.includes(s));
    const meaningIndex = names.findIndex(s=>meaningNames.includes(s));
    if (termIndex>=0 && meaningIndex>=0) { header = {term:termIndex,meaning:meaningIndex,reading:names.findIndex(s=>['reading','pronunciation','读音','假名','音标'].includes(s)),pos:names.findIndex(s=>['pos','part of speech','词性'].includes(s))};continue; }
    if (cols.every(s=>/^:?-+:?$/.test(s))) continue;
    const link = cols[0]?.match(/href="([^"]+\/details\/([^"/]+))"/);
    if (cols.length === 4 && link) {
      const raw=plain(cols[1]), match=raw.match(/^(.+?)（(.+)）$/);
      // Keep the original IDs so existing Japanese vocabulary progress stays intact.
      words.push({id:`${path}::${section}::${link[2]}`,term:match?match[2]:raw,reading:match?match[1]:raw,pos:plain(cols[2]),meaning:plain(cols[3]),url:link[1],path,section,unit:path.split('/').pop().replace(/\.md$/,'')});
    } else if (header && cols[header.term] && cols[header.meaning]) {
      const term=plain(cols[header.term]).replace(/\\\|/g,'|');
      const reading=header.reading>=0?plain(cols[header.reading]||''):'';
      const key=`${path}::${section}::word:${encodeURIComponent(term)}:${encodeURIComponent(reading)}`;
      const occurrence=(seen.get(key)||0)+1;seen.set(key,occurrence);
      words.push({id:occurrence===1?key:`${key}::${occurrence}`,term,reading,pos:header.pos>=0?plain(cols[header.pos]||''):'',meaning:plain(cols[header.meaning]).replace(/\\\|/g,'|'),url:'',path,section,unit:path.split('/').pop().replace(/\.md$/,'')});
    }
  }
  return words;
}
function schedule(previous, grade, now = Date.now()) {
  const p = previous || {}; const interval = grade === 0 ? 0 : grade === 1 ? 1 : p.interval ? Math.min(180, Math.max(3, Math.round(p.interval * 2.4))) : 1;
  return {...p, interval, due: now + (grade === 0 ? 10*60000 : interval*DAY), reviews:(p.reviews||0)+1, lapses:(p.lapses||0)+(grade===0?1:0), last:now, grade};
}
function streak(log, now = Date.now()) {
  const d = new Date(now); d.setHours(12,0,0,0); if (!log[dayKey(d.getTime())]?.length) d.setDate(d.getDate()-1);
  let n=0; while(log[dayKey(d.getTime())]?.length) { n++; d.setDate(d.getDate()-1); } return n;
}
return {parseWords, schedule, dayKey, streak};
})();
const TYPE='qian-ci-zhan-view';
const DEFAULTS={folder:'Word Challenge/词库', daily:20, unit:'', states:{}, log:{}, newLog:{}, session:null, pausedSessions:{}};
function el(parent, tag, cls, text) { return parent.createEl(tag,{cls,text}); }
function button(parent, text, fn, cls='') { const b=el(parent,'button',cls,text); b.addEventListener('click',fn); return b; }
class VocabularyView extends ItemView {
  getViewType(){return TYPE;} getDisplayText(){return 'Word Challenge';} getIcon(){return 'book-open-check';}
  async onOpen(){this.containerEl.children[1].addClass('qcz-container'); await this.plugin.loadWords(); this.render(); this.registerDomEvent(this.containerEl,'keydown',e=>{ if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.repeat||e.ctrlKey||e.metaKey||e.altKey) return; const s=this.plugin.data.session; if(!s||this.screen!=='study')return; if(e.code==='Space'){e.preventDefault();this.revealed=true;this.render();} else if(this.revealed&&['1','2','3'].includes(e.key)){e.preventDefault();this.grade(Number(e.key)-1);} else if(e.key==='Escape'){this.screen='home';this.render();} });}
  async onClose(){this.containerEl.children[1].empty();}
  subset(){return this.plugin.words.filter(w=>!this.plugin.data.unit||w.unit===this.plugin.data.unit);}
  render(keepScroll=false){const root=this.containerEl.children[1],scroll=keepScroll?root.scrollTop:0;root.empty();const kind=this.screen==='study'&&this.plugin.data.session?' qcz-study-page':this.screen==='preview'?' qcz-preview-page':this.screen==='summary'?' qcz-summary-page':'';const page=el(root,'div','qcz-page'+kind);this.page=page;if(this.screen==='study'&&this.plugin.data.session)this.study();else if(this.screen==='preview')this.preview();else if(this.screen==='summary')this.summary();else if(this.screen==='list')this.list();else this.home();root.scrollTop=scroll;}
  home(){const p=this.plugin,d=p.data,words=this.subset(),now=Date.now(),learned=words.filter(w=>d.states[w.id]),mastered=learned.filter(w=>d.states[w.id].interval>=21&&d.states[w.id].grade===2),due=learned.filter(w=>d.states[w.id].due<=now); const today=d.log[dayKey()]||[]; const remaining=words.length-learned.length;
    el(this.page,'div','qcz-eyebrow','WORD CHALLENGE / 每天进步一点'); el(this.page,'h1','','我的学习计划');
    const card=el(this.page,'section','qcz-plan'); const heading=el(card,'div','qcz-plan-heading'); const cover=el(heading,'div','qcz-cover'); el(cover,'small','','WORD'); el(cover,'strong','','W\nC'); el(cover,'small','','CHALLENGE'); const info=el(heading,'div','qcz-plan-info'); el(info,'span','qcz-eyebrow','MY VOCABULARY'); el(info,'h2','',d.folder.split('/').filter(Boolean).pop()||'我的词库'); el(info,'p','qcz-muted',`${words.length} 条${d.unit?' · 已筛选单元':''}`); el(info,'span','qcz-pill',remaining?`预计还需 ${Math.ceil(remaining/d.daily)} 天 · 每天 ${d.daily} 个新词`:'本单元新词已学完');
    const progress=el(card,'div','qcz-plan-progress');progress.setAttribute('role','progressbar');progress.setAttribute('aria-label','词库学习进度');progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax',String(words.length||1));progress.setAttribute('aria-valuenow',String(learned.length));progress.setAttribute('aria-valuetext',`共 ${words.length} 词，已学 ${learned.length}（包含掌握），掌握 ${mastered.length}`);
    const learnedFill=el(progress,'span','qcz-progress-learned');learnedFill.style.width=`${words.length?learned.length/words.length*100:0}%`;learnedFill.setAttribute('aria-hidden','true');
    const masteredFill=el(progress,'span','qcz-progress-mastered');masteredFill.style.width=`${words.length?mastered.length/words.length*100:0}%`;masteredFill.setAttribute('aria-hidden','true');
    const legend=el(card,'div','qcz-legend');for(const [name,count,kind]of [['掌握',mastered.length,'mastered'],['已学',learned.length,'learned']]){const item=el(legend,'span','qcz-legend-item');const dot=el(item,'i',`qcz-legend-dot qcz-legend-${kind}`);dot.setAttribute('aria-hidden','true');el(item,'span','',`${name} ${count}`);}button(legend,'学习列表 →',()=>{this.screen='list';this.render();},'qcz-link');
    const todayNewCount=(d.newLog[dayKey()]||[]).length;el(card,'p','qcz-daily-status',todayNewCount>=d.daily?`今日新词 ${todayNewCount} / ${d.daily} · 目标已完成，可继续加学`:`今日新词 ${todayNewCount} / ${d.daily}`);const actions=el(card,'div','qcz-actions');const pending=mode=>d.session?.mode===mode?d.session:d.pausedSessions?.[mode];const review=pending('review'),fresh=pending('new');button(actions,review?`继续复习 · ${review.index}/${review.ids.length}`:`复习 ${due.length}`,()=>this.start('review'),'qcz-primary');button(actions,fresh?`继续新学 · ${fresh.index}/${fresh.ids.length}`:todayNewCount>=d.daily?`继续新学 · ${d.daily}`:'新学 →',()=>this.start('new'),'qcz-secondary');
    const filter=el(this.page,'div','qcz-filter');el(filter,'label','','学习范围');const select=el(filter,'select');select.setAttribute('aria-label','学习范围');for(const unit of ['',...new Set(p.words.map(w=>w.unit))]){const option=el(select,'option','',unit||'全部单元');option.value=unit;}select.value=d.unit;select.onchange=async()=>{d.unit=select.value;await p.persist();this.render();};
    const stats=el(this.page,'section','qcz-stats'); el(stats,'p','qcz-muted','今日学习');el(stats,'strong','qcz-today',String(today.length));const grid=el(stats,'div','qcz-stat-grid');for(const [label,value]of[['累计学词',Object.keys(d.states).length],['累计打卡',Object.values(d.log).filter(x=>x.length).length],['连续打卡',streak(d.log)]]){const item=el(grid,'div');el(item,'span','qcz-muted',label);el(item,'strong','',String(value));}
    el(this.page,'p','qcz-footnote','忘记：本轮补练一次；模糊：1 天后；认识：间隔逐步延长。已学不等于掌握；掌握需间隔达到 21 天且最近回答认识。');if(!p.words.length)el(this.page,'p','','没有找到词条，请在插件设置中检查词库文件夹。');
  }
  async start(mode){
    if(this.busy)return;
    const d=this.plugin.data;
    const pending=d.session?.mode===mode?d.session:d.pausedSessions?.[mode];
    let session;
    if(pending)session=JSON.parse(JSON.stringify(pending));
    else{
      const now=Date.now(),todayNew=(d.newLog[dayKey()]||[]).length;
      const pool=this.subset().filter(w=>mode==='new'?!d.states[w.id]:d.states[w.id]&&d.states[w.id].due<=now);
      if(mode==='review')pool.sort((a,b)=>d.states[a.id].due-d.states[b.id].due);
      const limit=mode==='new'?(todayNew<d.daily?d.daily-todayNew:d.daily):50;
      const ids=pool.slice(0,limit).map(w=>w.id);
      if(!ids.length){new Notice(mode==='new'?'所选范围的新词已学完，可切换其他单元。':'暂时没有到期复习词。');return;}
      session={ids,index:0,mode,retry:[],history:[],answers:{}};
    }
    session.answers??=Object.fromEntries([...new Set(session.ids.slice(0,session.index))].filter(id=>d.states[id]).map(id=>[id,d.states[id].grade]));
    this.previewSession=session;this.previewSelecting=false;this.previewSelected=new Set();this.previewFilter='all';this.screen='preview';this.render();
  }
  previewWords(){
    const ids=new Set(this.previewSession?.ids.slice(this.previewSession.index)||[]);
    return [...ids].map(id=>this.plugin.words.find(w=>w.id===id)).filter(Boolean);
  }
  async beginStudy(){
    if(this.busy||!this.previewSession||!this.previewWords().length)return;
    this.busy=true;const p=this.plugin,backup=JSON.stringify(p.data),s=this.previewSession;
    try{
      const d=p.data;
      if(d.session&&d.session.mode!==s.mode){d.pausedSessions??={};d.pausedSessions[d.session.mode]=d.session;}
      d.session=s;if(d.pausedSessions)delete d.pausedSessions[s.mode];s.startedAt??=Date.now();
      await p.persist();this.previewSession=null;this.screen='study';this.revealed=false;this.render();
    }catch(error){p.data=JSON.parse(backup);new Notice('开始学习失败，请重试。');}finally{this.busy=false;}
  }
  preview(){
    const s=this.previewSession;
    if(!s){this.screen='home';this.home();return;}
    const all=this.previewWords();
    const words=all.filter(w=>this.previewFilter==='all'||this.previewFilter==='new'&&!this.plugin.data.states[w.id]||this.previewFilter==='learned'&&this.plugin.data.states[w.id]);
    const top=el(this.page,'div','qcz-preview-top');
    if(this.previewSelecting){
      button(top,'全选',()=>{const full=words.every(w=>this.previewSelected.has(w.id));for(const w of words){if(full)this.previewSelected.delete(w.id);else this.previewSelected.add(w.id);}this.render(true);},'qcz-link');
      el(top,'strong','',`已选择 ${this.previewSelected.size} 项`);
      button(top,'取消',()=>{this.previewSelecting=false;this.previewSelected.clear();this.render(true);},'qcz-link');
    }else{
      button(top,'← 返回',()=>{this.previewSession=null;this.screen='home';this.render();},'qcz-link');
      el(top,'strong','',s.mode==='new'?'新学':'复习');
      button(top,'◎ 已掌握',()=>{this.previewSelecting=true;this.render(true);},'qcz-link qcz-master-select');
    }
    const filter=el(this.page,'select','qcz-preview-filter');filter.setAttribute('aria-label','筛选本轮待学词');
    for(const [value,title]of [['all','全部'],['new','未学习'],['learned','已学习']]){const option=el(filter,'option','',title);option.value=value;}
    filter.value=this.previewFilter;filter.onchange=()=>{this.previewFilter=filter.value;this.render(true);};
    el(this.page,'p','qcz-muted qcz-preview-count',`接下来待学 ${all.length} 个词${s.index?` · 本轮已完成 ${s.index} 题`:''}`);
    const list=el(this.page,'div','qcz-preview-list');
    for(const w of words){
      const row=el(list,this.previewSelecting?'label':'div',`qcz-preview-row${this.previewSelected.has(w.id)?' is-selected':''}`);
      if(this.previewSelecting){const box=el(row,'input','qcz-preview-checkbox');box.type='checkbox';box.checked=this.previewSelected.has(w.id);box.setAttribute('aria-label',`选择「${w.term}」为已掌握`);box.onchange=()=>{if(box.checked)this.previewSelected.add(w.id);else this.previewSelected.delete(w.id);this.render(true);};}
      const body=el(row,'div','qcz-preview-body');const line=el(body,'div','qcz-preview-term');el(line,'strong','',w.term);if(w.reading)el(line,'span','qcz-muted',w.reading);
      el(body,'p','qcz-muted',`${w.pos?`[${w.pos}] `:''}${w.meaning}`);
    }
    if(!words.length)el(list,'p','qcz-muted',all.length?'当前筛选下没有词条。':'本轮待学词已全部标记掌握。');
    const footer=el(this.page,'div','qcz-preview-footer');
    if(this.previewSelecting){const mark=button(footer,`◎ 已掌握（${this.previewSelected.size}）`,()=>this.markPreviewMastered(),'qcz-master-confirm');mark.disabled=this.previewSelected.size===0;el(footer,'small','qcz-muted','标记后从本轮跳过，不计入今日作答量。');}
    else{const begin=button(footer,all.length?`开始${s.mode==='new'?'新学':'复习'} · ${all.length}`:'返回计划',()=>all.length?this.beginStudy():(this.previewSession=null,this.screen='home',this.render()),'qcz-primary');el(footer,'small','qcz-muted','先浏览词表，再开始回忆练习。');}
  }
  async markPreviewMastered(){
    if(this.busy||!this.previewSession||!this.previewSelected.size)return;
    this.busy=true;const p=this.plugin,backup=JSON.stringify(p.data),previewBackup=JSON.stringify(this.previewSession);
    const s=this.previewSession,selected=new Set(this.previewWords().filter(w=>this.previewSelected.has(w.id)).map(w=>w.id));
    try{
      const now=Date.now();
      for(const id of selected){const old=p.data.states[id],interval=Math.max(30,old?.interval||0);p.data.states[id]={...old,grade:2,interval,due:now+interval*86400000,last:now,reviews:old?.reviews||0,lapses:old?.lapses||0};}
      s.ids=s.ids.filter((id,index)=>index<s.index||!selected.has(id));s.skippedMastered=[...new Set([...(s.skippedMastered||[]),...selected])];
      // Keep a resumed queue in sync; browsing a fresh list never creates a study session.
      if(p.data.session?.mode===s.mode){p.data.session=JSON.parse(JSON.stringify(s));if(s.index>=s.ids.length)p.data.session=null;}
      else if(p.data.pausedSessions?.[s.mode]){p.data.pausedSessions[s.mode]=JSON.parse(JSON.stringify(s));if(s.index>=s.ids.length)delete p.data.pausedSessions[s.mode];}
      await p.persist();this.previewSelecting=false;this.previewSelected.clear();this.render();new Notice(`已标记 ${selected.size} 个词为掌握，已从待学清单移除。`);
    }catch(error){p.data=JSON.parse(backup);this.previewSession=JSON.parse(previewBackup);new Notice('掌握状态保存失败，请重试。');}finally{this.busy=false;}
  }
  async completeSession(session){
    const d=this.plugin.data;
    const answers=session.answers||Object.fromEntries([...new Set(session.ids.slice(0,session.index))].filter(id=>d.states[id]).map(id=>[id,d.states[id].grade]));
    const entries=Object.entries(answers).map(([id,grade])=>{const w=this.plugin.words.find(w=>w.id===id);return w?{id,term:w.term,reading:w.reading,pos:w.pos,meaning:w.meaning,grade}:null;}).filter(Boolean);
    d.lastSummary={mode:session.mode,endedAt:Date.now(),startedAt:session.startedAt,entries,skippedMastered:session.skippedMastered?.length||0};d.session=null;
    await this.plugin.persist();this.screen='summary';
  }
  summary(){
    const d=this.plugin.data,s=d.lastSummary;
    if(!s){this.screen='home';this.home();return;}
    button(this.page,'← 返回计划',()=>{this.screen='home';this.render();},'qcz-link');
    const card=el(this.page,'section','qcz-summary-card');
    el(card,'p','qcz-summary-date qcz-muted',new Date(s.endedAt).toLocaleDateString(undefined,{month:'long',day:'numeric'}));
    const title=el(card,'div','qcz-summary-title');el(title,'span','qcz-muted','本次学习');el(title,'strong','',String(s.entries.length));
    const counts=[0,1,2].map(grade=>s.entries.filter(e=>e.grade===grade).length),total=s.entries.length;
    const chart=el(card,'div','qcz-summary-chart');const donut=el(chart,'div','qcz-donut');
    const known=total?counts[2]/total*100:0,unsure=total?counts[1]/total*100:0;
    donut.style.background=total?`conic-gradient(var(--wc-good) 0 ${known}%, var(--wc-warn) ${known}% ${known+unsure}%, var(--wc-bad) ${known+unsure}% 100%)`:'var(--wc-track)';donut.setAttribute('role','img');donut.setAttribute('aria-label',`认识 ${counts[2]}，模糊 ${counts[1]}，忘记 ${counts[0]}`);el(donut,'div','qcz-donut-hole');
    const legend=el(chart,'div','qcz-summary-legend');for(const [grade,name]of [[2,'认识'],[1,'模糊'],[0,'忘记']]){const row=el(legend,'div');el(row,'span',`qcz-summary-swatch qcz-summary-swatch-${grade}`);el(row,'span','qcz-muted',name);el(row,'strong','',String(counts[grade]));}
    const todayNew=(d.newLog[dayKey()]||[]).length;
    el(card,'p','qcz-muted','本日新学目标：');const progress=el(card,'progress','qcz-progress');progress.max=d.daily;progress.value=Math.min(d.daily,todayNew);progress.setAttribute('aria-label',`今日新学 ${todayNew} / ${d.daily}`);el(card,'p','qcz-summary-goal',`${todayNew} / ${d.daily}`);
    if(s.skippedMastered)el(card,'p','qcz-footnote',`本轮另有 ${s.skippedMastered} 个词预先标记掌握，未计入作答量。`);
    el(this.page,'p','qcz-summary-remaining',todayNew<d.daily?`今天待学 ${d.daily-todayNew} 个单词`:'今日目标已完成，可以继续加学');
    button(this.page,'再来一组',()=>this.start(s.mode),'qcz-summary-again');
    el(this.page,'p','qcz-footnote','本轮按每个词最后一次作答统计；重复补练不重复计数。到期后可从计划页进入复习。');
    const list=el(this.page,'div','qcz-summary-words');
    for(const w of s.entries){const row=el(list,'div','qcz-summary-word');const content=el(row,'div');const term=el(content,'div','qcz-preview-term');el(term,'strong','',w.term);if(w.reading)el(term,'span','qcz-muted',w.reading);el(content,'p','qcz-muted',w.meaning);el(row,'span',`qcz-status-tag qcz-status-${w.grade}`,['忘记','模糊','认识'][w.grade]);}
  }
  async previousQuestion(){
    if(this.busy)return;
    const p=this.plugin,d=p.data,s=d.session;
    if(!s||s.index===0)return;
    const backup=JSON.stringify(d);this.busy=true;
    const entry=s.history?.at(-1);
    if(entry&&entry.index===s.index-1){
      s.history.pop();s.answers??={};if(entry.hadAnswer)s.answers[entry.id]=entry.answer;else delete s.answers[entry.id];s.index=entry.index;s.ids=entry.ids;s.retry=entry.retry;if(entry.correction){s.corrections??={};s.corrections[s.index]=true;}
      if(entry.state)d.states[entry.id]=entry.state;else delete d.states[entry.id];
      for(const [name,had]of [['log',entry.hadLog],['newLog',entry.hadNewLog]]){
        if(!had&&d[name][entry.key]){d[name][entry.key]=d[name][entry.key].filter(id=>id!==entry.id);if(!d[name][entry.key].length)delete d[name][entry.key];}
      }
    }else{
      // Older saved sessions have no answer history: revisit without increasing review counts.
      s.index--;s.corrections??={};s.corrections[s.index]=true;
    }
    try{await p.persist();this.revealed=false;this.render();}catch(error){p.data=JSON.parse(backup);new Notice('返回上一题失败，请重试。');}finally{this.busy=false;}
  }
  async skipMissingWord(){
    const s=this.plugin.data.session;if(!s)return;
    s.ids.splice(s.index,1);
    if(s.index>=s.ids.length){await this.completeSession(s);}
    await this.plugin.persist();this.render();
  }
  async grade(value,options={}){
    if(this.busy||(!this.revealed&&!options.mastered)||this.screen!=='study')return;
    const p=this.plugin,d=p.data,s=d.session;
    if(!s)return;
    const w=p.words.find(w=>w.id===s.ids[s.index]);if(!w)return;
    this.busy=true;p.playFeedback(value,this.containerEl.ownerDocument?.defaultView);
    const backup=JSON.stringify(d),key=dayKey(),previous=d.states[w.id],isNew=!previous;
    s.history??=[];s.retry??=[];
    s.history.push({index:s.index,id:w.id,state:previous?{...previous}:null,key,hadLog:!!d.log[key]?.includes(w.id),hadNewLog:!!d.newLog[key]?.includes(w.id),ids:[...s.ids],retry:[...s.retry],correction:!!s.corrections?.[s.index],hadAnswer:Object.prototype.hasOwnProperty.call(s.answers||{},w.id),answer:s.answers?.[w.id]});
    const correction=s.corrections?.[s.index];
    let next=schedule(previous,value);
    if(correction&&previous){
      next=previous.grade===value?{...previous}:{...schedule(null,value),reviews:previous.reviews,lapses:previous.lapses};
      delete s.corrections[s.index];
    }
    if(options.mastered){const interval=Math.max(30,previous?.interval||0);next={...next,grade:2,interval,due:Date.now()+interval*86400000};s.ids=s.ids.filter((id,index)=>index<=s.index||id!==w.id);}
    d.states[w.id]=next;s.answers??={};s.answers[w.id]=value;
    for(const name of isNew?['log','newLog']:['log']){d[name][key]??=[];if(!d[name][key].includes(w.id))d[name][key].push(w.id);}
    if(value===0&&!s.retry.includes(w.id)){s.retry.push(w.id);s.ids.push(w.id);}
    s.index++;this.revealed=false;
    try{if(s.index>=s.ids.length)await this.completeSession(s);else await p.persist();this.render();}
    catch(error){p.data=JSON.parse(backup);this.screen='study';this.revealed=true;new Notice('保存失败，请重试。');this.render();}
    finally{this.busy=false;}
  }
  study(){const d=this.plugin.data,s=d.session;const w=this.plugin.words.find(w=>w.id===s.ids[s.index]);if(!w){el(this.page,'p','','词库已变动或本轮已完成。');button(this.page,'跳过已移除的词条',()=>this.skipMissingWord());return;}const top=el(this.page,'div','qcz-study-top');button(top,'← 返回',()=>{this.screen='home';this.render();},'qcz-link');el(top,'span','qcz-muted',`${s.index} / ${s.ids.length}`);const more=button(top,'⋮',event=>{const menu=new Menu();menu.addItem(item=>item.setTitle('掌握').onClick(()=>this.grade(2,{mastered:true})));menu.addItem(item=>item.setTitle('上一题').setDisabled(s.index===0).onClick(()=>this.previousQuestion()));menu.showAtMouseEvent(event);},'qcz-link qcz-more');more.setAttribute('aria-label','更多学习操作');more.setAttribute('aria-haspopup','menu');const progress=el(this.page,'progress','qcz-progress');progress.max=s.ids.length;progress.value=s.index;progress.setAttribute('aria-label','本轮学习进度');el(this.page,'div','qcz-eyebrow',s.mode==='new'?'NEW WORDS / 新学':'REVIEW / 复习');
    const head=el(this.page,'div','qcz-word-head');el(head,'h1','qcz-word',w.term);
    if(!this.revealed){const reveal=button(this.page,'',()=>{this.revealed=true;this.render();},'qcz-reveal');el(reveal,'strong','','试试回忆读音和释义');el(reveal,'span','qcz-muted','点击显示答案 · 空格键');return;}
    el(this.page,'p','qcz-reading',w.reading);el(this.page,'span','qcz-pill',w.pos);el(this.page,'h3','qcz-section-title','释义');el(this.page,'div','qcz-definition',w.meaning);el(this.page,'p','qcz-muted',`${w.unit} · ${w.section}`);if(w.url){const source=el(this.page,'a','qcz-source','查看原词条 ↗');source.href=w.url;source.target='_blank';source.rel='noopener noreferrer';}button(this.page,'打开词表笔记',()=>this.app.workspace.openLinkText(w.path,'',false),'qcz-link');
    el(this.page,'p','qcz-footnote qcz-keyboard-hint','快捷键：空格显示答案 · 1 忘记 · 2 模糊 · 3 认识');const actions=el(this.page,'div','qcz-grade-actions');for(const [i,title,sub]of[[0,'忘记','10 分钟后'],[1,'模糊','1 天后'],[2,'认识',d.states[w.id]?.interval?`${Math.min(180,Math.max(3,Math.round(d.states[w.id].interval*2.4)))} 天后`:'1 天后']]){const b=button(actions,'',()=>this.grade(i),`qcz-grade qcz-grade-${i}`);el(b,'strong','',title);el(b,'small','',sub);}
  }
  async finish(){this.plugin.data.session=null;await this.plugin.persist();this.screen='home';this.render();}
  async setWordStatus(word, grade){
    if(this.busy)return false;
    this.busy=true;
    const d=this.plugin.data,previous=d.states[word.id];
    // A manual correction sets a fresh interval without counting as a study or review.
    const next=schedule(null,grade);
    d.states[word.id]={...previous,...next,reviews:previous?.reviews||0,lapses:previous?.lapses||0};
    try{await this.plugin.persist();return true;}catch(error){if(previous)d.states[word.id]=previous;else delete d.states[word.id];new Notice('状态保存失败，请重试。');return false;}finally{this.busy=false;}
  }
  list(){
    button(this.page,'← 我的计划',()=>{this.screen='home';this.render();},'qcz-link');
    el(this.page,'h1','','学习列表');
    const input=el(this.page,'input','qcz-search');input.placeholder='搜索单词、读音或释义';input.setAttribute('aria-label','搜索词条');
    const filters=el(this.page,'div','qcz-status-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label','筛选学习状态');
    const results=el(this.page,'div');let count=100,active='all';const labels=['忘记','模糊','认识'];
    const matches=(w,value)=>{const st=this.plugin.data.states[w.id];return value==='all'||value==='new'&&!st||value==='due'&&st&&st.due<=Date.now()||value==='learned'&&!!st||['0','1','2'].includes(value)&&st?.grade===Number(value);};
    const draw=()=>{
      results.empty();filters.empty();const pool=this.subset();
      for(const [value,label]of [['all','全部'],['0','忘记'],['1','模糊'],['2','认识'],['new','未学习'],['due','待复习'],['learned','已学习']]){
        const b=button(filters,`${label} ${pool.filter(w=>matches(w,value)).length}`,()=>{active=value;count=100;draw();},`qcz-filter-chip qcz-status-${value}${active===value?' is-active':''}`);
        b.setAttribute('aria-pressed',String(active===value));
      }
      const query=input.value.trim().toLowerCase();
      const words=pool.filter(w=>matches(w,active)&&`${w.term} ${w.reading} ${w.meaning}`.toLowerCase().includes(query));
      el(results,'p','qcz-muted',`${words.length} 条`);
      for(const w of words.slice(0,count)){
        const row=el(results,'div','qcz-list-row');const st=this.plugin.data.states[w.id];
        el(row,'strong','',w.term);el(row,'span','qcz-muted',w.reading);el(row,'p','',w.meaning);
        const meta=el(row,'div','qcz-list-meta');
        const tag=button(meta,st?labels[st.grade]:'未学习',event=>{
          const menu=new Menu();
          labels.forEach((title,grade)=>menu.addItem(item=>item.setTitle(title).setChecked(st?.grade===grade).onClick(async()=>{
            if(this.busy)return;tag.disabled=true;
            try{if(await this.setWordStatus(w,grade)){draw();new Notice(`已将「${w.term}」调整为${title}，${grade===0?'10 分钟':'1 天'}后复习。`);}}finally{tag.disabled=false;}
          })));
          menu.showAtMouseEvent(event);
        },`qcz-status-tag qcz-status-${st?st.grade:'new'}`);
        tag.setAttribute('aria-label',`调整「${w.term}」的状态，当前${st?labels[st.grade]:'未学习'}`);tag.setAttribute('aria-haspopup','menu');
        el(meta,'small','qcz-muted',st?`下次复习 ${new Date(st.due).toLocaleString()}`:'尚未安排复习');
      }
      if(!words.length)el(results,'p','qcz-muted','没有符合条件的词条。');
      if(words.length>count)button(results,'再显示 100 条',()=>{count+=100;draw();});
    };
    el(this.page,'p','qcz-footnote','手动调整：忘记 → 10 分钟后；模糊 / 认识 → 1 天后。调整会重置间隔，不计入今日学习或打卡。');
    input.oninput=()=>{count=100;draw();};draw();
  }
}
module.exports=class WordChallenge extends Plugin {
  async onload(){this.data={...DEFAULTS,...await this.loadData()};this.words=[];this.registerView(TYPE,leaf=>{const v=new VocabularyView(leaf);v.plugin=this;return v;});this.addRibbonIcon('book-open-check','Word Challenge',()=>this.open());this.addCommand({id:'open',name:'打开背单词',callback:()=>this.open()});this.addSettingTab(new VocabularySettings(this.app,this));this.app.workspace.onLayoutReady(()=>this.loadWords());this.registerEvent(this.app.vault.on('modify',file=>{if(file.path.startsWith(this.data.folder+'/')&&file.extension==='md')this.reload();}));this.registerEvent(this.app.vault.on('create',()=>this.reload()));this.registerEvent(this.app.vault.on('delete',()=>this.reload()));this.registerEvent(this.app.vault.on('rename',()=>this.reload()));}
  async loadWords(){const files=this.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(this.data.folder+'/')).sort((a,b)=>a.path.localeCompare(b.path));const sets=await Promise.all(files.map(async f=>parseWords(await this.app.vault.cachedRead(f),f.path)));this.words=sets.flat();}
  async reload(){await this.loadWords();for(const leaf of this.app.workspace.getLeavesOfType(TYPE))leaf.view.render();}
  persist(){const snapshot=JSON.parse(JSON.stringify(this.data));this.saving=(this.saving||Promise.resolve()).catch(()=>{}).then(()=>this.saveData(snapshot));return this.saving;}
  async open(){let leaf=this.app.workspace.getLeavesOfType(TYPE)[0];if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:TYPE,active:true});}this.app.workspace.revealLeaf(leaf);}
  async playFeedback(grade,win){
    try{
      const Audio=win?.AudioContext||win?.webkitAudioContext;
      if(!Audio)return;
      if(!this.audioContext||this.audioContext.state==='closed')this.audioContext=new Audio();
      const ctx=this.audioContext;
      if(ctx.state==='suspended')await ctx.resume();
      if(ctx.state!=='running')return;
      const notes=[[330,220],[440,440],[660,880]][grade];
      if(!notes)return;
      const start=ctx.currentTime;
      notes.forEach((frequency,index)=>{
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        const at=start+index*.12;
        osc.type=grade===0?'triangle':'sine';osc.frequency.setValueAtTime(frequency,at);
        gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.055,at+.012);gain.gain.exponentialRampToValueAtTime(.001,at+.1);gain.gain.setValueAtTime(0,at+.115);
        osc.connect(gain);gain.connect(ctx.destination);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+.12);
      });
    }catch(error){/* Audio availability must not interrupt saving learning progress. */}
  }
  onunload(){if(this.audioContext){this.audioContext.close().catch(()=>{});this.audioContext=null;}for(const leaf of this.app.workspace.getLeavesOfType(TYPE))leaf.detach();}
};
class VocabularySettings extends PluginSettingTab {
  constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
  display(){const c=this.containerEl;c.empty();c.createEl('h2',{text:'Word Challenge · 学习计划'});new Setting(c).setName('每日新词').setDesc('每天首次学习的词条数，1–200。重复练习不重复计数。').addText(t=>t.setValue(String(this.plugin.data.daily)).onChange(async v=>{if(/^\d+$/.test(v)&&+v>=1&&+v<=200){this.plugin.data.daily=+v;await this.plugin.persist();}}));new Setting(c).setName('词库文件夹').setDesc('相对于当前仓库的路径。修改后点击重新读取。').addText(t=>t.setValue(this.plugin.data.folder).onChange(async v=>{this.plugin.data.folder=v.trim().replace(/\\/g,'/').replace(/\/$/,'');await this.plugin.persist();}));new Setting(c).setName('重新读取词库').addButton(b=>b.setButtonText('重新读取').onClick(async()=>{await this.plugin.reload();new Notice(`已读取 ${this.plugin.words.length} 条词条`);}));c.createEl('p',{text:'间隔规则：忘记 10 分钟；模糊 1 天；认识首次 1 天，之后约为上次间隔的 2.4 倍（上限 180 天）。忘记的词会在本轮末尾追加练习一次。进度保存在插件目录 data.json；原始词表不会被修改。'});}
}
