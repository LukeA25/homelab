export const initial=()=>({x1:0.6,x2:0.4,weight:1.2,focus:'all',caption:'A small network. A conversation you can see.'});
export function values(s){const h1=Math.max(0,s.weight*s.x1+0.5*s.x2-0.3),h2=Math.max(0,-0.6*s.x1+1.2*s.x2+0.1);return {...s,h1,h2,y:0.8*h1+0.4*h2};}
export function update(s,args){
 if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Expected an object');
 for(const [k,v] of Object.entries(args)){
  if(['x1','x2','weight'].includes(k)){const min=k==='weight'?-2:0,max=k==='weight'?2:1;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`Invalid ${k}`);}
  else if(k==='focus'){if(!['all','inputs','hidden','output','weight'].includes(v))throw Error('Invalid focus');}
  else if(k==='caption'){if(typeof v!=='string'||v.length>180)throw Error('Invalid caption');}
  else if(k==='animate'){if(typeof v!=='boolean')throw Error('Invalid animate');}
  else throw Error(`Unknown field ${k}`);
 }
 const {animate,...patch}=args;return {...s,...patch};
}
