// The first fourteen routes follow the kiosk's backplane traces.
const PULSE_ROUTES = [
  ["M0 136H9L26 119H86L107 98H214L239 73H337L363 47H570", 4.7],
  ["M0 146H15L32 129H92L112 109H219L244 84H344L370 58H542", 5.5],
  ["M1024 108H1007L983 84H868L839 55H698L677 34H613", 4.1],
  ["M1024 118H1000L978 96H863L834 67H693L673 46H650", 5.3],
  ["M440 100V211L437 214V367L441 371V538L435 544V710L408 737H285", 5.8],
  ["M445 121V214L442 217V365L446 369V541L440 547V715L414 741H371", 4.9],
  ["M1019 174H958L953 179H786L773 170H634L628 177H462", 3.6],
  ["M1009 181H963L958 186H779L766 175H638L632 183H492", 4.5],
  ["M724 195V295L721 300V512L726 517V713L748 735H906L928 713H1024", 5.4],
  ["M728 204V298L725 303V510L730 515V709L752 731H901L924 708H1024", 6.1],
  ["M0 711H10L35 736H149L162 723H255L277 745H471", 4.3],
  ["M0 701H15L42 728H144L157 715H259L283 741H364", 3.8],
  ["M516 756L544 728H636L658 750H710", 2.6],
  ["M1024 550H1015L1009 544V394L1014 389V284L1024 274", 3.4],
  ["M0 136H9L26 119H86L107 98H214L239 73H337L363 47H570", 3.9],
] as const;

export function KioskBackplane() {
  return (
    <div className="kiosk-backplane" aria-hidden="true">
      <svg className="kiosk-circuit-motion" width="1024" height="768" viewBox="0 0 1024 768">
        <defs>
          <radialGradient id="kiosk-pulse-amber">
            <stop offset="0" stopColor="#ffc477" />
            <stop offset=".24" stopColor="#ffc071" />
            <stop offset="1" stopColor="#ff9e44" stopOpacity="0" />
          </radialGradient>
        </defs>
        {PULSE_ROUTES.map(([path, duration], i) => {
          const begin = `${-(i * 0.73) % duration}s`;
          return (
            <circle key={i} r={i % 3 === 0 ? 7 : 5.5} fill="url(#kiosk-pulse-amber)">
              <animateMotion path={path} dur={`${duration}s`} begin={begin} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.72;0.72;0" keyTimes="0;0.07;0.93;1" dur={`${duration}s`} begin={begin} repeatCount="indefinite" />
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
