import { useEffect, useRef } from "react";
import UPlot from "uplot";
import {
  findNearestSampleIndex,
  findReceiverPtpIndex,
  findTriggerPtpIndex,
} from "../lib/picker";
import type {
  DisplayWaveform,
  PickAxis,
  PickKind,
  PickPoint,
  PickerState,
} from "../types";

type Props = {
  display: DisplayWaveform | null;
  picker: PickerState;
  onPick: (axis: PickAxis, kind: PickKind, point: PickPoint) => void;
  /** Half-width of the PTP peak search window, in µs. */
  peakWidthUs: number;
  /** Sample interval of the displayed waveform, in µs. */
  dTUs: number;
};

/**
 * Render the Trigger (top) and Receiver (bottom) waveforms as two
 * uPlot instances sharing a single numeric microsecond x-axis, with
 * left/right mouse interaction for STS/PTP picking. uPlot instances
 * are destroyed on unmount and before each rebuild; click and context
 * listeners are removed on the same lifecycle to avoid leaks.
 */
export default function WaveformChart({
  display,
  picker,
  onPick,
  peakWidthUs,
  dTUs,
}: Props) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const receiverRef = useRef<HTMLDivElement>(null);
  const triggerPlotRef = useRef<UPlot | null>(null);
  const receiverPlotRef = useRef<UPlot | null>(null);

  // Latest props kept in refs so native listeners/hook closures can read
  // the most recent values without rebinding on every render.
  const pickerRef = useRef(picker);
  pickerRef.current = picker;
  const displayRef = useRef(display);
  displayRef.current = display;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const peakWidthUsRef = useRef(peakWidthUs);
  peakWidthUsRef.current = peakWidthUs;
  const dTUsRef = useRef(dTUs);
  dTUsRef.current = dTUs;

  // (Re)build the plots whenever display data OR picker markers change.
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
    const triggerData: UPlot.AlignedData = [time, display.transmitterV];
    const receiverData: UPlot.AlignedData = [time, display.receiverV];

    const triggerMarkers = {
      sts: picker.triggerSts,
      ptp: picker.triggerPtp,
    };
    const receiverMarkers = {
      sts: picker.receiverSts,
      ptp: picker.receiverPtp,
    };

    const triggerOpts = buildOptions(
      "Trigger (with gain)",
      "Trigger (V)",
      xMin,
      xMax,
      display.transmitterV,
      triggerMarkers,
    );
    const receiverOpts = buildOptions(
      "Receiver",
      "Receiver (V)",
      xMin,
      xMax,
      display.receiverV,
      receiverMarkers,
    );

    // Always destroy previous instances before creating new ones to
    // avoid stacked canvases when the data prop replaces a prior chart.
    destroyPlots(triggerPlotRef, triggerRef);
    destroyPlots(receiverPlotRef, receiverRef);

    // uPlot constructor: (options, data, mountNode) mounts the chart
    // synchronously into the given DOM element.
    if (triggerRef.current) {
      triggerPlotRef.current = new UPlot(
        triggerOpts,
        triggerData,
        triggerRef.current,
      );
      attachPickListeners("trigger", triggerPlotRef.current);
    }
    if (receiverRef.current) {
      receiverPlotRef.current = new UPlot(
        receiverOpts,
        receiverData,
        receiverRef.current,
      );
      attachPickListeners("receiver", receiverPlotRef.current);
    }

    // Cleanup on unmount or before next rebuild: tear down both plots.
    return () => {
      destroyPlots(triggerPlotRef, triggerRef);
      destroyPlots(receiverPlotRef, receiverRef);
    };
  }, [display, picker]);

  /**
   * Attach mousedown + contextmenu listeners to the uPlot overlay div
   * so left clicks pick STS, right clicks pick PTP, and right-click
   * inside the chart never opens the browser context menu. Listeners
   * are stored on the plot instance via closure cleanup is implicit on
   * destroy since the host DOM (u.over) is removed.
   */
  function attachPickListeners(axis: PickAxis, plot: UPlot) {
    const over = plot.over;

    // Prevent the browser context menu only inside this chart's overlay.
    const onContext = (e: MouseEvent) => e.preventDefault();
    over.addEventListener("contextmenu", onContext);

    over.addEventListener("mousedown", (e: MouseEvent) => {
      // Left button = STS, right button = PTP; ignore middle/other buttons.
      if (e.button !== 0 && e.button !== 2) return;
      const kind: PickKind = e.button === 2 ? "ptp" : "sts";
      handlePickClick(axis, kind, plot, e);
    });
  }

  /**
   * Convert a mouse click into snapped PickPoint(s) and forward them
   * to App via onPick. A left-click sets STS AND auto-derives the PTP
   * for the same axis (Trigger uses global argmax, Receiver uses
   * argmax of values[stsIdx:]); a right-click only replaces the PTP.
   */
  function handlePickClick(
    axis: PickAxis,
    kind: PickKind,
    plot: UPlot,
    e: MouseEvent,
  ) {
    const disp = displayRef.current;
    if (!disp || disp.timeUs.length === 0) return;
    const rect = plot.over.getBoundingClientRect();
    // CSS pixel x relative to the plot overlay; ignore clicks outside.
    const leftPx = e.clientX - rect.left;
    if (leftPx < 0 || leftPx > rect.width) return;
    // uPlot.posToVal maps an overlay CSS x back to a data value (µs).
    const dataX = plot.posToVal(leftPx, "time-us");
    if (!Number.isFinite(dataX)) return;

    const time = disp.timeUs;
    const values = axis === "trigger" ? disp.transmitterV : disp.receiverV;

    // Helper: snap to a given sample index and emit a pick for this axis.
    const emit = (idx: number, k: PickKind) => {
      if (idx < 0 || idx >= time.length) return;
      onPickRef.current(axis, k, {
        axis,
        kind: k,
        index: idx,
        timeUs: time[idx],
        voltage: values[idx],
      });
    };

    if (kind === "sts") {
      // Left-click: snap STS to nearest sample, then auto-derive PTP.
      const stsIdx = findNearestSampleIndex(time, dataX);
      emit(stsIdx, "sts");
      // PTP uses the µs-width window peak with the current sample dT.
      if (axis === "trigger") {
        emit(findTriggerPtpIndex(values, peakWidthUsRef.current, dTUsRef.current), "ptp");
      } else {
        emit(findReceiverPtpIndex(values, stsIdx, peakWidthUsRef.current, dTUsRef.current), "ptp");
      }
    } else {
      // Right-click: replace only PTP on this axis.
      if (axis === "trigger") {
        emit(findTriggerPtpIndex(values, peakWidthUsRef.current, dTUsRef.current), "ptp");
      } else {
        // Use already-selected Receiver STS; on missing STS fall back to
        // the click's nearest sample as the search start.
        const stsIdx =
          pickerRef.current.receiverSts?.index ??
          findNearestSampleIndex(time, dataX);
        emit(findReceiverPtpIndex(values, stsIdx, peakWidthUsRef.current, dTUsRef.current), "ptp");
      }
    }
  }

  // Picker summary strings: "--" for unset points, formatted µs otherwise.
  const triggerStsLabel = formatPick(picker.triggerSts);
  const triggerPtpLabel = formatPick(picker.triggerPtp);
  const receiverStsLabel = formatPick(picker.receiverSts);
  const receiverPtpLabel = formatPick(picker.receiverPtp);

  return (
    <div className="chart-stack">
      <div className="chart-block">
        <div className="chart-host" ref={triggerRef} />
      </div>
      <div className="chart-block">
        <div className="chart-host" ref={receiverRef} />
      </div>
      <p className="picker-summary">
        Trigger — STS: {triggerStsLabel} | PTP: {triggerPtpLabel}
        <br />
        Receiver — STS: {receiverStsLabel} | PTP: {receiverPtpLabel}
      </p>
    </div>
  );
}

