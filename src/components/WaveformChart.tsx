import { useEffect, useRef } from "react";
import UPlot from "uplot";
import type { DisplayWaveform } from "../types";

type Props = {
  display: DisplayWaveform | null;
};

/**
 * Render the Trigger (top) and Receiver (bottom) waveforms as two
 * uPlot instances sharing a single numeric microsecond x-axis. uPlot
 * instances are destroyed on unmount and before each rebuild to avoid
 * double-generation and canvas leaks.
 */
export default function WaveformChart({ display }: Props) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const receiverRef = useRef<HTMLDivElement>(null);
  const triggerPlotRef = useRef<UPlot | null>(null);
  const receiverPlotRef = useRef<UPlot | null>(null);

  // (Re)build the plots whenever the display data changes.
  useEffect(() => {
    // No data: destroy any existing plots and show nothing.
    if (!display || display.timeUs.length === 0) {
      destroyPlots(triggerPlotRef, triggerRef);
      destroyPlots(receiverPlotRef, receiverRef);
      return;
    }

    const time = display.timeUs;
    // x-axis span equals the trimmed time range of the current display.
    const xMin = time[0];
    const xMax = time[time.length - 1];

    // uPlot.AlignedData: first array is the shared x-axis, later arrays
    // are the y values per series.
    const triggerData: UPlot.AlignedData = [
      time,
      display.transmitterV,
    ];
    const receiverData: UPlot.AlignedData = [
      time,
      display.receiverV,
    ];

    const triggerOpts = buildOptions(
      "Trigger (with gain)",
      "Trigger (V)",
      xMin,
      xMax,
      display.transmitterV,
    );
    const receiverOpts = buildOptions(
      "Receiver",
      "Receiver (V)",
      xMin,
      xMax,
      display.receiverV,
    );

    // Always destroy previous instances before creating new ones to
    // avoid stacked canvases when the data prop replaces a prior chart.
    destroyPlots(triggerPlotRef, triggerRef);
    destroyPlots(receiverPlotRef, receiverRef);

    // uPlot constructor: (options, data, mountNode) mounts the chart
    // synchronously into the given DOM element.
    if (triggerRef.current) {
      triggerPlotRef.current = new UPlot(triggerOpts, triggerData, triggerRef.current);
    }
    if (receiverRef.current) {
      receiverPlotRef.current = new UPlot(receiverOpts, receiverData, receiverRef.current);
    }

    // Cleanup on unmount or before next rebuild: tear down both plots.
    return () => {
      destroyPlots(triggerPlotRef, triggerRef);
      destroyPlots(receiverPlotRef, receiverRef);
    };
  }, [display]);

  return (
    <div className="chart-stack">
      <div className="chart-block">
        <div className="chart-host" ref={triggerRef} />
      </div>
      <div className="chart-block">
        <div className="chart-host" ref={receiverRef} />
      </div>
    </div>
  );
}

/**
 * Build a uPlot options object for one chart with a numeric microsecond
 * x-axis and an auto-padded y-axis fitted to the given values.
 */
function buildOptions(
  title: string,
  yAxisLabel: string,
  xMin: number,
  xMax: number,
  values: number[],
): UPlot.Options {
  // Compute y-axis bounds from finite values only; guard against flat data.
  const ys = values.filter(Number.isFinite);
  let yMin = ys.length ? Math.min(...ys) : 0;
  let yMax = ys.length ? Math.max(...ys) : 1;
  // If all values are equal, expand the range so uPlot can render.
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  // Pad the y range by 5% so the trace does not touch the axis edges.
  const pad = (yMax - yMin) * 0.05 || 1;
  yMin -= pad;
  yMax += pad;

  // Custom scale name avoids uPlot's default "x" scale, which is treated
  // as a Unix-epoch time axis. time:false marks it as plain numeric.
  const timeUsScale = "time-us";
  return {
    title,
    width: 800,
    height: 260,
    series: [
      {
        label: "Time (µs)",
        scale: timeUsScale,
      },
      {
        label: yAxisLabel,
        scale: "y",
        width: 1,
        stroke: "#1f77b4",
        points: { show: false },
      },
    ],
    axes: [
      {
        scale: timeUsScale,
        label: "Time (µs)",
        // uPlot's default axis values render as epoch-derived dates.
        // Override values() to format numeric µs ticks ourselves.
        values: (_self, splits) => splits.map((v) => formatMicros(v)),
        grid: { show: true, stroke: "#dddddd", width: 1 },
        ticks: { show: true, stroke: "#cccccc", width: 1 },
      },
      {
        scale: "y",
        label: yAxisLabel,
        grid: { show: true, stroke: "#dddddd", width: 1 },
        ticks: { show: true, stroke: "#cccccc", width: 1 },
      },
    ],
    scales: {
      [timeUsScale]: { min: xMin, max: xMax, time: false },
      y: { min: yMin, max: yMax },
    },
    cursor: { show: true },
  };
}

/** Destroy the uPlot instance held in plotRef, if any, and clear the ref. */
function destroyPlots(
  plotRef: { current: UPlot | null },
  _hostRef: { current: HTMLDivElement | null },
) {
  if (plotRef.current) {
    plotRef.current.destroy();
    plotRef.current = null;
  }
}

/** Format a microsecond tick value with adaptive precision for the axis. */
function formatMicros(v: number): string {
  // Non-finite splits (e.g. from empty ranges) render as blank.
  if (!Number.isFinite(v)) return "";
  // Larger magnitudes get fewer decimals to keep ticks compact.
  const abs = Math.abs(v);
  if (abs >= 1000) return trimZeros(v.toFixed(0));
  if (abs >= 100) return trimZeros(v.toFixed(1));
  return trimZeros(v.toFixed(2));
}

/** Remove trailing zeros (and a dangling decimal point) from a number string. */
function trimZeros(s: string): string {
  return s.indexOf(".") === -1 ? s : s.replace(/\.?0+$/, "");
}