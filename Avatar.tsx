import { useId } from "react";
import type { Outfit } from "../shared/catalog";
export function Avatar({
  outfit: o,
  className = "",
  pose = false,
}: {
  outfit: Outfit;
  className?: string;
  pose?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const skin = o.skin;
  const main = o.fabric === "matte" ? o.primary : `url(#${id}fabric)`;
  const anime = o.style === "anime";
  return (
    <svg
      viewBox="0 0 300 540"
      className={`avatar ${className} ${pose ? "pose" : ""}`}
      role="img"
      aria-label={`${o.style} avatar wearing ${o.dress === "none" ? o.top + " and " + o.bottom : o.dress}, ${o.shoes} and ${o.accessory}`}
    >
      <defs>
        <linearGradient id={`${id}fabric`} x1="0" x2="1">
          <stop stopColor={o.primary} />
          <stop
            offset=".38"
            stopColor={o.fabric === "chrome" ? "#f9f6ff" : o.primary}
          />
          <stop offset=".58" stopColor={o.primary} />
          <stop offset="1" stopColor={o.secondary} />
        </linearGradient>
        <linearGradient id={`${id}hair`}>
          <stop stopColor={o.hairColor} />
          <stop offset=".55" stopColor={o.hairColor} />
          <stop offset="1" stopColor="#131322" />
        </linearGradient>
        <pattern
          id={`${id}pattern`}
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
        >
          {o.pattern === "circuit" ? (
            <path
              d="M0 6h12v12h12M8 0v6m9 12v6"
              fill="none"
              stroke={o.secondary}
              strokeWidth="1.6"
            />
          ) : o.pattern === "stars" ? (
            <path d="m12 4 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill={o.secondary} />
          ) : null}
        </pattern>
      </defs>
      <ellipse
        cx="150"
        cy="513"
        rx="66"
        ry="12"
        fill={o.secondary}
        opacity=".15"
      />
      {o.accessory === "wings" && (
        <g
          fill={o.secondary}
          fillOpacity=".16"
          stroke={o.secondary}
          strokeWidth="2"
        >
          <path d="M122 215Q35 110 22 155L83 298l48-40Z" />
          <path d="M178 215q87-105 100-60l-61 143-48-40Z" />
          <path d="m30 162 93 79m147-79-93 79" />
        </g>
      )}
      {o.hair === "long" && (
        <path
          d="M104 83q-16 50-14 174l41 28 63-20q17-139-3-174Z"
          fill={`url(#${id}hair)`}
          stroke="#181624"
          strokeWidth="2"
        />
      )}
      {o.hair === "ponytail" && (
        <path
          d="M181 84q65-31 45 54-10 53 2 111-53-29-37-110Z"
          fill={`url(#${id}hair)`}
        />
      )}
      <g stroke="#271d30" strokeWidth="1.2" strokeLinejoin="round">
        <path d="m125 298-5 91-5 91 22 3 18-102 5-76Z" fill={skin} />
        <path d="m158 302 5 83 12 97 21-3-5-101-10-82Z" fill={skin} />
        <path
          d="M114 173q-14 1-19 25l-19 95-9 38q1 18 8 17l12-26 18-58 24-68Z"
          fill={skin}
        />
        <path
          d="M185 173q13 1 19 25l19 95 9 38q-1 18-8 17l-12-26-18-58-24-68Z"
          fill={skin}
        />
        <path
          d="M134 141v21l-22 14 17 53-11 73q27 23 66 0l-13-73 18-53-24-14v-21Z"
          fill={skin}
        />
        <path
          d={
            anime
              ? "M111 103q0-47 39-47t39 47l-7 29-25 23h-14l-25-23Z"
              : "M116 101q0-42 34-42t34 42l-5 29-20 24h-18l-20-24Z"
          }
          fill={skin}
        />
      </g>
      <path
        d="M109 107q-13-52 40-56 49 0 44 54l-17-21-18 13 4-24-19 24-9-17-21 29Z"
        fill={`url(#${id}hair)`}
        stroke="#201b30"
        strokeWidth="2"
      />
      {o.hair === "bob" && (
        <g fill={o.hairColor}>
          <path d="m111 82-9 69 22 5-5-55Z" />
          <path d="m187 82 11 68-22 8 6-58Z" />
        </g>
      )}
      <g>
        <path
          d="M121 112q9-8 19 0M160 112q10-8 19 0"
          fill="none"
          stroke="#26233c"
          strokeWidth="2.5"
        />
        {anime ? (
          <>
            <ellipse cx="132" cy="115" rx="5" ry="7" fill="#fff" />
            <ellipse cx="168" cy="115" rx="5" ry="7" fill="#fff" />
            <ellipse cx="133" cy="116" rx="3" ry="5" fill={o.secondary} />
            <ellipse cx="167" cy="116" rx="3" ry="5" fill={o.secondary} />
            <circle cx="134" cy="114" r="1.4" fill="white" />
            <circle cx="168" cy="114" r="1.4" fill="white" />
          </>
        ) : (
          <>
            <path
              d="m122 115 15 1m26 0 14-1"
              stroke="#32273d"
              strokeWidth="2"
            />
            <circle cx="131" cy="115" r="2" />
            <circle cx="169" cy="115" r="2" />
          </>
        )}
        <path
          d="m150 118-3 10h5m-10 9q8 5 16 0"
          fill="none"
          stroke="#995b67"
          strokeWidth="1.5"
        />
        <ellipse cx="123" cy="128" rx="7" ry="3" fill="#dc7f94" opacity=".3" />
        <ellipse cx="178" cy="128" rx="7" ry="3" fill="#dc7f94" opacity=".3" />
      </g>
      {o.dress === "none" ? (
        <>
          {o.bottom === "trousers" ? (
            <g fill={main} stroke="#272437" strokeWidth="2">
              <path d="m120 280-8 104-5 90 33 2 15-112 8 112 35-3-12-107-4-86Z" />
              <path
                d="m151 310 4 54m-30-60-8 154m59-154 12 154"
                stroke={o.secondary}
                strokeWidth="2"
              />
            </g>
          ) : o.bottom === "skirt" ? (
            <>
              <path
                d="m120 279-23 77q52 21 107-1l-23-76Z"
                fill={main}
                stroke="#272437"
                strokeWidth="2"
              />
              <path
                d="m125 291-12 60m28-60-3 66m19-66 7 65m7-63 18 58"
                stroke={o.secondary}
                opacity=".6"
              />
            </>
          ) : (
            <path
              d="m120 279-9 58 33 8 9-29 10 29 33-8-13-58Z"
              fill={main}
              stroke="#272437"
              strokeWidth="2"
            />
          )}
          {o.top === "jacket" ? (
            <g fill={main} stroke="#272437" strokeWidth="2">
              <path d="m130 164-22 11-17 58 22 9 14-35-7 79 24 6 7-94 9 94 24-6-9-79 14 35 23-9-18-58-24-11-19 30Z" />
              <path
                d="m130 164-8 34 23 17m25-51 10 34-22 17"
                fill="none"
                stroke={o.secondary}
                strokeWidth="3"
              />
            </g>
          ) : o.top === "corset" ? (
            <path
              d="m125 189q11 15 26 2 16 13 27-2l-8 47 14 50q-33 20-64 0l12-50Z"
              fill={main}
              stroke={o.secondary}
              strokeWidth="2"
            />
          ) : (
            <g fill={main} stroke={o.secondary} strokeWidth="2">
              <path d="m112 171-17 28 32 10 24-13 25 13 32-10-19-28-20 12-18-12-17 12Z" />
              <path d="m127 208 24-10 25 10-6 35 13 44-32 10-31-10 12-44Z" />
            </g>
          )}
        </>
      ) : (
        <>
          <path
            d={
              o.dress === "gown"
                ? "M125 184q13 14 26 0 13 14 27 0l-8 53q5 49 25 117l40 136q-88 31-170 0l44-136q20-67 23-117Z"
                : "M125 184q13 14 26 0 13 14 27 0l-8 53 31 107q-50 20-101 0l32-107Z"
            }
            fill={main}
            stroke="#272437"
            strokeWidth="2"
          />
          <path
            d="m151 195-4 41-28 101m51-100 18 101"
            fill="none"
            stroke={o.secondary}
            strokeWidth="2"
            opacity=".7"
          />
        </>
      )}
      <path
        d={
          o.dress === "gown"
            ? "M125 190h53l-8 47 64 251q-86 31-167 0l65-251Z"
            : o.dress === "mini"
              ? "M125 190h53l-8 47 31 107q-50 20-101 0l32-107Z"
              : "m127 210 48 0-5 35 13 40-63 0 12-40Z"
        }
        fill={`url(#${id}pattern)`}
        opacity=".5"
      />
      <path d="m121 278 61 0v9h-61Z" fill={o.secondary} />
      <rect x="144" y="276" width="14" height="13" rx="2" fill="#f6e1a3" />
      <g
        fill={o.shoes === "sneakers" ? "#e9ebf6" : main}
        stroke="#282335"
        strokeWidth="2"
      >
        {o.shoes === "boots" ? (
          <>
            <path d="m112 427 30 2-5 56-2 16-37 0 0-12 13-14Z" />
            <path d="m168 429 28-2 4 48 14 14v12h-37l-3-17Z" />
            <path
              d="m113 438 26 1m32 0 24-1m-87 52h24m49 0h25"
              stroke={o.secondary}
              strokeWidth="3"
            />
          </>
        ) : o.shoes === "heels" ? (
          <>
            <path d="m114 473 22 4-4 14v9h-35v-7Z" />
            <path d="m175 477 21-4 18 20v7h-35v-9Z" />
            <path d="m131 497v10m49-10v10" />
          </>
        ) : (
          <>
            <path d="m113 475 24 4-1 20q-22 10-40 0l-1-10Z" />
            <path d="m174 479 23-4 19 14-1 10q-16 10-40 0Z" />
            <path
              d="m111 484 17 4m52 0 17-4"
              stroke={o.secondary}
              strokeWidth="3"
            />
          </>
        )}
      </g>
      {o.accessory === "halo" && (
        <g fill="none" stroke={o.secondary}>
          <ellipse cx="150" cy="40" rx="51" ry="13" strokeWidth="3" />
          <ellipse cx="150" cy="40" rx="60" ry="18" opacity=".3" />
        </g>
      )}
      {o.accessory === "visor" && (
        <>
          <path
            d="m111 107 77-1-3 18-69 2Z"
            fill={o.secondary}
            fillOpacity=".65"
            stroke={o.secondary}
            strokeWidth="2"
          />
          <path d="m122 109 17 13m1-14 17 13" stroke="white" opacity=".7" />
        </>
      )}
      {o.accessory === "headphones" && (
        <g fill={o.primary} stroke={o.secondary} strokeWidth="3">
          <path d="M105 110V84q45-47 90 0v26" fill="none" />
          <rect x="101" y="100" width="13" height="28" rx="5" />
          <rect x="187" y="100" width="13" height="28" rx="5" />
        </g>
      )}
      <g fill={o.secondary}>
        <circle cx="120" cy="140" r="3" />
        <circle cx="180" cy="140" r="3" />
      </g>
    </svg>
  );
}
