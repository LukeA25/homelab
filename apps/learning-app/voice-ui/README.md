# Integrated voice UI

Served by FastAPI at `/voice/?session=<pending session ID>` and embedded in the lesson dialog. Start lessons from Learning Grove. The standalone demo server and design preview pages have been removed.

`orb.js` contains the approved audio-reactive contour halo and compact ribbon. `board.js`, `visuals.mjs`, and `network.js` render optional tutor visuals. Production uses real microphone and remote audio levels. `#performance` enables an offline synthetic-audio diagnostic without an API call.

`config.json` is generated from `tools.mjs` and `voices.mjs`. After editing those modules, regenerate from this directory:

```sh
node --input-type=module -e "import {visualTools,teachingInstructions} from './tools.mjs'; import {defaultVoice,realtimeVoices,liveVoices} from './voices.mjs'; import fs from 'fs'; fs.writeFileSync('config.json',JSON.stringify({visualTools,teachingInstructions,defaultVoice,realtimeVoices,liveVoices},null,2));"
```

Run `node --test *.test.mjs` for animation, audio lifecycle, math and visual validation checks. Vendor KaTeX retains its MIT license.
