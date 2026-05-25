'use client';

import * as React from "react";

import { cn } from "./utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "form-field-shell file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-11 w-full min-w-0 rounded-[1rem] border px-4 py-2 text-[0.97rem] bg-input-background shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-[color,box-shadow,border-color,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 sm:h-12",
        "focus-visible:border-ring focus-visible:ring-primary/18 focus-visible:ring-[4px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        "hover:border-primary/22 hover:bg-white",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
