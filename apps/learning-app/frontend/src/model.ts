export type Concept={id:string;title:string;x:number;y:number;requires:string[];state:string;summary:string;confidence:string;evidence:string;notes:string};
export type Tree={id:string;title:string;category:string;goal:string;depth:string;status:string;excludes:string;outcomes:string[];concepts:Concept[];idea_id?:string|null};
export type Recap={schema_version:'0.1';session_id:string;tree_id:string;topics:{concept_id:string;summary:string;evidence:string;confidence:string;state:string}[];questions:string[]};
export type Session={id:string;tree_id:string;concept_id:string;created_at:string;status:string;prompt:string;recap?:Recap};
export type Idea={id:string;text:string;created_at:string;title?:string;idea?:string;why?:string;direction?:string;starting_point?:string;source?:string;suggestion?:string};
export type IdeaDraft={title:string;idea:string;why:string;direction:string;starting_point:string;source:string;suggestion:string};
export type Workspace={trees:Tree[];ideas:Idea[];sessions:Session[];drafts?:{id:string;idea_id?:string|null;title:string;category:string;goal:string;depth:string;excludes:string;outcomes:string[];concepts:string[]}[];preferences?:{id:string;text:string;created_at:string}[]};
function explain(detail:unknown){if(typeof detail==='string')return detail;if(Array.isArray(detail))return detail.map(item=>item&&typeof item==='object'&&'msg' in item?String(item.msg):String(item)).join(' ');return 'Check the fields and JSON structure, then try again.';}
export async function api(path:string,method='GET',body?:unknown){const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(explain(d.detail));return d;}
export function nextConcept(t:Tree){return t.concepts.find(c=>c.state==='needs-review')||t.concepts.find(c=>c.state!=='understood'&&c.requires.every(id=>t.concepts.find(p=>p.id===id)?.state==='understood'))||t.concepts.find(c=>c.state!=='understood')||t.concepts[0];}
function nice(value:string){return value.replace(/\w\S*/g,word=>word[0].toUpperCase()+word.slice(1).toLowerCase());}
export function place(category:string){
  const parts=category.split('/').map(part=>part.trim()).filter(Boolean);
  const parents:Record<string,string>={thomism:'Theology',algorithms:'Computer science','artificial intelligence':'Computer science'};
  if(parts.length>=2)return {group:nice(parts[0]),subject:nice(parts.slice(1).join(' / '))};
  const only=parts[0]||'General';
  return {group:parents[only.toLowerCase()]||nice(only),subject:nice(only)};
}
export function subjectHue(group:string){
  const key=group.toLowerCase();
  if(key==='computer science')return 207;
  if(key==='theology')return 268;
  let hash=0;
  for(const char of key)hash=(hash*33+char.charCodeAt(0))%70;
  return 200+hash;
}
export function conceptRank(tree:Tree,id:string,seen=new Set<string>()):number{
  if(seen.has(id))return 0;
  const concept=tree.concepts.find(item=>item.id===id);
  if(!concept?.requires.length)return 0;
  seen.add(id);
  return 1+Math.max(0,...concept.requires.map(req=>conceptRank(tree,req,seen)));
}
export function depthColor(hue:number,rank:number,max:number){
  const step=max<=0?0:rank/max;
  const h=Math.round(hue+step*4);
  const s=Math.round(18+step*10);
  const l=Math.round(86-step*14);
  return {background:`hsl(${h} ${s}% ${l}%)`,color:'#283d32'};
}
export function groupTrees(trees:Tree[]){
  const order=['Computer science','Theology'];
  const map=new Map<string,Tree[]>();
  for(const tree of trees){const group=place(tree.category).group;map.set(group,[...(map.get(group)||[]),tree]);}
  return [...map.entries()].sort((a,b)=>(order.indexOf(a[0])<0?99:order.indexOf(a[0]))-(order.indexOf(b[0])<0?99:order.indexOf(b[0]))||a[0].localeCompare(b[0]));
}
