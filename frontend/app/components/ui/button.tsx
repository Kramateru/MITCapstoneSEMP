'use client';

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold leading-none transition-[transform,background-color,border-color,box-shadow,color] duration-200 ease-in-out hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:saturate-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none shadow-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive touch-manipulation",
  {
    variants: {
      variant: {
        default: "cta-button bg-primary text-primary-foreground shadow-[0_14px_28px_-18px_rgba(37,99,235,0.55)] hover:bg-primary/92 hover:shadow-[0_18px_32px_-18px_rgba(37,99,235,0.62)]",
        success: "bg-accent text-accent-foreground shadow-[0_14px_28px_-18px_rgba(22,163,74,0.45)] hover:bg-accent/92 hover:shadow-[0_18px_32px_-18px_rgba(22,163,74,0.55)]",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-border bg-card text-foreground hover:bg-muted hover:text-foreground dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/90",
        ghost:
          "text-foreground hover:bg-muted hover:text-foreground dark:hover:bg-accent/35",
        link: "text-primary underline-offset-4 hover:underline",
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
