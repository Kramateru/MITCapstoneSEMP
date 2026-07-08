"use client";

import { LazyIcon } from '@/app/components/ui/LazyIcon';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

import { cn } from "./utils";

type DialogContentSize = "sm" | "md" | "lg" | "xl" | "full";

const dialogSizeClasses: Record<DialogContentSize, string> = {
  sm: "!w-[95vw] sm:!w-[88vw] lg:!w-[75vw] lg:!max-w-[900px] 2xl:!max-w-[980px]",
  md: "!w-[95vw] sm:!w-[88vw] lg:!w-[76vw] lg:!max-w-[1040px] 2xl:!max-w-[1120px]",
  lg: "!w-[95vw] sm:!w-[90vw] lg:!w-[78vw] lg:!max-w-[1180px] 2xl:!max-w-[1280px]",
  xl: "!w-[95vw] sm:!w-[90vw] lg:!w-[80vw] lg:!max-w-[1320px] 2xl:!max-w-[1380px]",
  full: "!w-[96vw] sm:!w-[92vw] lg:!w-[82vw] !max-w-[1600px]",
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
  size = "md",
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
          "dialog-safe-area-padding fixed top-[50%] left-[50%] z-50 flex max-h-[calc(100dvh-0.8rem)] min-h-0 translate-x-[-50%] translate-y-[-50%] flex-col gap-4 overflow-y-auto overscroll-contain rounded-[1.2rem] border border-slate-200/85 bg-white p-3 text-[0.95rem] leading-6 shadow-[0_36px_120px_-44px_rgba(15,23,42,0.42)] [scrollbar-gutter:stable_both-edges] outline-hidden duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-[1.35rem] sm:p-5 sm:text-base lg:p-6 xl:p-7 [&_input]:text-sm [&_textarea]:text-sm [&_button]:text-sm [&_[data-slot=button]]:min-h-10 [&_[data-slot=label]]:text-sm [&_[data-slot=label]]:leading-5 [&_table]:text-sm [&_th]:text-xs [&_th]:font-semibold [&_td]:align-top [&_[data-slot=select-trigger]]:text-sm sm:[&_input]:text-base sm:[&_textarea]:text-base sm:[&_button]:text-base sm:[&_[data-slot=label]]:text-[0.98rem] sm:[&_table]:text-[0.98rem] sm:[&_[data-slot=select-trigger]]:text-base [&_p]:text-pretty",
          className,
          dialogSizeClasses[size],
        )}
        {...props}
      >
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary data-[state=open]:text-foreground sticky top-0 z-30 -mb-12 ml-auto inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white/96 opacity-95 shadow-[0_18px_36px_-26px_rgba(15,23,42,0.32)] transition-all hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5">
          <LazyIcon name="X" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "sticky top-0 z-10 flex shrink-0 flex-col gap-2 border-b border-slate-200/80 bg-white/96 pb-3 pr-10 text-left backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:pb-4",
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
        "dialog-safe-area-footer-padding sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col-reverse gap-2.5 border-t border-slate-200/80 bg-white/96 pt-3 backdrop-blur supports-[backdrop-filter]:bg-white/90 [&>*]:w-full sm:flex-row sm:justify-end sm:pt-4 sm:[&>*]:w-auto",
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
      className={cn("text-[clamp(1.35rem,1.12rem+0.65vw,2rem)] leading-tight font-bold tracking-normal", className)}
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
    DialogTrigger
};

