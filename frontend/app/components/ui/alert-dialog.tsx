"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

import { cn } from "./utils";
import { buttonVariants } from "./button";

type AlertDialogContentSize = "sm" | "md" | "lg" | "xl";

const alertDialogSizeClasses: Record<AlertDialogContentSize, string> = {
  sm: "!w-[95vw] md:!w-[88vw] lg:!w-[62vw] lg:!min-w-[min(60vw,1160px)] xl:!w-[60vw] xl:!max-w-[1180px]",
  md: "!w-[95vw] md:!w-[90vw] lg:!w-[68vw] lg:!min-w-[min(62vw,1200px)] xl:!w-[65vw] xl:!max-w-[1260px]",
  lg: "!w-[96vw] md:!w-[92vw] lg:!w-[73vw] lg:!min-w-[min(66vw,1280px)] xl:!w-[71vw] xl:!max-w-[1380px]",
  xl: "!w-[96vw] md:!w-[93vw] lg:!w-[75vw] lg:!min-w-[min(68vw,1360px)] xl:!w-[74vw] xl:!max-w-[1480px] 2xl:!w-[70vw]",
};

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-slate-950/56 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  size = "xl",
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: AlertDialogContentSize;
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 flex max-h-[92vh] min-h-0 translate-x-[-50%] translate-y-[-50%] flex-col gap-7 overflow-y-auto overscroll-contain rounded-[1.35rem] border border-slate-200/85 bg-white p-6 text-[0.96rem] leading-7 shadow-[0_36px_120px_-44px_rgba(15,23,42,0.42)] outline-hidden duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:p-8 sm:text-base xl:p-9 [&_button]:text-sm [&_button]:sm:text-base [&_p]:text-balance",
          alertDialogSizeClasses[size],
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "sticky top-0 z-10 flex shrink-0 flex-col gap-3 border-b border-slate-200/80 bg-white/96 pb-6 text-left backdrop-blur supports-[backdrop-filter]:bg-white/90",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200/80 bg-white/96 pt-6 backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-[clamp(1.55rem,1.2rem+0.9vw,2.35rem)] font-bold tracking-[-0.025em]", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm leading-7 text-slate-600 sm:text-[1.01rem]", className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(buttonVariants(), className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
