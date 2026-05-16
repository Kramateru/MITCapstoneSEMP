'use client';

import * as React from "react";

import { cn } from "./utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "form-field-shell resize-none border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-primary/18 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-24 w-full rounded-xl border bg-input-background px-4 py-3 text-[0.97rem] leading-6 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-[color,box-shadow,border-color,background-color] outline-none focus-visible:ring-[4px] disabled:cursor-not-allowed disabled:opacity-50 hover:border-primary/22 hover:bg-white",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
