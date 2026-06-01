'use client';

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex min-w-0 max-w-full items-center justify-center gap-2 whitespace-normal break-words text-center sm:whitespace-nowrap rounded-xl text-sm font-semibold leading-5 tracking-normal transition-[transform,background-color,border-color,box-shadow,color] duration-200 ease-in-out hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:saturate-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none shadow-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:ring-offset-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive touch-manipulation",
  {
    variants: {
      variant: {
        default: "border border-primary bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_94%,white_6%),var(--primary))] text-white shadow-[0_18px_34px_-22px_rgba(29,86,216,0.5)] hover:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_88%,white_12%),color-mix(in_srgb,var(--primary)_96%,#153a91_4%))] hover:shadow-[0_22px_40px_-22px_rgba(29,86,216,0.58)]",
        success: "border border-emerald-600 bg-[linear-gradient(180deg,#14a87a,#0f8f68)] text-white shadow-[0_16px_32px_-22px_rgba(5,150,105,0.46)] hover:bg-[linear-gradient(180deg,#119c72,#0d7f5d)] hover:shadow-[0_18px_36px_-22px_rgba(5,150,105,0.54)]",
        destructive:
          "border border-red-500 bg-[linear-gradient(180deg,#ef5350,#dc2626)] text-white shadow-[0_16px_32px_-22px_rgba(220,38,38,0.42)] hover:bg-[linear-gradient(180deg,#ef4444,#c81e1e)] focus-visible:ring-red-500/20 dark:focus-visible:ring-red-500/40 dark:bg-red-500/60",
        outline:
          "border border-border/90 bg-white/96 text-foreground shadow-[0_10px_24px_-22px_rgba(15,23,42,0.28)] hover:border-primary/25 hover:bg-slate-50 hover:text-primary dark:border-blue-700 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800",
        secondary:
          "border border-transparent bg-[linear-gradient(180deg,#eef4fb,#e6eef9)] text-secondary-foreground shadow-[0_10px_24px_-22px_rgba(15,23,42,0.22)] hover:bg-[#dfeaf8] dark:from-slate-700 dark:to-slate-600 dark:text-slate-200 dark:hover:from-slate-600 dark:hover:to-slate-500",
        ghost:
          "text-muted-foreground hover:bg-secondary hover:text-foreground dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300",
        link: "text-blue-600 underline-offset-4 hover:underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300",
      },
      size: {
        default: "min-h-11 px-4 py-2.5 text-[0.95rem] has-[>svg]:px-3",
        sm: "min-h-9 rounded-lg gap-1.5 px-3.5 py-2 text-[0.88rem] has-[>svg]:px-3",
        lg: "min-h-12 rounded-xl px-6 py-3 text-[0.98rem] has-[>svg]:px-[1.125rem]",
        icon: "size-11 rounded-xl",
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

