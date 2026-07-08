"use client"

import * as React from "react"
import * as Recharts from "recharts"

export function ChartRecharts({ children }: { children: React.ReactNode }) {
  return <Recharts.ResponsiveContainer>{children}</Recharts.ResponsiveContainer>
}

// Re-export commonly used primitives so the consumer can import them
export const Tooltip = Recharts.Tooltip
export const Legend = Recharts.Legend
export const LabelList = Recharts.LabelList
export const Bar = Recharts.Bar
export const BarChart = Recharts.BarChart
export const Cell = Recharts.Cell
export const ComposedChart = Recharts.ComposedChart
export const Line = Recharts.Line
export const LineChart = Recharts.LineChart
export const Pie = Recharts.Pie
export const PieChart = Recharts.PieChart
export const CartesianGrid = Recharts.CartesianGrid
export const XAxis = Recharts.XAxis
export const YAxis = Recharts.YAxis
export const ResponsiveContainer = Recharts.ResponsiveContainer

export default ChartRecharts
