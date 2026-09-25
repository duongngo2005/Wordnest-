"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";

interface MascotProps {
  mood?: "happy" | "thinking" | "celebrating" | "reading";
  className?: string;
  size?: number;
  ariaHidden?: boolean;
}

export function WordNestMascot({
  mood = "happy",
  className = "",
  size = 120,
  ariaHidden = false,
}: MascotProps) {
  const shouldReduceMotion = useReducedMotion();

  // Character body idle breathing / bounce
  const getBodyAnimation = () => {
    if (shouldReduceMotion) return undefined;
    switch (mood) {
      case "celebrating":
        return {
          y: [0, -3.5, 0],
          transition: { repeat: Infinity, duration: 1.8, ease: "easeInOut" as const },
        };
      case "thinking":
        return {
          rotate: [-1.5, 1.5, -1.5],
          transition: { repeat: Infinity, duration: 4.2, ease: "easeInOut" as const },
        };
      case "reading":
        return {
          y: [0, -1.5, 0],
          transition: { repeat: Infinity, duration: 3.6, ease: "easeInOut" as const },
        };
      case "happy":
      default:
        return {
          y: [0, -1, 0],
          transition: { repeat: Infinity, duration: 4, ease: "easeInOut" as const },
        };
    }
  };

  // Periodic eye blink (disabled when reduced motion or celebrating where eyes are already happy arcs)
  const getBlinkAnimation = () => {
    if (shouldReduceMotion || mood === "celebrating") return undefined;
    return {
      scaleY: [1, 1, 0.08, 1],
      transition: {
        repeat: Infinity,
        duration: 3.8,
        times: [0, 0.93, 0.96, 1],
        ease: "easeInOut" as const,
      },
    };
  };

  // Celebration wing flutter
  const getWingAnimation = (side: "left" | "right") => {
    if (shouldReduceMotion || mood !== "celebrating") return undefined;
    return {
      rotate: side === "left" ? [-8, 6, -8] : [8, -6, 8],
      transition: { repeat: Infinity, duration: 0.8, ease: "easeInOut" as const },
    };
  };

  const accessibleMoodLabel = {
    happy: "Nesty đang nghỉ ngơi vui vẻ",
    thinking: "Nesty đang tập trung suy nghĩ",
    celebrating: "Nesty vui mừng vì hoàn thành bài học",
    reading: "Nesty đang đọc thẻ từ vựng",
  }[mood];

  return (
    <div
      className={`inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
      {...(ariaHidden
        ? { "aria-hidden": "true" }
        : { "aria-label": `Linh vật WordNest: ${accessibleMoodLabel}` })}
    >
      <svg
        viewBox="0 0 160 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-md overflow-visible"
      >
        {/* Soft Retro Shadow */}
        <ellipse cx="80" cy="146" rx="55" ry="10" fill="#2E241E" fillOpacity="0.15" />

        {/* Toy Brick / Woven Wood Nest Base (Static nest anchor) */}
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

        {/* Animated Bird Character Group */}
        <motion.g
          id="bird-character"
          animate={getBodyAnimation()}
          style={{ transformOrigin: "80px 110px" }}
        >
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
            <motion.path
              d={
                mood === "celebrating"
                  ? "M44 82 C28 65, 30 52, 48 70 Z"
                  : "M44 85 C32 92, 32 108, 46 104 Z"
              }
              fill="#C2410C"
              stroke="#1E1B18"
              strokeWidth="3"
              animate={getWingAnimation("left")}
              style={{ transformOrigin: "44px 80px" }}
            />
            {/* Right Wing */}
            <motion.path
              d={
                mood === "celebrating"
                  ? "M116 82 C132 65, 130 52, 112 70 Z"
                  : "M116 85 C128 92, 128 108, 114 104 Z"
              }
              fill="#C2410C"
              stroke="#1E1B18"
              strokeWidth="3"
              animate={getWingAnimation("right")}
              style={{ transformOrigin: "116px 80px" }}
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

          {/* Big Cartoon Eyes with Micro Blink */}
          <motion.g
            id="eyes"
            animate={getBlinkAnimation()}
            style={{ transformOrigin: "80px 74px" }}
          >
            {/* Left Eye Sclera */}
            <circle cx="68" cy="74" r="11" fill="#FFFDF8" stroke="#1E1B18" strokeWidth="3" />
            {/* Right Eye Sclera */}
            <circle cx="92" cy="74" r="11" fill="#FFFDF8" stroke="#1E1B18" strokeWidth="3" />

            {/* Pupils & Expressions */}
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
          </motion.g>

          {/* Cute Yellow Beak */}
          <polygon
            points="75,80 85,80 80,89"
            fill="#F59E0B"
            stroke="#1E1B18"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Little Study Slip / Book in hands if reading */}
          {mood === "reading" && (
            <g id="mini-book">
              <rect x="68" y="96" width="24" height="15" rx="2" fill="#0D9488" stroke="#1E1B18" strokeWidth="2" />
              <line x1="80" y1="96" x2="80" y2="111" stroke="#FEF3C7" strokeWidth="1.5" />
            </g>
          )}
        </motion.g>
      </svg>
    </div>
  );
}
