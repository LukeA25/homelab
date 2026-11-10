import {defaultVoice, realtimeVoices, liveVoices} from './voices.mjs';
import {createOrb, voiceFrameRate} from './orb.js';
import {createNetwork} from './network.js';
import {createBoard} from './board.js';
const lessonId = new URLSearchParams(location.search).get('session');
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
function status(text) { $('status').textContent=text; }
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
function execute(call) {
  try {
    const args=JSON.parse(call.arguments);
    if (call.name==='propose_recap') {
      if (args.session_id !== lessonId) throw Error('Recap session does not match this lesson');
      window.parent.postMessage({type:'grove-recap',recap:args},location.origin);
      return {status:'proposed',message:'Awaiting learner review and explicit save'};
    }
    if (call.name==='show_visual') return board.show(args);
    if (call.name==='update_visual') {
      const result=network.apply(args);
      board.show({kind:'neural',title:'Inside a neural network'});
      return result;
    }
    throw Error('Unknown visual tool');
  } catch (error) { return {error:error.message}; }
}
function ready(call) {
  if (connection!==call || call.ready || call.closing) return;
  call.ready=true;
  clearTimeout(call.connectTimer);
  $('mute').disabled=false;
  status('Connected. Starting your lesson.');
  call.deadline=Date.now()+900000;
  call.timer=setInterval(()=>{
    const remaining=Math.max(0,Math.ceil((call.deadline-Date.now())/1000));
    $('timer').textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
    if (!remaining) { clearInterval(call.timer); requestRecap(); call.recapTimer=setTimeout(()=>end('Lesson time finished.'),60000); }
  },500);
  shareContext();
  if (call.engine==='live') {
    send({type:'session.commentary.append',delegation_id:null,content:'Begin the selected learning session from its saved context. Ask one question at a time.'});
  } else send({type:'response.create'});
}
function onEvent(call, envelope) {
  if (connection!==call) return;
  if (envelope.type==='session.closed') {cleanup(call,'Conversation ended.');return;}
  if (envelope.type==='error') {status(envelope.error?.message || 'Voice service error');return;}
  if (call.closing) return;
  if (envelope.type==='session.started') ready(call);
  if (envelope.type==='session.output_transcript.delta') $('transcript').textContent=($('transcript').textContent+(envelope.delta || '')).slice(-6000);
  if (envelope.type==='response.output_audio_transcript.done') $('transcript').textContent=envelope.transcript;
  if (envelope.type==='input_audio_buffer.speech_started') status('Listening…');
  if (envelope.type==='output_audio_buffer.started') status('Tutor speaking · interrupt anytime');
  if (envelope.type==='output_audio_buffer.stopped') status('Ask a question, or ask me to show you.');
  if (envelope.type==='response.event') {
    const event=envelope.event;
    if (event.type==='response.output_item.done' && event.item?.type==='function_call') {
      if (call.handled.has(event.item.call_id)) return;
      call.handled.add(event.item.call_id);
      send({type:'response.item.create',item:{type:'function_call_output',call_id:event.item.call_id,output:JSON.stringify(execute(event.item))}});
      send({type:'response.create'});
    }
    if (event.type==='response.failed') status('Visual request failed. Try asking again.');
  }
  if (call.engine!=='live' && envelope.type==='response.done') {
    const calls=envelope.response?.output?.filter(item=>item.type==='function_call') || [];
    for (const item of calls) {
      if (call.handled.has(item.call_id)) continue;
      call.handled.add(item.call_id);
      send({type:'conversation.item.create',item:{type:'function_call_output',call_id:item.call_id,output:JSON.stringify(execute(item))}});
    }
    if (calls.length) send({type:'response.create'});
    if (envelope.response?.status==='failed') status(envelope.response.status_details?.error?.message || 'Response failed. Try again.');
  }
}
function cleanup(call, message) {
  if (connection!==call) return;
  connection=null;
  clearInterval(call.timer);clearTimeout(call.recapTimer);clearTimeout(call.closeTimer);clearTimeout(call.connectTimer);
  call.abort.abort();call.stream?.getTracks().forEach(track=>track.stop());
  call.channel?.close();call.peer?.close();orb.stop();
  $('audio').pause();$('audio').srcObject=null;
  $('start').disabled=false;$('stop').disabled=true;$('mute').disabled=true;
  $('mute').textContent='Mute mic';$('engine').disabled=false;voicePicker.disabled=false;
  status(message);
}
function end(message='Conversation ended.') {
  const call=connection;
  if (!call || call.closing) return;
  call.closing=true;clearInterval(call.timer);$('stop').disabled=true;$('mute').disabled=true;
  // Stop capture immediately, while allowing Live to acknowledge session closure.
  call.stream?.getTracks().forEach(track=>track.stop());
  $('audio').pause();
  if (call.engine==='live' && call.ready && call.channel.readyState==='open') {
    status('Closing conversation…');send({type:'session.close'});
    call.closeTimer=setTimeout(()=>cleanup(call,`${message} Session close was not confirmed by OpenAI.`),15000);
  } else cleanup(call,message);
}
$('start').onclick=async()=>{
  if (connection) return;
  const call={engine:$('engine').value,ready:false,closing:false,abort:new AbortController(),handled:new Set()};
  connection=call;
  $('start').disabled=true;$('stop').disabled=false;$('engine').disabled=true;voicePicker.disabled=true;
  $('transcript').textContent='';$('timer').textContent='15:00';
  status('Connecting microphone…');
  try {
    if(!lessonId)throw Error('Open a lesson from Learning Grove first.');
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone access requires HTTPS or localhost.');
    await orb.start();
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    if (connection!==call) {stream.getTracks().forEach(track=>track.stop());return;}
    call.stream=stream;orb.input(stream);
    const peer=new RTCPeerConnection();call.peer=peer;
    peer.ontrack=event=>{
      if (connection!==call) return;
      const remote=new MediaStream([event.track]);$('audio').srcObject=remote;orb.output(remote);
      $('audio').play().catch(()=>status('Open Settings and select Resume audio to hear the tutor.'));
    };
    peer.onconnectionstatechange=()=>{
      if (['failed','disconnected'].includes(peer.connectionState)) cleanup(call,'Connection lost. Start again to reconnect.');
    };
    stream.getTracks().forEach(track=>peer.addTrack(track,stream));
    const channel=peer.createDataChannel('oai-events');call.channel=channel;
    channel.onmessage=event=>{try{onEvent(call,JSON.parse(event.data));}catch(error){status(`Event error: ${error.message}`);}};
    channel.onopen=()=>{if (call.engine!=='live') ready(call);};
    channel.onclose=()=>cleanup(call,call.engine==='live'?'Connection closed. Final session usage unconfirmed.':'Connection closed.');
    const offer=await peer.createOffer();await peer.setLocalDescription(offer);
    const key=$('key').value;$('key').value='';status('Connecting to OpenAI…');
    const response=await fetch(`/api/voice/sessions/${encodeURIComponent(lessonId || '')}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sdp:offer.sdp,key,voice:voicePicker.value,engine:call.engine}),signal:call.abort.signal});
    if (!response.ok) {const body=await response.json();throw Error(body.detail || body.error || 'Connection failed');}
    const answer=call.engine==='live'?(await response.json()).transport?.sdp:await response.text();
    if (connection!==call) return;
    if (!answer) throw Error('OpenAI returned no SDP answer');
    call.connectTimer=setTimeout(()=>cleanup(call,'Connection timed out. Check network access and retry.'),20000);
    await peer.setRemoteDescription({type:'answer',sdp:answer});
  } catch(error) {
    cleanup(call,error.name==='NotAllowedError'?'Allow microphone access in your browser and try again.':error.message);
  }
};
$('stop').onclick=()=>end();
$('mute').onclick=()=>{
  const track=connection?.stream?.getAudioTracks()[0];
  if (track) {track.enabled=!track.enabled;$('mute').textContent=track.enabled?'Mute mic':'Unmute mic';}
};
$('clear').onclick=()=>{board.show({kind:'clear'});shareContext();};
$('settings-toggle').onclick=()=>{$('settings').hidden=!$('settings').hidden;$('settings-toggle').setAttribute('aria-expanded',String(!$('settings').hidden));};
$('resume').onclick=()=>$('audio').play().catch(()=>status('Start a conversation first.'));
window.addEventListener('message', event => {if(event.origin===location.origin && event.source===window.parent && event.data?.type==='grove-end') end();});
window.addEventListener('pagehide',()=>{if(connection?.engine==='live')send({type:'session.close'});if(connection)cleanup(connection,'Conversation ended.');});
const demos={
  equation:{kind:'equation',title:'A neuron',equation:'h=\\max\\left(0,\\sum_{i=1}^{n}w_i x_i+b\\right)',caption:'Weighted inputs, a bias, and a ReLU activation.'},
  plot:{kind:'plot',title:'ReLU activation',function:'relu',equation:'f(x)=\\max(0,x)'},
  chart:{kind:'chart',title:'Illustrative scores',series:[{label:'Score',points:[{x:1,y:.4},{x:2,y:.7},{x:3,y:.9}]}]},
  diagram:{kind:'diagram',title:'A learning loop',nodes:[{id:'data',label:'Examples'},{id:'model',label:'Model'},{id:'loss',label:'Error'},{id:'update',label:'Update weights'}],edges:[{from:'data',to:'model'},{from:'model',to:'loss'},{from:'loss',to:'update'}],highlight:['loss']},
  neural:{kind:'neural',title:'Inside a neural network'},
};
for(const button of document.querySelectorAll('[data-demo]')) button.onclick=()=>{board.show(demos[button.dataset.demo]);shareContext();};
if (!performanceMode) fetch('/api/voice/status').then(response=>response.json()).then(data=>{
  $('keybox').hidden=data.hasKey;
  if (!data.hasKey) {$('settings').hidden=false;$('settings-toggle').setAttribute('aria-expanded','true');}
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
  document.querySelector('h1').textContent = 'Local animation test';
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

function requestRecap() {
  if(!connection?.ready){status('Start a conversation before requesting a recap.');return;}
  const text='Finish this lesson now and call propose_recap with honest notes, evidence, confidence and state for the saved session. Do not claim it is saved.';
  if(connection.engine==='live')send({type:'session.commentary.append',delegation_id:null,content:text});
  else {send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});send({type:'response.create'});}
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent)return;
  if(event.data?.type==='grove-recap-request')requestRecap();
  if(event.data?.type==='grove-recap-error'){
    status(`Recap needs correction: ${event.data.detail}`);
    const text=`The recap failed validation: ${event.data.detail}. Correct it and call propose_recap again.`;
    if(connection?.engine==='live')send({type:'session.commentary.append',delegation_id:null,content:text});
    else if(connection?.ready){send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});send({type:'response.create'});}
  }
});
