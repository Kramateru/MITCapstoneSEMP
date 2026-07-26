"use client";

import * as React from "react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { LazyIcon } from "./LazyIcon";

import { buttonVariants } from "./button";
import { cn } from "./utils";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  const calendarClassNames = {
    root: cn("p-3", classNames?.root, defaultClassNames.root),
    months: cn("flex flex-col sm:flex-row gap-2", classNames?.months, defaultClassNames.months),
    month: cn("flex flex-col gap-4", classNames?.month, defaultClassNames.month),
    month_caption: cn(
      "flex justify-center pt-1 relative items-center w-full",
      classNames?.month_caption,
      defaultClassNames.month_caption,
    ),
    caption_label: cn("text-sm font-medium", classNames?.caption_label, defaultClassNames.caption_label),
    nav: cn("flex items-center gap-1", classNames?.nav, defaultClassNames.nav),
    button_previous: cn(
      buttonVariants({ variant: "outline" }),
      "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
      classNames?.button_previous,
      defaultClassNames.button_previous,
    ),
    button_next: cn(
      buttonVariants({ variant: "outline" }),
      "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
      classNames?.button_next,
      defaultClassNames.button_next,
    ),
    month_grid: cn("w-full border-collapse space-x-1", classNames?.month_grid, defaultClassNames.month_grid),
    weekdays: cn("flex", classNames?.weekdays, defaultClassNames.weekdays),
    weekday: cn(
      "flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none",
      classNames?.weekday,
      defaultClassNames.weekday,
    ),
    week: cn("mt-2 flex w-full", classNames?.week, defaultClassNames.week),
    week_number_header: cn("w-(--cell-size) select-none", classNames?.week_number_header, defaultClassNames.week_number_header),
    week_number: cn("text-[0.8rem] text-muted-foreground select-none", classNames?.week_number, defaultClassNames.week_number),
    day: cn(
      "group/day relative aspect-square h-full w-full p-0 text-center select-none",
      classNames?.day,
      defaultClassNames.day,
    ),
    day_button: cn(
      "flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal",
      classNames?.day_button,
      defaultClassNames.day_button,
    ),
    range_start: cn("rounded-l-md bg-accent", classNames?.range_start, defaultClassNames.range_start),
    range_middle: cn("rounded-none", classNames?.range_middle, defaultClassNames.range_middle),
    range_end: cn("rounded-r-md bg-accent", classNames?.range_end, defaultClassNames.range_end),
    today: cn("bg-accent text-accent-foreground", classNames?.today, defaultClassNames.today),
    outside: cn("text-muted-foreground aria-selected:text-muted-foreground", classNames?.outside, defaultClassNames.outside),
    disabled: cn("text-muted-foreground opacity-50", classNames?.disabled, defaultClassNames.disabled),
    hidden: cn("invisible", classNames?.hidden, defaultClassNames.hidden),
    dropdowns: cn(classNames?.dropdowns, defaultClassNames.dropdowns),
    dropdown_root: cn(classNames?.dropdown_root, defaultClassNames.dropdown_root),
    dropdown: cn(classNames?.dropdown, defaultClassNames.dropdown),
  };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={calendarClassNames}
      components={{
        IconLeft: ({ className, ...props }) => (
          <LazyIcon name="ChevronLeft" className={cn("size-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <LazyIcon name="ChevronRight" className={cn("size-4", className)} {...props} />
        ),
      }}
      {...props}
    />
  );
}

export { Calendar };

