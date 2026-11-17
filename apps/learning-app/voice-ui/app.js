import {defaultVoice, realtimeVoices, liveVoices} from './voices.mjs';
import {appendCaption, finishCaption} from './captions.mjs';
import {createOrb, voiceFrameRate} from './orb.js';
import {createNetwork} from './network.js';
import {createBoard} from './board.js';
const params = new URLSearchParams(location.search);
const mode = params.get('mode') || (params.get('session') ? 'lesson' : '');
const lessonId = params.get('session');
const focus = params.get('focus') || '';
const seed = params.get('seed') || '';
const modeTitle = {lesson:'Your lesson', plan:'Plan a learning path'};
if (modeTitle[mode]) document.getElementById('mode-label').textContent = modeTitle[mode];
let heldTranscript = '';
const turns = [];
let captionsOn = false;
try { captionsOn = localStorage.getItem('grove.captions') === '1'; } catch {}
function paintCaptions() {
  const box = $('speech-log');
  const visible = captionsOn && turns.some(turn => turn.text.trim());
  box.hidden = !visible;
  box.replaceChildren();
  if (!visible) return;
  for (const turn of turns) {
    if (!turn.text.trim()) continue;
    const line = document.createElement('p');
    line.className = turn.who;
    const label = document.createElement('span');
    label.textContent = turn.who === 'you' ? 'You' : 'Tutor';
    line.append(label, document.createTextNode(turn.text));
    box.append(line);
  }
}
function setCaptions(on) {
  captionsOn = on;
  const button = $('speech-toggle');
  button.classList.toggle('on', on);
  button.setAttribute('aria-pressed', String(on));
  button.setAttribute('aria-label', on ? 'Hide captions' : 'Show captions');
  try { localStorage.setItem('grove.captions', on ? '1' : '0'); } catch {}
  paintCaptions();
}
function hearCaption(who, delta, startMs, endMs) {
  appendCaption(turns, who, delta, startMs, endMs);
  paintCaptions();
}
const $ = id => document.getElementById(id);
const performanceMode = location.hash === '#performance';
let recordFrame = null;
const orb = createOrb($('orb'), $('voice-strip'), performanceMode ? {onFrame: sample => recordFrame?.(sample)} : {});
const network = createNetwork(() => shareContext());
const board = createBoard(network, orb.setCompact);
let connection = null;
const voicePicker = $('voice');
function populateVoices() {
  let selected = voicePicker.value || defaultVoice;
  try { selected=localStorage.getItem('grove.neural-lab.voice') || selected; } catch {}
  const voices=$('engine').value==='live' ? liveVoices : realtimeVoices;
  voicePicker.replaceChildren();
  for (const voice of voices) voicePicker.add(new Option(voice[0].toUpperCase()+voice.slice(1),voice));
  voicePicker.value=voices.includes(selected) ? selected : defaultVoice;
}
populateVoices();
$('engine').onchange=populateVoices;
voicePicker.onchange=()=>{try{localStorage.setItem('grove.neural-lab.voice',voicePicker.value);}catch{}};
function status(text) {
  const el=$('status');
  el.textContent=text||'';
  el.classList.toggle('quiet', !/error|fail|warning|blocked|allow|unavailable|correction|timed out|not configured|could not|needs/i.test(text||''));
}
function send(event) {
  if (connection?.channel?.readyState==='open') {
    connection.channel.send(JSON.stringify({event_id:crypto.randomUUID(),...event}));
  }
}
function shareContext() {
  if (!connection?.ready || connection.closing) return;
  const text = `Learner changed the visual. Current visual: ${JSON.stringify(board.read())}. Neural state: ${JSON.stringify(network.read())}. Use this for the next question.`;
  if (connection.engine==='live') send({type:'session.thinking.append',delegation_id:null,content:text.slice(0,1700)});
  else send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});
}
function explain(body) {
  const detail = body?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(item => item?.msg || String(item)).join(' ');
  return 'Could not save';
}
async function postJson(path, payload) {
  const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return {error: explain(body)};
  return body;
}
async function execute(call) {
  try {
    const args=JSON.parse(call.arguments);
    if (call.name==='remember_preference') {
      const body = await postJson('/api/preferences', {text:args.text});
      if (body.error) return body;
      window.parent.postMessage({type:'grove-preference', preference:body}, location.origin);
      return {status:'saved', text:body.text};
    }
    if (call.name==='search_knowledge') {
      const params = new URLSearchParams();
      if (args.query) params.set('q', args.query);
      if (args.subject) params.set('subject', args.subject);
      const response = await fetch('/api/knowledge?' + params.toString());
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return {error: explain(body)};
      return body;
    }
    if (call.name==='update_path') {
      if (!lessonId) return {error:'Open a lesson before changing a path'};
      const body = await postJson(`/api/sessions/${lessonId}/path`, args);
      if (body.error) return body;
      window.parent.postMessage({type:'grove-updated'}, location.origin);
      return {status:'saved', concepts:(body.concepts||[]).map(item => ({id:item.id, title:item.title, knowledge_id:item.knowledge_id, objectives:item.objectives}))};
    }
    if (call.name==='close_session') {
      if (!lessonId) return {error:'Open a lesson before ending it'};
      const body = await postJson(`/api/sessions/${lessonId}/close`, args);
      if (body.error) return body;
      window.parent.postMessage({type:'grove-session-closed', tree:body.tree}, location.origin);
      return {status:'saved', hangup:true, message:'Notes saved.'};
    }
    if (call.name==='create_path') {
      const body = await postJson('/api/trees', args);
      if (body.error) return body;
      window.parent.postMessage({type:'grove-path-created', tree:body}, location.origin);
      return {status:'saved', hangup:true, message:'Path saved.', tree_id:body.id, concepts:(body.concepts||[]).map(item => ({id:item.id, title:item.title, knowledge_id:item.knowledge_id}))};
    }
    if (call.name==='show_visual') return board.show(args);
    if (call.name==='update_visual') return network.apply(args);
    throw Error('Unknown visual tool');
  } catch (error) { return {error:error.message}; }
}
let elapsedBase=0, elapsedMark=0, elapsedTimer=0;
function paintElapsed(){const total=elapsedBase+(elapsedMark?Date.now()-elapsedMark:0);const seconds=Math.floor(total/1000);$('elapsed').hidden=false;$('elapsed').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
function runClock(){if(!elapsedMark)elapsedMark=Date.now();clearInterval(elapsedTimer);elapsedTimer=setInterval(paintElapsed,1000);paintElapsed();}
function freezeClock(){if(elapsedMark)elapsedBase+=Date.now()-elapsedMark;elapsedMark=0;clearInterval(elapsedTimer);paintElapsed();}
function resetClock(){elapsedBase=0;elapsedMark=0;clearInterval(elapsedTimer);$('elapsed').hidden=true;$('elapsed').textContent='0:00';}
function ready(call) {
  if (connection!==call || call.ready || call.closing) return;
  call.ready=true;
  clearTimeout(call.connectTimer);
  $('mute').disabled=false;$('mute').hidden=false;$('start').hidden=false;$('start').disabled=false;$('start').textContent='Pause';
  $('wrap').hidden=false;$('wrap').textContent=mode==='plan'?'Create path':'Wrap up';
  runClock();
  status('Connected.');
  shareContext();
  const opener={lesson:'Begin the selected learning session from its saved context. Ask one question at a time.',plan:'Help the learner plan a finite learning path, one question at a time. If they say they are done, call create_path immediately.'}[mode] || 'Ask one question at a time.';
  if (call.engine==='live') send({type:'session.commentary.append',delegation_id:null,content:opener});
  else send({type:'response.create'});
}
async function onEvent(call, envelope) {
  if (connection!==call) return;
  if (envelope.type==='session.closed') {finish(call, call.closing ? 'Conversation ended.' : 'The voice connection ended.', !call.closing);return;}
  if (envelope.type==='error') {status(envelope.error?.message || 'Voice service error');return;}
  if (call.closing) return;
  if (envelope.type==='session.started') ready(call);
  if (envelope.type==='session.output_transcript.delta') {$('transcript').textContent=($('transcript').textContent+(envelope.delta || '')).slice(-6000);hearCaption('tutor', envelope.delta, envelope.start_ms, envelope.end_ms);}
  if (envelope.type==='session.input_transcript.delta') hearCaption('you', envelope.delta, envelope.start_ms, envelope.end_ms);
  if (call.engine!=='live' && envelope.type==='response.output_audio_transcript.delta') hearCaption('tutor', envelope.delta);
  if (call.engine!=='live' && envelope.type==='response.output_audio_transcript.done') {$('transcript').textContent=envelope.transcript;finishCaption(turns, 'tutor', envelope.transcript);paintCaptions();}
  if (call.engine!=='live' && envelope.type==='conversation.item.input_audio_transcription.delta') hearCaption('you', envelope.delta);
  if (call.engine!=='live' && envelope.type==='conversation.item.input_audio_transcription.completed') {finishCaption(turns, 'you', envelope.transcript);paintCaptions();}
  if (envelope.type==='input_audio_buffer.speech_started') status('Listening…');
  if (envelope.type==='output_audio_buffer.started') status('Tutor speaking · interrupt anytime');
  if (envelope.type==='output_audio_buffer.stopped') status('Ask a question, or ask me to show you.');
  if (envelope.type==='response.event') {
    const event=envelope.event;
    if (event.type==='response.output_item.done' && event.item?.type==='function_call') {
      if (call.handled.has(event.item.call_id)) return;
      call.handled.add(event.item.call_id);
      const result = await execute(event.item);
      send({type:'response.item.create',item:{type:'function_call_output',call_id:event.item.call_id,output:JSON.stringify(result)}});
      if (result.hangup) {end(result.message || 'Saved.'); return;}
      send({type:'response.create'});
    }
    if (event.type==='response.failed') status('Visual request failed. Try asking again.');
  }
  if (call.engine!=='live' && envelope.type==='response.done') {
    const calls=envelope.response?.output?.filter(item=>item.type==='function_call') || [];
    for (const item of calls) {
      if (call.handled.has(item.call_id)) continue;
      call.handled.add(item.call_id);
      const result = await execute(item);
      send({type:'conversation.item.create',item:{type:'function_call_output',call_id:item.call_id,output:JSON.stringify(result)}});
      if (result.hangup) {end(result.message || 'Saved.'); return;}
    }
    if (calls.length) send({type:'response.create'});
    if (envelope.response?.status==='failed') status(envelope.response.status_details?.error?.message || 'Response failed. Try again.');
  }
}
function cleanup(call, message, keepTime=false) {
  if (connection!==call) return;
  connection=null;
  clearTimeout(call.closeTimer);clearTimeout(call.connectTimer);
  call.abort.abort();call.stream?.getTracks().forEach(track=>track.stop());
  call.channel?.close();call.peer?.close();orb.stop();
  $('audio').pause();$('audio').srcObject=null;
  if (keepTime) freezeClock(); else resetClock();
  $('start').disabled=false;$('mute').disabled=true;$('wrap').hidden=true;$('mute').classList.remove('muted');$('mute').setAttribute('aria-pressed','false');
  $('engine').disabled=false;voicePicker.disabled=false;
  $('start').textContent=heldTranscript?'Resume':'Start conversation';
  status(message);
}
function finish(call, message, unexpected) {
  if (call.pausing || call.recapHangup) unexpected = true;
  if (call.pausing) message = 'Paused.';
  if (call.recapHangup) message = '';
  if (unexpected) heldTranscript = heldTranscript || $('transcript').textContent;
  else heldTranscript = '';
  cleanup(call, call.pausing ? 'Paused.' : (unexpected && message ? `${message} Resume to continue this conversation.` : message), unexpected || call.pausing || call.recapHangup);
  $('start').textContent = call.recapHangup ? 'Start conversation' : (heldTranscript ? 'Play' : 'Start conversation');
  if (call.recapHangup) {$('start').hidden=true;$('mute').hidden=true;}
}
function end(message='Conversation ended.') {
  heldTranscript='';
  const call=connection;
  if (!call || call.closing) return;
  call.closing=true;$('mute').disabled=true;$('start').disabled=true;
  // Stop capture immediately, while allowing Live to acknowledge session closure.
  call.stream?.getTracks().forEach(track=>track.stop());
  $('audio').pause();
  if (call.engine==='live' && call.ready && call.channel.readyState==='open') {
    status('Closing conversation…');send({type:'session.close'});
    call.closeTimer=setTimeout(()=>cleanup(call,`${message} Session close was not confirmed by OpenAI.`),15000);
  } else cleanup(call,message);
}
function hangUp(call, kind) {
  if (!call || call.closing) return;
  heldTranscript=$('transcript').textContent;
  call[kind]=true;
  call.stream?.getTracks().forEach(track=>{track.enabled=false;track.stop();});
  $('audio').pause();$('audio').srcObject=null;
  if (call.engine==='live' && call.channel?.readyState==='open') {try{send({type:'session.close'});}catch{}}
  call.peer?.close();
  call.channel?.close();
  finish(call, kind==='pausing'?'Paused.':'', true);
}
$('start').onclick=async()=>{
  if (connection?.ready && !connection.closing) {hangUp(connection, 'pausing');return;}
  if (connection) return;
  const call={engine:'live',ready:false,closing:false,paused:false,muted:false,abort:new AbortController(),handled:new Set()};
  connection=call;
  $('start').disabled=true;$('engine').disabled=true;voicePicker.disabled=true;
  if (!heldTranscript) {$('transcript').textContent='';turns.length=0;paintCaptions();resetClock();}
  status('Connecting microphone…');
  try {
    if(!mode)throw Error('Open voice from Learning Grove.');
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone access requires HTTPS or localhost.');
    await orb.start();
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    if (connection!==call) {stream.getTracks().forEach(track=>track.stop());return;}
    call.stream=stream;orb.input(stream);
    const peer=new RTCPeerConnection();call.peer=peer;
    peer.ontrack=event=>{
      if (connection!==call) return;
      const remote=new MediaStream([event.track]);$('audio').srcObject=remote;orb.output(remote);
      $('audio').play().then(()=>{$('hear').hidden=true;}).catch(()=>{$('hear').hidden=false;});
    };
    peer.onconnectionstatechange=()=>{
      if (['failed','disconnected'].includes(peer.connectionState)) finish(call,'The voice connection ended.', true);
    };
    stream.getTracks().forEach(track=>peer.addTrack(track,stream));
    const channel=peer.createDataChannel('oai-events');call.channel=channel;
    channel.onmessage=event=>{void (async()=>{try{await onEvent(call,JSON.parse(event.data));}catch(error){status(`Event error: ${error.message}`);}})();};
    channel.onopen=()=>{if (call.engine!=='live') ready(call);};
    channel.onclose=()=>finish(call, call.engine==='live'?'Connection closed. Final session usage unconfirmed.':'Connection closed.', !call.closing);
    const offer=await peer.createOffer();await peer.setLocalDescription(offer);
    status('Connecting…');
    const response=await fetch('/api/voice/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sdp:offer.sdp,mode,session_id:lessonId,focus:focus||undefined,resume:heldTranscript||seed||undefined}),signal:call.abort.signal});
    if (!response.ok) {const body=await response.json();throw Error(body.detail || body.error || 'Connection failed');}
    call.engine=response.headers.get('x-grove-engine')||'live';
    const answer=call.engine==='live'?(await response.json()).transport?.sdp:await response.text();
    if (connection!==call) return;
    if (!answer) throw Error('OpenAI returned no SDP answer');
    call.connectTimer=setTimeout(()=>cleanup(call,'Connection timed out. Check network access and retry.'),20000);
    await peer.setRemoteDescription({type:'answer',sdp:answer});
  } catch(error) {
    cleanup(call,error.name==='NotAllowedError'?'Allow microphone access in your browser and try again.':error.message);
  }
};
$('mute').onclick=()=>{
  if (!connection?.stream) return;
  connection.muted=!connection.muted;
  const track=connection.stream.getAudioTracks()[0];
  if (track) track.enabled=!connection.muted && !connection.paused;
  $('mute').classList.toggle('muted', connection.muted);
  $('mute').setAttribute('aria-pressed', String(connection.muted));
  $('mute').setAttribute('aria-label', connection.muted ? 'Unmute microphone' : 'Mute microphone');
};
$('hear').onclick=()=>$('audio').play().then(()=>{$('hear').hidden=true;}).catch(()=>status('Audio is still blocked.'));
$('speech-toggle').onclick=()=>setCaptions(!captionsOn);
setCaptions(captionsOn);
$('clear').onclick=()=>{board.show({kind:'clear'});shareContext();};
$('settings-toggle').onclick=()=>{$('settings').hidden=!$('settings').hidden;$('settings-toggle').setAttribute('aria-expanded',String(!$('settings').hidden));};
window.addEventListener('message', event => {if(event.origin===location.origin && event.source===window.parent && event.data?.type==='grove-end') end();});
window.addEventListener('pagehide',()=>{if(connection?.engine==='live')send({type:'session.close'});if(connection)cleanup(connection,'Conversation ended.');});
const demos={
  equation:{kind:'equation',title:'A neuron',equation:'h=\\max\\left(0,\\sum_{i=1}^{n}w_i x_i+b\\right)',caption:'Weighted inputs, a bias, and a ReLU activation.'},
  plot:{kind:'plot',title:'ReLU activation',function:'relu',equation:'f(x)=\\max(0,x)'},
  chart:{kind:'chart',title:'Illustrative scores',series:[{label:'Score',points:[{x:1,y:.4},{x:2,y:.7},{x:3,y:.9}]}]},
  diagram:{kind:'diagram',title:'A learning loop',nodes:[{id:'data',label:'Examples'},{id:'model',label:'Model'},{id:'loss',label:'Error'},{id:'update',label:'Update weights'}],edges:[{from:'data',to:'model'},{from:'model',to:'loss'},{from:'loss',to:'update'}],highlight:['loss']},
  neural:{kind:'neural',title:'A small network',layers:[{label:'Inputs',nodes:[{id:'a',label:'Input',value:1},{id:'b',label:'Input',value:0}]},{label:'Hidden',activation:'relu',nodes:[{id:'h',label:'Hidden'}]},{label:'Output',nodes:[{id:'y',label:'Output'}]}],connections:[{from:'a',to:'h',weight:1},{from:'b',to:'h',weight:-.4},{from:'h',to:'y',weight:.8}]},
};
if (!performanceMode) fetch('/api/voice/status').then(response=>response.json()).then(data=>{
  if (!data.hasKey) {$('start').disabled=true;status('Voice is not configured on this server.');}
}).catch(()=>status('Local server unavailable.'));

// Explicit, local-only diagnostic mode: no microphone or OpenAI requests.
if (performanceMode) {
  $('start').disabled = true;
  $('settings-toggle').disabled = true;
  const panel = document.createElement('section');
  panel.className = 'performance-panel';
  const heading = document.createElement('h2'); heading.textContent = 'Voice visual performance check';
  const explanation = document.createElement('p');
  explanation.textContent = '20-second local test: halo, ribbon + plot, ribbon + animated network, then silence. Uses silent synthetic audio through the real audio analysers. No microphone, API key, or paid call.';
  const run = document.createElement('button'); run.textContent = 'Run performance check'; run.className = 'primary';
  const progress = document.createElement('p'); progress.setAttribute('role', 'status');
  const result = document.createElement('div'); result.className = 'performance-results';
  const note = document.createElement('small');
  note.textContent = 'Draw time measures JavaScript canvas submission, not GPU completion. Frame delays reflect this browser and other running work. This does not measure live WebRTC decoding, network latency, battery use, or a different phone.';
  panel.append(heading, explanation, run, progress, result, note);
  document.querySelector('main').prepend(panel);
  const testTitle=document.querySelector('h1'); if (testTitle) testTitle.textContent = 'Local animation test';
  status('Ready to test without a voice call.');
  run.onclick = async () => {
    run.disabled = true; result.replaceChildren();
    let sourceContext, timer, heartbeat = 0, current = null, previousHeartbeat = 0;
    const signals = [], results = [];
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const percentile = (values, p) => values.length ? [...values].sort((a,b) => a-b)[Math.min(values.length-1, Math.floor(values.length*p))] : 0;
    let cancelled = false;
    const cancel = () => {if (document.hidden) cancelled = true;};
    document.addEventListener('visibilitychange', cancel);
    try {
      sourceContext = new AudioContext(); await sourceContext.resume(); await orb.start();
      for (const frequency of [180, 260]) {
        const oscillator = sourceContext.createOscillator(), gain = sourceContext.createGain(), destination = sourceContext.createMediaStreamDestination();
        oscillator.frequency.value = frequency; gain.gain.value = 0;
        oscillator.connect(gain).connect(destination); oscillator.start();
        signals.push({oscillator, gain, stream: destination.stream});
      }
      orb.input(signals[0].stream); orb.output(signals[1].stream);
      recordFrame = sample => {
        if (current && performance.now() - current.start >= current.warmup) current.draws.push(sample.duration);
      };
      const heartbeatTick = now => {
        if (current && now - current.start >= current.warmup && previousHeartbeat) current.frames.push(now - previousHeartbeat);
        previousHeartbeat = now; heartbeat = requestAnimationFrame(heartbeatTick);
      };
      heartbeat = requestAnimationFrame(heartbeatTick);
      timer = setInterval(() => {
        const t = performance.now()/1000;
        signals.forEach((signal, i) => {
          const volume = current?.quiet ? 0 : .015 + .09 * Math.abs(Math.sin(t*(i?5.3:7.1))) ** 2;
          signal.gain.gain.setTargetAtTime(volume, sourceContext.currentTime, .025);
        });
      }, 40);
      for (const phase of [
        {name:'Halo', spec:{kind:'clear'}},
        {name:'Ribbon + plot', spec:demos.plot},
        {name:'Ribbon + animated network', spec:demos.neural, animate:true},
        {name:'Silence (settled)', spec:{kind:'clear'}, quiet:true},
      ]) {
        board.show(phase.spec); current = {start:performance.now(), draws:[], frames:[], quiet:phase.quiet, warmup:phase.quiet ? 3500 : 1000};
        progress.textContent = `Testing ${phase.name.toLowerCase()}… Keep this tab visible.`;
        let nextPulse = 0;
        while (performance.now()-current.start < 5000) {
          if (cancelled) throw Error('Test interrupted when the tab was hidden. Run again with the tab visible.');
          const elapsed = performance.now()-current.start;
          if (phase.animate && elapsed >= nextPulse) {network.apply({animate:true}); nextPulse += 2000;}
          await wait(50);
        }
        const measuredSeconds = (performance.now()-current.start-current.warmup)/1000;
        results.push({name:phase.name, draws:current.draws.length, fps:current.draws.length/measuredSeconds,
          p95:percentile(current.draws,.95), max:Math.max(0,...current.draws),
          slow:current.frames.filter(ms=>ms>50).length, frames:current.frames.length});
      }
      const table = document.createElement('table');
      const tr = document.createElement('tr');
      for (const label of ['Phase','Draws/s','Draw p95 (ms)','Slow frames >50 ms']) {const th=document.createElement('th');th.textContent=label;tr.append(th);}
      const head=document.createElement('thead');head.append(tr);table.append(head);
      const body=document.createElement('tbody');
      for (const row of results) {
        const tr=document.createElement('tr');
        for (const value of [row.name,row.fps.toFixed(3),row.p95.toFixed(3),`${row.slow} / ${row.frames}`]) {const td=document.createElement('td');td.textContent=value;tr.append(td);}
        body.append(tr);
      }
      table.append(body);result.append(table);
      progress.textContent = `Complete. Active drawing targets ${voiceFrameRate} updates/s. Settled silence should stop drawing.`;
      console.info('Grove animation benchmark', {userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,results});
    } catch (error) {progress.textContent=error.message;}
    finally {
      recordFrame=null;clearInterval(timer);cancelAnimationFrame(heartbeat);
      signals.forEach(s=>{s.oscillator.stop();s.stream.getTracks().forEach(t=>t.stop());});
      await sourceContext?.close();orb.stop();board.show({kind:'clear'});
      document.removeEventListener('visibilitychange',cancel);run.disabled=false;
    }
  };
}

function enableVisualZoom() {
  const viewport=$('visual-viewport');
  const stage=$('visual-stage');
  if (!viewport || !window.matchMedia('(max-width: 700px)').matches) return;
  let scale=1, x=0, y=0, lastDist=0, lastPoint=null;
  const pointers=new Map();
  function paint() {
    const width=stage.offsetWidth*scale, height=stage.offsetHeight*scale;
    const minX=Math.min(0, viewport.clientWidth-width), minY=Math.min(0, viewport.clientHeight-height);
    x=Math.min(0, Math.max(minX, x));
    y=Math.min(0, Math.max(minY, y));
    stage.style.transform=`translate(${x}px, ${y}px) scale(${scale})`;
  }
  function reset(){scale=1;x=0;y=0;stage.style.transform='';}
  new MutationObserver(reset).observe($('drawing'),{childList:true});
  new MutationObserver(reset).observe($('recap-card'),{childList:true});
  viewport.addEventListener('pointerdown', event=>{viewport.setPointerCapture?.(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});lastPoint={x:event.clientX,y:event.clientY};});
  viewport.addEventListener('pointermove', event=>{
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const points=[...pointers.values()];
    if (points.length>=2) {
      const dist=Math.hypot(points[0].x-points[1].x, points[0].y-points[1].y);
      const mid={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};
      if (lastDist) {
        const next=Math.min(4, Math.max(1, scale*dist/lastDist));
        const rect=viewport.getBoundingClientRect();
        x-=(mid.x-rect.left-x)*(next/scale-1);
        y-=(mid.y-rect.top-y)*(next/scale-1);
        scale=next;
      }
      lastDist=dist;
    } else if (lastPoint && (scale>1 || stage.offsetHeight>viewport.clientHeight+2)) {
      x+=event.clientX-lastPoint.x; y+=event.clientY-lastPoint.y; lastPoint={x:event.clientX,y:event.clientY};
    }
    paint();
  });
  const release=event=>{pointers.delete(event.pointerId);if(pointers.size<2)lastDist=0;if(!pointers.size)lastPoint=null;};
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);
}
enableVisualZoom();
function requestWrap() {
  if(!connection?.ready){status('Start a conversation before finishing.');return;}
  const text=mode==='plan'
    ? 'The learner is done planning. Call create_path now with the full path, including objectives and teaching notes for every concept.'
    : 'The learner is done. Call close_session now with honest notes for each concept you covered, plus any path edits that are not saved yet. understood needs evidence.';
  if(connection.engine==='live')send({type:'session.commentary.append',delegation_id:null,content:text});
  else {send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});send({type:'response.create'});}
}
$('wrap').onclick=requestWrap;
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent)return;
  if(event.data?.type==='grove-recap-request')requestWrap();
  if(event.data?.type==='grove-recap-error'){
    status(`Save needs correction: ${event.data.detail}`);
    const text=`The save failed validation: ${event.data.detail}. Correct it and call the tool again.`;
    if(connection?.engine==='live')send({type:'session.commentary.append',delegation_id:null,content:text});
    else if(connection?.ready){send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});send({type:'response.create'});}
  }
});
