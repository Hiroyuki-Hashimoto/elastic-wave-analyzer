import { useEffect, useRef } from "react";
import UPlot from "uplot";
import type { DisplayWaveform } from "../types";

type Props = {
  display: DisplayWaveform | null;
};

/**
 * Renders the Trigger (top) and Receiver (bottom) waveforms using two
 * separate uPlot instances sharing the same x-axis (Time [µs]). uPlot
 * instances are created lazily after the data is provided and are
 * always destroyed before being recreated or on unmount.
 */
export default function WaveformChart({ display }: Props) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const receiverRef = useRef<HTMLDivElement>(null);
  const triggerPlotRef = useRef<UPlot | null>(null);
  const receiverPlotRef = useRef<UPlot | null>(null);

  // (Re)build the plots whenever display data changes.
  useEffect(() => {
    if (!display || display.timeUs.length === 0) {
      destroyPlots(triggerPlotRef, triggerRef);
      destroyPlots(receiverPlotRef, receiverRef);
      return;
    }

    const time = display.timeUs;
    const xMin = time[0];
    const xMax = time[time.length - 1];

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

    destroyPlots(triggerPlotRef, triggerRef);
    destroyPlots(receiverPlotRef, receiverRef);

    if (triggerRef.current) {
      triggerPlotRef.current = new UPlot(triggerOpts, triggerData, triggerRef.current);
    }
    if (receiverRef.current) {
      receiverPlotRef.current = new UPlot(receiverOpts, receiverData, receiverRef.current);
    }

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

function buildOptions(
  title: string,
  yAxisLabel: string,
  xMin: number,
  xMax: number,
  values: number[],
): UPlot.Options {
  const ys = values.filter(Number.isFinite);
  let yMin = ys.length ? Math.min(...ys) : 0;
  let yMax = ys.length ? Math.max(...ys) : 1;
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.05 || 1;
  yMin -= pad;
  yMax += pad;

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
        // uPlot treats the default "x" scale as a time axis (Unix epoch
        // seconds). Our x values are microsecond offsets, not timestamps,
        // so format this axis as plain numeric µs.
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

function destroyPlots(
  plotRef: { current: UPlot | null },
  _hostRef: { current: HTMLDivElement | null },
) {
  if (plotRef.current) {
    plotRef.current.destroy();
    plotRef.current = null;
  }
}

function formatMicros(v: number): string {
  if (!Number.isFinite(v)) return "";
  // Compact formatting for axis ticks; one decimal max, drop trailing 0.
  const abs = Math.abs(v);
  if (abs >= 1000) return trimZeros(v.toFixed(0));
  if (abs >= 100) return trimZeros(v.toFixed(1));
  return trimZeros(v.toFixed(2));
}

function trimZeros(s: string): string {
  return s.indexOf(".") === -1 ? s : s.replace(/\.?0+$/, "");
}