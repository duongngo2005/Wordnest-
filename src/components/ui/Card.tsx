"use client";

import React, { forwardRef } from "react";

export type CardVariant = "surface" | "tile" | "index" | "primary";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  interactive?: boolean;
}

const variantClasses: Record<CardVariant, string> = {
  surface: "wn-surface bg-[#FFFDF9]",
  tile: "wn-tile bg-[#FFFDF9]",
  index: "wn-index-card bg-[#FFFDF9]",
  primary: "wn-primary-surface",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = "", variant = "surface", interactive = false, ...props }, ref) => {
    const baseClass = variantClasses[variant];
    const interactiveClass = interactive ? "wn-card-interactive cursor-pointer" : "";

    return (
      <div
        ref={ref}
        className={`${baseClass} ${interactiveClass} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
