export type Concept={id:string;title:string;x:number;y:number;requires:string[];state:string;summary:string;confidence:string;evidence:string;notes:string};
export type Tree={id:string;title:string;category:string;goal:string;depth:string;status:string;excludes:string;outcomes:string[];concepts:Concept[]};
export type Recap={schema_version:'0.1';session_id:string;tree_id:string;topics:{concept_id:string;summary:string;evidence:string;confidence:string;state:string}[];questions:string[]};
export type Session={id:string;tree_id:string;concept_id:string;created_at:string;status:string;prompt:string;recap?:Recap};
export type Workspace={trees:Tree[];ideas:{id:string;text:string;created_at:string}[];sessions:Session[]};
export async function api(path:string,method='GET',body?:unknown){const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:'Check the fields and JSON structure, then try again.');return d;}
export function nextConcept(t:Tree){return t.concepts.find(c=>c.state==='needs-review')||t.concepts.find(c=>c.state!=='understood'&&c.requires.every(id=>t.concepts.find(p=>p.id===id)?.state==='understood'))||t.concepts.find(c=>c.state!=='understood')||t.concepts[0];}