type ChartMarkers = {
  sts: PickPoint | null;
  ptp: PickPoint | null;
};

/**
 * Build a uPlot options object for one chart with a numeric microsecond
 * x-axis and an auto-padded y-axis fitted to the given values. The
 * draw hook paints STS (red) and PTP (green) vertical markers plus
 * time annotations directly on the uPlot series canvas so they appear
 * in the chart and survive PNG export later.
 */
function buildOptions(
  title: string,
  yAxisLabel: string,
  xMin: number,
  xMax: number,
  values: number[],
  markers: ChartMarkers,
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
    hooks: {
      // uPlot hook fired after axes, grid, and series are all drawn.
      // We draw marker lines/annotations here so they overlay the trace
      // and remain part of the same canvas (PNG export in Step 2-6).
      draw: [(u) => drawMarkers(u, markers)],
    },
  };
}

/**
 * Draw STS (red) and PTP (green) vertical markers and time annotations
 * onto the uPlot series canvas using uPlot's valToPos mapping.
 */
function drawMarkers(u: UPlot, markers: ChartMarkers) {
  if (!markers.sts && !markers.ptp) return;
  const ctx = u.ctx;
  // bbox is the plot drawing area in canvas pixels.
  const top = u.bbox.top;
  const bottom = u.bbox.top + u.bbox.height;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = "11px sans-serif";
  ctx.textBaseline = "top";

  // STS marker: red vertical line with time label near the top axis.
  if (markers.sts) {
    // valToPos(dataValue, scaleKey, canvasPixels=true) → canvas pixel x.
    const x = u.valToPos(markers.sts.timeUs, "time-us", true);
    ctx.strokeStyle = "#d62728";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    // Annotation: short time string anchored just inside the plot area.
    const label = `${formatPick(markers.sts)} µs`;
    ctx.fillStyle = "#d62728";
    ctx.fillText(label, x + 4, top + 4);
  }
  // PTP marker: green vertical line with time label near the top axis.
  if (markers.ptp) {
    const x = u.valToPos(markers.ptp.timeUs, "time-us", true);
    ctx.strokeStyle = "#2ca02c";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    const label = `${formatPick(markers.ptp)} µs`;
    ctx.fillStyle = "#2ca02c";
    // Nudge PTP label a few pixels lower so STS+PTP labels don't collide.
    ctx.fillText(label, x + 4, top + 20);
  }
  ctx.restore();
}

/** Format a pick's timeUs to one decimal place; "--" for unset points. */
function formatPick(point: PickPoint | null): string {
  return point ? point.timeUs.toFixed(1) : "--";
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