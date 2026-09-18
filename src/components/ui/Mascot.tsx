import React from "react";

interface MascotProps {
  mood?: "happy" | "thinking" | "celebrating" | "reading";
  className?: string;
  size?: number;
}

export function WordNestMascot({
  mood = "happy",
  className = "",
  size = 120,
}: MascotProps) {
  return (
    <div
      className={`inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
      aria-label={`WordNest Mascot: Nesty (${mood})`}
    >
      <svg
        viewBox="0 0 160 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-md"
      >
        {/* Soft Retro Shadow */}
        <ellipse cx="80" cy="146" rx="55" ry="10" fill="#2E241E" fillOpacity="0.15" />

        {/* Toy Brick / Woven Wood Nest Base */}
        <g id="nest-base">
          {/* Bottom Nest block */}
          <path
            d="M32 118 C32 142, 128 142, 128 118 C128 114, 32 114, 32 118 Z"
            fill="#B45309"
            stroke="#1E1B18"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          {/* Textured Wood / Toy Brick Pegs */}
          <rect x="42" y="122" width="16" height="8" rx="3" fill="#D97706" stroke="#1E1B18" strokeWidth="2.5" />
          <rect x="66" y="125" width="18" height="8" rx="3" fill="#F59E0B" stroke="#1E1B18" strokeWidth="2.5" />
          <rect x="92" y="123" width="16" height="8" rx="3" fill="#D97706" stroke="#1E1B18" strokeWidth="2.5" />
          <rect x="114" y="121" width="12" height="7" rx="3" fill="#B45309" stroke="#1E1B18" strokeWidth="2" />
          {/* Leaves tucked in nest */}
          <path d="M26 122 C20 114, 25 106, 32 112 C34 116, 30 122, 26 122 Z" fill="#65A30D" stroke="#1E1B18" strokeWidth="2" />
          <path d="M134 122 C140 114, 135 106, 128 112 C126 116, 130 122, 134 122 Z" fill="#65A30D" stroke="#1E1B18" strokeWidth="2" />
        </g>

        {/* Bird Body */}
        <g id="bird-body">
          {/* Main Round Body */}
          <path
            d="M44 94 C40 60, 120 60, 116 94 C116 118, 44 118, 44 94 Z"
            fill="#E06B43"
            stroke="#1E1B18"
            strokeWidth="3.5"
          />
          {/* Cream Chest Belly */}
          <ellipse
            cx="80"
            cy="98"
            rx="24"
            ry="18"
            fill="#FEF3C7"
            stroke="#1E1B18"
            strokeWidth="2.5"
          />
          {/* Left Wing */}
          <path
            d={
              mood === "celebrating"
                ? "M44 82 C28 65, 30 52, 48 70 Z"
                : "M44 85 C32 92, 32 108, 46 104 Z"
            }
            fill="#C2410C"
            stroke="#1E1B18"
            strokeWidth="3"
          />
          {/* Right Wing */}
          <path
            d={
              mood === "celebrating"
                ? "M116 82 C132 65, 130 52, 112 70 Z"
                : "M116 85 C128 92, 128 108, 114 104 Z"
            }
            fill="#C2410C"
            stroke="#1E1B18"
            strokeWidth="3"
          />
        </g>

        {/* Head Crest / Feather Tuft */}
        <path
          d="M80 50 C74 38, 86 32, 80 48 Z"
          fill="#D97706"
          stroke="#1E1B18"
          strokeWidth="2.5"
        />
        <path
          d="M74 52 C68 42, 77 37, 75 50 Z"
          fill="#E06B43"
          stroke="#1E1B18"
          strokeWidth="2"
        />

        {/* Big Cartoon Eyes */}
        <g id="eyes">
          {/* Left Eye */}
          <circle cx="68" cy="74" r="11" fill="#FFFDF8" stroke="#1E1B18" strokeWidth="3" />
          {/* Right Eye */}
          <circle cx="92" cy="74" r="11" fill="#FFFDF8" stroke="#1E1B18" strokeWidth="3" />

          {/* Pupils */}
          {mood === "thinking" ? (
            <>
              <circle cx="71" cy="70" r="5" fill="#1E1B18" />
              <circle cx="73" cy="68" r="1.5" fill="#FFFFFF" />
              <circle cx="95" cy="70" r="5" fill="#1E1B18" />
              <circle cx="97" cy="68" r="1.5" fill="#FFFFFF" />
            </>
          ) : mood === "celebrating" ? (
            <>
              {/* Joyful closed eyes ^ ^ */}
              <path d="M62 75 Q68 70 74 75" stroke="#1E1B18" strokeWidth="3" strokeLinecap="round" fill="none" />
              <path d="M86 75 Q92 70 98 75" stroke="#1E1B18" strokeWidth="3" strokeLinecap="round" fill="none" />
            </>
          ) : (
            <>
              <circle cx="69" cy="75" r="5.5" fill="#1E1B18" />
              <circle cx="71" cy="72" r="1.8" fill="#FFFFFF" />
              <circle cx="93" cy="75" r="5.5" fill="#1E1B18" />
              <circle cx="95" cy="72" r="1.8" fill="#FFFFFF" />
            </>
          )}

          {/* Cheerful Blush */}
          <ellipse cx="57" cy="83" rx="4" ry="2.5" fill="#FB7185" fillOpacity="0.7" />
          <ellipse cx="103" cy="83" rx="4" ry="2.5" fill="#FB7185" fillOpacity="0.7" />
        </g>

        {/* Cute Yellow Beak */}
        <polygon
          points="75,80 85,80 80,89"
          fill="#F59E0B"
          stroke="#1E1B18"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Little Bookmark / Book in hands if reading */}
        {mood === "reading" && (
          <g id="mini-book">
            <rect x="68" y="96" width="24" height="15" rx="2" fill="#0D9488" stroke="#1E1B18" strokeWidth="2" />
            <line x1="80" y1="96" x2="80" y2="111" stroke="#FEF3C7" strokeWidth="1.5" />
          </g>
        )}
      </svg>
    </div>
  );
}
