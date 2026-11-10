export const defaultVoice = 'cedar';

export const realtimeVoices = Object.freeze([
  'alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'marin', 'sage', 'shimmer', 'verse',
]);

export const liveVoices = Object.freeze([...realtimeVoices,
  'beacon', 'bossa', 'brise', 'cinder', 'delta', 'flitz', 'gleam', 'harema', 'juni',
  'meridian', 'nira', 'noeul', 'nuri', 'quartz', 'ripple', 'shida', 'sillage',
  'stone', 'tempo', 'vesper', 'willow',
].sort());
