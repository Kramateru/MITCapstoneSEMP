'use client';

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold leading-none transition-[transform,background-color,border-color,box-shadow,color] duration-200 ease-in-out hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:saturate-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none shadow-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive touch-manipulation",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-blue-500 to-teal-500 text-white shadow-[0_14px_28px_-18px_rgba(59,130,246,0.55)] hover:from-blue-600 hover:to-teal-600 hover:shadow-[0_18px_32px_-18px_rgba(59,130,246,0.62)]",
        success: "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-[0_14px_28px_-18px_rgba(34,197,94,0.45)] hover:from-green-600 hover:to-emerald-600 hover:shadow-[0_18px_32px_-18px_rgba(34,197,94,0.55)]",
        destructive:
          "bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500/20 dark:focus-visible:ring-red-500/40 dark:bg-red-500/60",
        outline:
          "border-2 border-blue-200 bg-white text-blue-700 hover:bg-blue-50 hover:border-blue-300 dark:border-blue-700 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800",
        secondary:
          "bg-gradient-to-r from-slate-100 to-slate-200 text-slate-700 hover:from-slate-200 hover:to-slate-300 dark:from-slate-700 dark:to-slate-600 dark:text-slate-200 dark:hover:from-slate-600 dark:hover:to-slate-500",
        ghost:
          "text-slate-600 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300",
        link: "text-blue-600 underline-offset-4 hover:underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300",
      },
      size: {
        default: "h-10 px-4 py-2.5 has-[>svg]:px-3",
        sm: "h-9 rounded-lg gap-1.5 px-3.5 has-[>svg]:px-3",
        lg: "h-11 rounded-xl px-6 has-[>svg]:px-4.5",
        icon: "size-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

