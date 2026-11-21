// Line artwork shares the phosphor and amber inks of the TV instruments.
export function NovaWeatherIcon({ state }: { state: string }) {
  const condition = state.toLowerCase().replace(/[ _-]/g, "");
  const partial = condition.includes("partly");
  const sun = partial || ["sunny", "clear"].includes(condition);
  const moon = condition === "clearnight";
  const wind = condition.startsWith("wind");
  const fog = /fog|mist|haze/.test(condition);
  const storm = /lightning|thunder/.test(condition);
  const rain = /rain|pour|shower|drizzle/.test(condition);
  const snow = /snow|sleet/.test(condition);
  const hail = condition === "hail";
  const cloud = partial || condition.includes("cloud") || storm || rain || snow || hail || fog || condition === "windyvariant";
  return <svg className="weather-symbol" viewBox="0 0 84 72" fill="none" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {sun && <g stroke="#ffc172" transform={partial?"translate(55 24)":"translate(42 36)"}>
      <circle r="13"/>{Array.from({length:8},(_,i)=><path key={i} d="M0 -20v-6" transform={`rotate(${45*i})`}/>)}
    </g>}
    {moon && <path stroke="#ffcb82" d="M54 10a25 25 0 1 0 16 39A30 30 0 0 1 54 10Z"/>}
    {cloud && <path fill="#192b21" stroke="#a0f1ad" d="M16 49a10 10 0 0 1-1-20 17 17 0 0 1 32-4 13 13 0 1 1 5 24Z"/>}
    {rain && <path stroke="#9cddcd" d={condition==="pouring"?"M22 53l-6 11m19-11-6 11m19-11-6 11m19-11-6 11":"M26 54l-4 8m20-8-4 8"}/>}
    {snow && <g stroke="#baf7cd">{[21,50].map(x=><path key={x} transform={`translate(${x} 61)`} d="M0-5v10m-4-8 8 6m-8 0 8-6"/>)}</g>}
    {hail && <g fill="#b3f2c3"><circle cx="23" cy="59" r="3"/><circle cx="38" cy="64" r="3"/><circle cx="52" cy="57" r="3"/></g>}
    {storm && <path fill="#ffc172" d="m45 40-12 17h8l-5 12 19-23h-12z"/>}
    {fog && <path stroke="#91b69e" d="M8 56h48m-36 7h44"/>}
    {wind && <path stroke="#a0f1ad" transform={cloud?"translate(0 19)":undefined} d="M10 32h43q12 0 9-10m-43 18h49q9 0 7 7"/>}
    {!sun&&!moon&&!cloud&&!wind && <g stroke="#e1bb78"><path d="m42 12 27 46H15Z"/><path d="M42 29v13m0 6v1"/></g>}
  </svg>;
}
