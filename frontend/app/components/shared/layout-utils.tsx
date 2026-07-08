/**
 * Layout Utilities for Responsive Card Headers and Flex Containers
 * 
 * Fixes overlap issues by ensuring proper width constraints on flex items.
 * Use these patterns for headers, title+button combinations, and responsive layouts.
 */

/**
 * For CardHeader with title/description on left and action buttons on right
 * Usage: Apply these classNames to your flex container and child divs
 */
export const headerFlexClasses = {
  container: "flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between xl:gap-5",
  left: "min-w-0 flex-1", // Allows left side to shrink if needed
  right: "shrink-0" // Keeps buttons from expanding
};

/**
 * For medium-sized card headers (lg breakpoint)
 */
export const mediumHeaderFlexClasses = {
  container: "flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-5",
  left: "min-w-0 flex-1",
  right: "shrink-0"
};

/**
 * For small-medium headers (sm breakpoint)
 */
export const smallHeaderFlexClasses = {
  container: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5",
  left: "min-w-0 flex-1",
  right: "shrink-0"
};

/**
 * For content + metric/badge layouts
 */
export const contentFlexClasses = {
  container: "flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-5",
  left: "min-w-0 flex-1 space-y-2",
  right: "flex shrink-0 flex-wrap gap-2"
};

/**
 * Component wrapper for consistent header layouts
 * 
 * @example
 * <CardHeader>
 *   <ResponsiveHeaderFlex
 *     title="My Title"
 *     description="My description"
 *     action={<Button>Action</Button>}
 *   />
 * </CardHeader>
 */
export function ResponsiveHeaderFlex({
  title,
  description,
  action,
  breakpoint = "xl",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  breakpoint?: "sm" | "md" | "lg" | "xl";
}) {
  const breakpointClass = breakpoint === "sm" ? "sm:flex-row" : 
                         breakpoint === "md" ? "md:flex-row" :
                         breakpoint === "lg" ? "lg:flex-row" : "xl:flex-row";
  
  const gapClass = breakpoint === "sm" ? "sm:gap-5" :
                   breakpoint === "md" ? "md:gap-5" :
                   breakpoint === "lg" ? "lg:gap-5" : "xl:gap-5";
  
  const itemsClass = breakpoint === "sm" ? "sm:items-center" :
                     breakpoint === "md" ? "md:items-center" :
                     breakpoint === "lg" ? "lg:items-start" : "xl:items-start";

  return (
    <div className={`flex flex-col gap-3 ${breakpointClass} ${itemsClass} ${gapClass} xl:justify-between`}>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-lg">{title}</div>
        {description && (
          <div className="text-sm text-gray-600 mt-1">{description}</div>
        )}
      </div>
      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}

/**
 * Key fixes for flex layout overlap issues:
 * 
 * 1. Add min-w-0 to left content div
 *    - Allows flex items to shrink below their content size
 *    - Prevents overflow when content is long
 * 
 * 2. Add flex-1 to left content div
 *    - Makes the left side take available space
 *    - Right side buttons stay fixed size
 * 
 * 3. Add shrink-0 to right content div
 *    - Prevents buttons from shrinking
 *    - Ensures buttons maintain readable size
 * 
 * 4. Increase gap from gap-4 to gap-6 at responsive breakpoint
 *    - Provides better visual separation
 *    - Reduces overlap risk on medium screens
 * 
 * 5. Add explicit gap class to breakpoint (e.g., xl:gap-6)
 *    - Ensures proper spacing at each breakpoint
 *    - Overrides default gap-4
 */
