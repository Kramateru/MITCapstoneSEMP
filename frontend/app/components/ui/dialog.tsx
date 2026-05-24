"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "./utils";

type DialogContentSize = "sm" | "md" | "lg" | "xl" | "full";

const dialogSizeClasses: Record<DialogContentSize, string> = {
  sm: "!w-[calc(100vw-1rem)] sm:!w-[calc(100vw-2rem)] lg:!w-[75vw] lg:!max-w-[1180px] 2xl:!max-w-[1240px]",
  md: "!w-[calc(100vw-1rem)] sm:!w-[calc(100vw-2rem)] lg:!w-[78vw] lg:!max-w-[1260px] 2xl:!max-w-[1340px]",
  lg: "!w-[calc(100vw-1rem)] sm:!w-[calc(100vw-2rem)] lg:!w-[82vw] lg:!max-w-[1380px] 2xl:!max-w-[1480px]",
  xl: "!w-[calc(100vw-1rem)] sm:!w-[calc(100vw-2rem)] lg:!w-[85vw] lg:!max-w-[1480px] 2xl:!max-w-[1600px]",
  full: "!w-[calc(100vw-0.75rem)] sm:!w-[calc(100vw-1.5rem)] lg:!w-[92vw] !max-w-[1720px]",
};

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-slate-950/56 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  size = "xl",
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?: DialogContentSize;
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 flex max-h-[92vh] min-h-0 translate-x-[-50%] translate-y-[-50%] flex-col gap-6 overflow-y-auto overscroll-contain rounded-[1.2rem] border border-slate-200/85 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[0.95rem] leading-7 shadow-[0_36px_120px_-44px_rgba(15,23,42,0.42)] outline-hidden duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-[1.3rem] sm:p-6 sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:text-base lg:p-8 xl:p-9 [&_input]:text-sm [&_textarea]:text-sm [&_button]:text-sm [&_[data-slot=label]]:text-sm [&_[data-slot=label]]:leading-6 [&_table]:text-sm [&_th]:text-xs [&_th]:font-semibold [&_td]:align-top [&_[data-slot=select-trigger]]:text-sm sm:[&_input]:text-base sm:[&_textarea]:text-base sm:[&_button]:text-base sm:[&_[data-slot=label]]:text-[0.98rem] sm:[&_table]:text-[0.98rem] sm:[&_[data-slot=select-trigger]]:text-base [&_p]:text-balance",
          dialogSizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary data-[state=open]:text-foreground absolute top-5 right-5 rounded-full border border-slate-200/90 bg-white/96 p-2.5 opacity-90 shadow-[0_18px_36px_-26px_rgba(15,23,42,0.32)] transition-all hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "sticky top-0 z-10 flex shrink-0 flex-col gap-3 border-b border-slate-200/80 bg-white/96 pb-4 text-left backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:pb-6",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200/80 bg-white/96 pt-4 backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:flex-row sm:justify-end sm:pt-6",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("pr-12 text-[clamp(1.55rem,1.2rem+0.9vw,2.35rem)] leading-tight font-bold tracking-[-0.025em]", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("pr-12 text-sm leading-7 text-slate-600 sm:text-[1.01rem]", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
