const number = {type: 'number'};
const text = {type: 'string'};
export const visualTools = [
  {
    type: 'function', name: 'show_visual',
    description: 'Open or replace the whiteboard while continuing the spoken lesson. Use text for a short supplementary note in caption, equation for LaTeX, plot for a mathematical function or x/y point series, chart for bar series, diagram for connected labeled nodes, neural for the interactive neural network, clear to return to the voice orb. Repeat with a revised specification to update a visual. Points must be accurate. Function plots are calculated by the app.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        kind: {type: 'string', enum: ['text','equation','plot','chart','diagram','neural','clear']},
        title: text, caption: text, equation: {...text, description: 'Optional LaTeX equation displayed below any visual, or as the main visual.'},
        function: {type: 'string', enum: ['relu','sigmoid','linear','quadratic','sin']},
        a: {...number, description: 'Function scale, default 1'}, b: {...number, description: 'Vertical offset, default 0'},
        xMin: number, xMax: number,
        series: {type: 'array', items: {type: 'object', properties: {label: text, points: {type:'array',items:{type:'object',properties:{x:number,y:number},required:['x','y'],additionalProperties:false}}},required:['label','points'],additionalProperties:false}},
        nodes: {type:'array',items:{type:'object',properties:{id:text,label:text},required:['id','label'],additionalProperties:false}},
        edges: {type:'array',items:{type:'object',properties:{from:text,to:text,label:text},required:['from','to'],additionalProperties:false}},
        highlight: {type:'array',items:text,description:'Node IDs to emphasize'},
      }, required:['kind'],
    },
  },
  {
    type:'function',name:'update_visual',description:'Change the neural diagram already on screen. Set the slider, highlight node ids, or animate the arrows.',
    parameters:{type:'object',properties:{slider:number,highlight:{type:'array',items:text},animate:{type:'boolean'}},additionalProperties:false},
  },
];
export const teachingInstructions = `You are Grove, a friendly voice tutor. Follow the saved lesson context. The screen begins with only a voice orb. Keep conversation natural and responsive, vary sentence length, and ask one question at a time only when it helps. Avoid canned praise. Speak your explanation; equations and diagrams supplement the conversation. Bring up visuals when useful or requested by delegating to the visual tools. Do not force a visual every turn. Explain what changes as it changes. Clear the board when requested. Tools support LaTeX equations, calculated plots (ReLU, sigmoid, linear, quadratic, sin), arbitrary numeric series, bar charts, labeled directed graphs, and a small interactive neural network. Backend results are the source of truth for displayed values. Never invent visual capabilities. A neural visual is whatever layers, labels, weights, and optional slider the tutor supplies. There is no stock network. Continue until the learner chooses to finish. Use propose_recap to submit the structured recap; never read JSON aloud. For visual changes, delegate the request to the backend when using GPT-Live; then explain the result conversationally.`;
