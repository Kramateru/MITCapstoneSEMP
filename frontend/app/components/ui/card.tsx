'use client';

import * as React from "react";

import { cn } from "./utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "dashboard-card bg-card text-card-foreground flex min-w-0 w-full flex-col gap-2 rounded-xl border border-border/80 sm:gap-2.5",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid min-w-0 auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-3 pt-3 sm:gap-2.5 sm:px-4 sm:pt-4 has-data-[slot=card-action]:grid-cols-1 @lg/card-header:has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto] [.border-b]:pb-3 sm:[.border-b]:pb-4",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <h4
      data-slot="card-title"
      className={cn("max-w-full text-[1.02rem] font-bold leading-tight tracking-normal text-balance sm:text-[1.1rem]", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <p
      data-slot="card-description"
      className={cn("max-w-[70ch] text-sm leading-6 text-muted-foreground sm:text-[0.96rem]", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "flex min-w-0 max-w-full flex-wrap items-center gap-2 self-start justify-self-start @lg/card-header:col-start-2 @lg/card-header:row-span-2 @lg/card-header:row-start-1 @lg/card-header:justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("min-w-0 px-3 pb-3 sm:px-4 sm:pb-4", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex flex-wrap items-center gap-2 px-3 pb-3 sm:px-4 sm:pb-4 [.border-t]:pt-3 sm:[.border-t]:pt-4", className)}
      {...props}
    />
  );
}

export {
    Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle
};

