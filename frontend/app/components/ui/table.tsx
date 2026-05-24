"use client";

import * as React from "react";

import { cn } from "./utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full max-w-full overflow-x-auto overflow-y-hidden rounded-[1.1rem] border border-border/80 bg-white/95 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.24)] sm:rounded-[1.2rem]"
    >
      <table
        data-slot="table"
        className={cn("min-w-full caption-bottom text-sm leading-6", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("sticky top-0 z-[1] bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(244,247,251,0.94))] backdrop-blur [&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-slate-50/92 data-[state=selected]:bg-muted border-b border-border/70 transition-colors",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-muted-foreground h-11 px-3 text-left align-middle text-[0.7rem] font-semibold uppercase tracking-[0.14em] whitespace-normal sm:h-12 sm:px-4 sm:text-[0.77rem] [&:has([role=checkbox])]:pr-0 [&_[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-3 align-middle whitespace-normal break-words text-[0.9rem] leading-6 text-foreground sm:px-4 sm:py-3.5 sm:text-[0.95rem] [&:has([role=checkbox])]:pr-0 [&_[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
