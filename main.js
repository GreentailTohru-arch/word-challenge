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
const DEFAULTS={folder:'Word Challenge/词库', language:'auto', daily:20, unit:'', states:{}, log:{}, newLog:{}, session:null};
function el(parent, tag, cls, text) { return parent.createEl(tag,{cls,text}); }
function button(parent, text, fn, cls='') { const b=el(parent,'button',cls,text); b.addEventListener('click',fn); return b; }
class VocabularyView extends ItemView {
  getViewType(){return TYPE;} getDisplayText(){return 'Word Challenge';} getIcon(){return 'book-open-check';}
  async onOpen(){this.containerEl.children[1].addClass('qcz-container'); await this.plugin.loadWords(); this.render(); this.registerDomEvent(this.containerEl,'keydown',e=>{ if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.repeat||e.ctrlKey||e.metaKey||e.altKey) return; const s=this.plugin.data.session; if(!s)return; if(e.code==='Space'){e.preventDefault();this.revealed=true;this.render();} else if(this.revealed&&['1','2','3'].includes(e.key)){e.preventDefault();this.grade(Number(e.key)-1);} else if(e.key==='Escape'){this.screen='home';this.render();} });}
  async onClose(){this.containerEl.children[1].empty();}
  subset(){return this.plugin.words.filter(w=>!this.plugin.data.unit||w.unit===this.plugin.data.unit);}
  render(){const root=this.containerEl.children[1];root.empty(); root.scrollTop=0; const page=el(root,'div',this.screen==='study'&&this.plugin.data.session?'qcz-page qcz-study-page':'qcz-page'); this.page=page; if(this.screen==='study'&&this.plugin.data.session) this.study(); else if(this.screen==='list') this.list(); else this.home();}
  home(){const p=this.plugin,d=p.data,words=this.subset(),now=Date.now(),learned=words.filter(w=>d.states[w.id]),mastered=learned.filter(w=>d.states[w.id].interval>=21&&d.states[w.id].grade===2),due=learned.filter(w=>d.states[w.id].due<=now); const today=d.log[dayKey()]||[]; const remaining=words.length-learned.length;
    el(this.page,'div','qcz-eyebrow','WORD CHALLENGE / 每天进步一点'); el(this.page,'h1','','我的学习计划');
    const card=el(this.page,'section','qcz-plan'); const heading=el(card,'div','qcz-plan-heading'); const cover=el(heading,'div','qcz-cover'); el(cover,'small','','WORD'); el(cover,'strong','','W\nC'); el(cover,'small','','CHALLENGE'); const info=el(heading,'div','qcz-plan-info'); el(info,'span','qcz-eyebrow','MY VOCABULARY'); el(info,'h2','',d.folder.split('/').filter(Boolean).pop()||'我的词库'); el(info,'p','qcz-muted',`${words.length} 条${d.unit?' · 已筛选单元':''}`); el(info,'span','qcz-pill',remaining?`预计还需 ${Math.ceil(remaining/d.daily)} 天 · 每天 ${d.daily} 个新词`:'本单元新词已学完');
    const progress=el(card,'progress','qcz-progress');progress.max=words.length||1;progress.value=learned.length;progress.setAttribute('aria-label','已学词条进度'); const legend=el(card,'div','qcz-legend');el(legend,'span','',`● 掌握 ${mastered.length}`);el(legend,'span','',`已学 ${learned.length}`); button(legend,'学习列表 →',()=>{this.screen='list';this.render();},'qcz-link');
    const todayNewCount=(d.newLog[dayKey()]||[]).length;el(card,'p','qcz-daily-status',todayNewCount>=d.daily?`今日新词 ${todayNewCount} / ${d.daily} · 目标已完成，可继续加学`:`今日新词 ${todayNewCount} / ${d.daily}`);const actions=el(card,'div','qcz-actions');button(actions,`复习 ${due.length}`,()=>this.start('review'),'qcz-primary');button(actions,(d.newLog[dayKey()]||[]).length>=d.daily?`继续新学 · ${d.daily}`:'新学 →',()=>this.start('new'),'qcz-secondary');if(d.session)button(card,`继续上次学习（${d.session.index}/${d.session.ids.length}）`,()=>{this.screen='study';this.revealed=false;this.render();},'qcz-resume');
    const filter=el(this.page,'div','qcz-filter');el(filter,'label','','学习范围');const select=el(filter,'select');select.setAttribute('aria-label','学习范围');for(const unit of ['',...new Set(p.words.map(w=>w.unit))]){const option=el(select,'option','',unit||'全部单元');option.value=unit;}select.value=d.unit;select.onchange=async()=>{d.unit=select.value;await p.persist();this.render();};
    const stats=el(this.page,'section','qcz-stats'); el(stats,'p','qcz-muted','今日学习');el(stats,'strong','qcz-today',String(today.length));const grid=el(stats,'div','qcz-stat-grid');for(const [label,value]of[['累计学词',Object.keys(d.states).length],['累计打卡',Object.values(d.log).filter(x=>x.length).length],['连续打卡',streak(d.log)]]){const item=el(grid,'div');el(item,'span','qcz-muted',label);el(item,'strong','',String(value));}
    el(this.page,'p','qcz-footnote','忘记：本轮补练一次；模糊：1 天后；认识：间隔逐步延长。已学不等于掌握；掌握需间隔达到 21 天且最近回答认识。');if(!p.words.length)el(this.page,'p','','没有找到词条，请在插件设置中检查词库文件夹。');
  }
  async start(mode){const p=this.plugin,d=p.data;if(d.session){new Notice('请先继续或结束上次学习，再开始新的任务。');return;}const now=Date.now();const todayNew=(d.newLog[dayKey()]||[]).length;const pool=this.subset().filter(w=>mode==='new'?!d.states[w.id]:d.states[w.id]&&d.states[w.id].due<=now);if(mode==='review')pool.sort((a,b)=>d.states[a.id].due-d.states[b.id].due);const limit=mode==='new'?(todayNew<d.daily?d.daily-todayNew:d.daily):50;const ids=pool.slice(0,limit).map(w=>w.id);if(!ids.length){new Notice(mode==='new'?'所选范围的新词已学完，可切换其他单元。':'暂时没有到期复习词。');return;}d.session={ids,index:0,mode,retry:[]};await p.persist();this.screen='study';this.revealed=false;this.render();}
  study(){const d=this.plugin.data,s=d.session;const w=this.plugin.words.find(w=>w.id===s.ids[s.index]);if(!w){el(this.page,'p','','词库已变动或本轮已完成。');button(this.page,'结束本轮',()=>this.finish());return;}const top=el(this.page,'div','qcz-study-top');button(top,'← 返回',()=>{this.screen='home';this.render();},'qcz-link');el(top,'span','qcz-muted',`${s.index} / ${s.ids.length}`);button(top,'结束本轮',()=>this.finish(),'qcz-link');const progress=el(this.page,'progress','qcz-progress');progress.max=s.ids.length;progress.value=s.index;progress.setAttribute('aria-label','本轮学习进度');el(this.page,'div','qcz-eyebrow',s.mode==='new'?'NEW WORDS / 新学':'REVIEW / 复习');
    const head=el(this.page,'div','qcz-word-head');el(head,'h1','qcz-word',w.term);if(this.revealed)button(head,'♫ 朗读',()=>this.speak(w.reading||w.term),'qcz-speak');
    if(!this.revealed){const reveal=button(this.page,'',()=>{this.revealed=true;this.render();},'qcz-reveal');el(reveal,'strong','','试试回忆读音和释义');el(reveal,'span','qcz-muted','点击显示答案 · 空格键');return;}
    el(this.page,'p','qcz-reading',w.reading);el(this.page,'span','qcz-pill',w.pos);el(this.page,'h3','qcz-section-title','释义');el(this.page,'div','qcz-definition',w.meaning);el(this.page,'p','qcz-muted',`${w.unit} · ${w.section}`);if(w.url){const source=el(this.page,'a','qcz-source','查看原词条 ↗');source.href=w.url;source.target='_blank';source.rel='noopener noreferrer';}button(this.page,'打开词表笔记',()=>this.app.workspace.openLinkText(w.path,'',false),'qcz-link');
    el(this.page,'p','qcz-footnote qcz-keyboard-hint','快捷键：空格显示答案 · 1 忘记 · 2 模糊 · 3 认识');const actions=el(this.page,'div','qcz-grade-actions');for(const [i,title,sub]of[[0,'忘记','10 分钟后'],[1,'模糊','1 天后'],[2,'认识',d.states[w.id]?.interval?`${Math.min(180,Math.max(3,Math.round(d.states[w.id].interval*2.4)))} 天后`:'1 天后']]){const b=button(actions,'',()=>this.grade(i),`qcz-grade qcz-grade-${i}`);el(b,'strong','',title);el(b,'small','',sub);}
  }
  async grade(value){if(this.busy||!this.revealed||this.screen!=='study')return;this.busy=true;const p=this.plugin,d=p.data,s=d.session,w=p.words.find(w=>w.id===s.ids[s.index]);if(!w){this.busy=false;return;}this.plugin.playFeedback(value,this.containerEl.ownerDocument?.defaultView);const backup=JSON.stringify(d);const key=dayKey();const isNew=!d.states[w.id];d.states[w.id]=schedule(d.states[w.id],value);for(const name of isNew?['log','newLog']:['log']){d[name][key]??=[];if(!d[name][key].includes(w.id))d[name][key].push(w.id);}if(value===0&&!s.retry.includes(w.id)){s.retry.push(w.id);s.ids.push(w.id);}s.index++;this.revealed=false;try{await p.persist();if(s.index>=s.ids.length){d.session=null;await p.persist();this.screen='home';new Notice('本轮学习完成，进度已保存。');}this.render();}catch(e){p.data=JSON.parse(backup);this.revealed=true;new Notice('保存失败，请重试。');this.render();}finally{this.busy=false;}}
  async finish(){this.plugin.data.session=null;await this.plugin.persist();this.screen='home';this.render();}
  speak(text){const win=this.containerEl.ownerDocument.defaultView;if(!win.speechSynthesis){new Notice('当前设备不支持语音朗读。');return;}const voices=win.speechSynthesis.getVoices();const language=this.plugin.data.language==='auto'?(/[ぁ-んァ-ヶ]/.test(text)?'ja-JP':/[一-龯]/.test(text)?'zh-CN':'en-US'):(this.plugin.data.language||'en-US');const voice=voices.find(v=>v.lang===language)||voices.find(v=>v.lang.startsWith(language.split('-')[0]));if(!voice){new Notice('请在系统中安装所选语言的语音。');return;}const utterance=new win.SpeechSynthesisUtterance(text);utterance.lang=language;utterance.voice=voice;utterance.rate=.85;win.speechSynthesis.cancel();win.speechSynthesis.speak(utterance);}
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
  display(){const c=this.containerEl;c.empty();c.createEl('h2',{text:'Word Challenge · 学习计划'});new Setting(c).setName('朗读语言').setDesc('自动识别日语假名、中文与英文；其他语言请选择对应语音。').addDropdown(t=>{for(const [value,label]of [['auto','自动'],['en-US','English'],['ja-JP','日本語'],['zh-CN','中文'],['fr-FR','Français'],['de-DE','Deutsch'],['es-ES','Español'],['ko-KR','한국어']])t.addOption(value,label);t.setValue(this.plugin.data.language||'auto').onChange(async value=>{this.plugin.data.language=value;await this.plugin.persist();});});new Setting(c).setName('每日新词').setDesc('每天首次学习的词条数，1–200。重复练习不重复计数。').addText(t=>t.setValue(String(this.plugin.data.daily)).onChange(async v=>{if(/^\d+$/.test(v)&&+v>=1&&+v<=200){this.plugin.data.daily=+v;await this.plugin.persist();}}));new Setting(c).setName('词库文件夹').setDesc('相对于当前仓库的路径。修改后点击重新读取。').addText(t=>t.setValue(this.plugin.data.folder).onChange(async v=>{this.plugin.data.folder=v.trim().replace(/\\/g,'/').replace(/\/$/,'');await this.plugin.persist();}));new Setting(c).setName('重新读取词库').addButton(b=>b.setButtonText('重新读取').onClick(async()=>{await this.plugin.reload();new Notice(`已读取 ${this.plugin.words.length} 条词条`);}));c.createEl('p',{text:'间隔规则：忘记 10 分钟；模糊 1 天；认识首次 1 天，之后约为上次间隔的 2.4 倍（上限 180 天）。忘记的词会在本轮末尾追加练习一次。进度保存在插件目录 data.json；原始词表不会被修改。'});}
}
