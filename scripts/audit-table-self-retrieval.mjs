/**
 * NAT-111/D-167: deterministic audit of existing normative table rows only.
 * Usage after npm run build: node scripts/audit-table-self-retrieval.mjs [output.json]
 * Compares the integrated KB with the same KB minus specification units, not a
 * historical server. No model, references, benchmark labels or reserve access.
 */
import {writeFileSync} from 'node:fs';
import {getKnowledgeBase} from '../dist/data/knowledge.js';
import {rankRules,isTableRow} from '../dist/data/retrieval.js';
import {groupUnits} from '../dist/responses/retrieval.js';
const kb=getKnowledgeBase();
const old={...kb,rules:kb.rules.filter(r=>r.force!=='especificacao')};
const STOP=new Set('a o as os de da do das dos e é em um uma para por com que se no na nos nas ao à ser deve devem não the of and to'.split(' '));
const query=t=>t.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/…$/,'').split(/\s+/).map(w=>w.replace(/[^\p{L}\p{N}-]/gu,'')).filter(w=>w&&!STOP.has(w.toLowerCase())).slice(0,12).join(' ').normalize('NFD').replace(/\p{M}/gu,'');
function rank(r,text,component,base){
 const hits=rankRules({text,component},base).results.map(s=>({rule:s.rule,matched:[],relation:'global',field:null}));
 const units=groupUnits(hits);
 const row=u=>isTableRow(u.hits[0].rule.originalText);
 const ordered=[...units.filter(u=>!row(u)),...units.filter(row)];
 return ordered.findIndex(u=>u.hits.some(h=>h.rule.id===r.id))+1;
}
const rows=[];
const targets=old.rules.filter(r=>r.force!=='example'&&isTableRow(r.originalText));
for(const r of targets){
 const head=r.source.section??''; const text=r.originalText.startsWith(head)?r.originalText:`${head} ${r.originalText}`;
 const probes=[[query(text),null],[query(text),r.component],[query(r.originalText),null]];
 rows.push({id:r.id,component:r.component,section:head,force:r.force,before:probes.map(([q,c])=>rank(r,q,c,old)),after:probes.map(([q,c])=>rank(r,q,c,kb))});
}
const top5=x=>x.some(n=>n>0&&n<=5);
const out={scope:`${targets.length} existing normative table rows only, direct ranking + response grouping; not the complete historical stdio sweep or scientific benchmark`,query:'first 12 content words, heading+text/free, heading+text/component hint, text only/free',count:rows.length,top5Before:rows.filter(x=>top5(x.before)).length,top5After:rows.filter(x=>top5(x.after)).length,changed:rows.filter(x=>JSON.stringify(x.before)!==JSON.stringify(x.after)),outsideTop5AllThree:rows.filter(x=>!top5(x.after)),rows};
const output=process.argv[2]; if(output) writeFileSync(output,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({...out,rows:undefined,outsideTop5AllThree:out.outsideTop5AllThree.length,changed:out.changed.length}));
