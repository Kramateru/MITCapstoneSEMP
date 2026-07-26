"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { LazyIcon } from "./LazyIcon";

import { buttonVariants } from "./button";
import { cn } from "./utils";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const calendarClassNames = {
    root: cn("p-3", classNames?.root),
    months: cn("flex flex-col sm:flex-row gap-2", classNames?.months),
    month: cn("flex flex-col gap-4", classNames?.month),
    caption: cn(
      "flex justify-center pt-1 relative items-center w-full",
      classNames?.caption,
    ),
    caption_label: cn("text-sm font-medium", classNames?.caption_label),
    caption_dropdowns: cn(classNames?.caption_dropdowns),
    dropdown: cn(classNames?.dropdown),
    nav: cn("flex items-center gap-1", classNames?.nav),
    nav_button: cn(
      buttonVariants({ variant: "outline" }),
      "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
      classNames?.nav_button,
    ),
    nav_button_previous: cn(
      buttonVariants({ variant: "outline" }),
      "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
      classNames?.nav_button_previous,
    ),
    nav_button_next: cn(
      buttonVariants({ variant: "outline" }),
      "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
      classNames?.nav_button_next,
    ),
    table: cn("w-full border-collapse space-x-1", classNames?.table),
    head_row: cn("flex", classNames?.head_row),
    head_cell: cn(
      "flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none",
      classNames?.head_cell,
    ),
    row: cn("mt-2 flex w-full", classNames?.row),
    weeknumber: cn("text-[0.8rem] text-muted-foreground select-none", classNames?.weeknumber),
    cell: cn("relative aspect-square h-full w-full p-0 text-center select-none", classNames?.cell),
    day: cn(
      "flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal",
      classNames?.day,
    ),
    day_range_start: cn("rounded-l-md bg-accent", classNames?.day_range_start),
    day_range_middle: cn("rounded-none", classNames?.day_range_middle),
    day_range_end: cn("rounded-r-md bg-accent", classNames?.day_range_end),
    day_today: cn("bg-accent text-accent-foreground", classNames?.day_today),
    day_outside: cn("text-muted-foreground aria-selected:text-muted-foreground", classNames?.day_outside),
    day_disabled: cn("text-muted-foreground opacity-50", classNames?.day_disabled),
    day_hidden: cn("invisible", classNames?.day_hidden),
  };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={calendarClassNames}
      components={{
        IconLeft: ({ className, ...props }) => <LazyIcon name="ChevronLeft" className={cn("size-4", className)} {...props} />,
        IconRight: ({ className, ...props }) => <LazyIcon name="ChevronRight" className={cn("size-4", className)} {...props} />,
      }}
      {...props}
    />
  );
}

export { Calendar };

