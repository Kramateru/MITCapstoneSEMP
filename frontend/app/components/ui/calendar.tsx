"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { LazyIcon } from "./LazyIcon";

import { buttonVariants } from "./button";
import { cn } from "./utils";

type DayPickerClassNames = NonNullable<
  React.ComponentProps<typeof DayPicker>["classNames"]
>;
type CalendarClassNames = Record<string, string | undefined>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const userClassNames = (classNames ?? {}) as CalendarClassNames;
  const calendarClassNames = {
    ...classNames,
    root: cn("p-3", userClassNames.root),
    months: cn("flex flex-col sm:flex-row gap-2", userClassNames.months),
    month: cn("flex flex-col gap-4", userClassNames.month),
    caption: cn(
      "flex justify-center pt-1 relative items-center w-full",
      userClassNames.caption,
    ),
    caption_label: cn("text-sm font-medium", userClassNames.caption_label),
    caption_dropdowns: cn(userClassNames.caption_dropdowns),
    dropdown: cn(userClassNames.dropdown),
    nav: cn("flex items-center gap-1", userClassNames.nav),
    nav_button: cn(
      buttonVariants({ variant: "outline" }),
      "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
      userClassNames.nav_button,
    ),
    nav_button_previous: cn(
      buttonVariants({ variant: "outline" }),
      "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
      userClassNames.nav_button_previous,
    ),
    nav_button_next: cn(
      buttonVariants({ variant: "outline" }),
      "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
      userClassNames.nav_button_next,
    ),
    table: cn("w-full border-collapse space-x-1", userClassNames.table),
    head_row: cn("flex", userClassNames.head_row),
    head_cell: cn(
      "flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none",
      userClassNames.head_cell,
    ),
    row: cn("mt-2 flex w-full", userClassNames.row),
    weeknumber: cn("text-[0.8rem] text-muted-foreground select-none", userClassNames.weeknumber),
    cell: cn("relative aspect-square h-full w-full p-0 text-center select-none", userClassNames.cell),
    day: cn(
      "flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal",
      userClassNames.day,
    ),
    day_range_start: cn("rounded-l-md bg-accent", userClassNames.day_range_start),
    day_range_middle: cn("rounded-none", userClassNames.day_range_middle),
    day_range_end: cn("rounded-r-md bg-accent", userClassNames.day_range_end),
    day_today: cn("bg-accent text-accent-foreground", userClassNames.day_today),
    day_outside: cn("text-muted-foreground aria-selected:text-muted-foreground", userClassNames.day_outside),
    day_disabled: cn("text-muted-foreground opacity-50", userClassNames.day_disabled),
    day_hidden: cn("invisible", userClassNames.day_hidden),
  } as DayPickerClassNames;

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

