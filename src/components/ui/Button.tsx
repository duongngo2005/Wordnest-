"use client";

import React, { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { playUISound } from "@/lib/ui-sound";

export type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  disableSound?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "brick-button-primary",
  secondary: "brick-button-secondary",
  success: "brick-button-success",
  danger: "wn-button-danger",
  quiet: "wn-button-quiet",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "min-h-[36px] px-3 py-1.5 text-xs rounded-lg",
  md: "min-h-[44px] px-4 py-2 text-sm rounded-xl",
  lg: "min-h-[48px] px-5 py-2.5 text-base rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = "",
      variant = "secondary",
      size = "md",
      isLoading = false,
      loadingText,
      disableSound = false,
      leftIcon,
      rightIcon,
      onClick,
      disabled,
      type = "button",
      ...props
    },
    ref
  ) => {
    const isButtonDisabled = disabled || isLoading;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isButtonDisabled) {
        e.preventDefault();
        return;
      }

      if (!disableSound) {
        playUISound("softTap");
      }

      onClick?.(e);
    };

    const variantClass = variantStyles[variant];
    const sizeClass = sizeStyles[size];

    return (
      <button
        ref={ref}
        type={type}
        disabled={isButtonDisabled}
        aria-busy={isLoading}
        onClick={handleClick}
        className={`wn-tactile-btn select-none font-black tracking-tight inline-flex items-center justify-center gap-2 transition-[background-color,transform,box-shadow,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E06B43] focus-visible:ring-offset-2 ${variantClass} ${sizeClass} ${
          isButtonDisabled ? "cursor-not-allowed opacity-60 pointer-events-none" : ""
        } ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            <span>{loadingText ?? children}</span>
          </>
        ) : (
          <>
            {leftIcon ? <span className="shrink-0" aria-hidden="true">{leftIcon}</span> : null}
            <span>{children}</span>
            {rightIcon ? <span className="shrink-0" aria-hidden="true">{rightIcon}</span> : null}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
