const DAY = 86400000;
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
module.exports = {parseWords, schedule, dayKey, streak};
