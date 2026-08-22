import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type FormEvent,
  type RefObject,
} from "react";
import UPlot from "uplot";
import {
  findNearestSampleIndex,
  findReceiverPtpIndex,
  findTriggerPtpIndex,
} from "../lib/picker";
import { ZOOM_PERCENTAGES } from "../types";

/**
 * Fixed CSS-pixel height for both the Trigger and Receiver plots.
 * Shared between the initial buildOptions (so the very first frame is
 * already at this height) and the ResizeObserver (which must NOT read
 * the canvas height back from uPlot, since uPlot.rect returns the
 * .u-over overlay's bounding rect, sized to plotHgtCss = full height
 * minus axis / title space; using that would shrink the chart on
 * every observer tick).
 */
const CHART_HEIGHT = 260;

/** Granularity of the per-chart scrollbar: integer steps 0..SCROLL_STEPS. */
const SCROLL_STEPS = 1000;
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
  /** Index into ZOOM_PERCENTAGES; the visible x-range shrinks accordingly. */
  zoomIndex: number;
};

/**
 * Imperative handle exposed to App for the PNG exporter. App reads the
 * two uPlot canvases (Trigger + Receiver) and asks the chart to render
 * fresh frames so the export reflects the latest visible state.
 */
export type WaveformChartHandle = {
  /** Returns the two uPlot canvas elements, or null if not yet drawn. */
  getCanvases: () => {
    trigger: HTMLCanvasElement | null;
    receiver: HTMLCanvasElement | null;
  };
  /** Force a redraw on both plots so canvases hold the latest frame. */
  redraw: () => void;
};

/**
 * Render the Trigger (top) and Receiver (bottom) waveforms as two
 * uPlot instances sharing a single numeric microsecond x-axis, with
 * left/right mouse interaction for STS/PTP picking. uPlot instances
 * are destroyed on unmount and before each rebuild; click and context
 * listeners are removed on the same lifecycle to avoid leaks.
 */
const WaveformChart = forwardRef<WaveformChartHandle, Props>(function WaveformChartImpl(
  { display, picker, onPick, peakWidthUs, dTUs, zoomIndex },
  ref,
) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const receiverRef = useRef<HTMLDivElement>(null);
  const triggerPlotRef = useRef<UPlot | null>(null);
  const receiverPlotRef = useRef<UPlot | null>(null);

  // Expose the live canvases to the parent so the PNG exporter can
  // snapshot whatever the user is currently seeing.
  useImperativeHandle(ref, () => ({
    getCanvases: () => ({
      trigger: triggerPlotRef.current?.ctx.canvas ?? null,
      receiver: receiverPlotRef.current?.ctx.canvas ?? null,
    }),
    redraw: () => {
      triggerPlotRef.current?.redraw(false, true);
      receiverPlotRef.current?.redraw(false, true);
    },
  }));

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
  const zoomIndexRef = useRef(zoomIndex);
  zoomIndexRef.current = zoomIndex;
  // Per-chart horizontal scroll fractions (0..1): the visible window's
  // left edge as a share of the pannable span. Refs keep scrollbar drags
  // re-render-free; uPlot pans via imperative setScale instead.
  const triggerFracRef = useRef(0);
  const receiverFracRef = useRef(0);
  // Uncontrolled range inputs; programmatic resets write to their DOM.
  const triggerBarRef = useRef<HTMLInputElement>(null);
  const receiverBarRef = useRef<HTMLInputElement>(null);
  // Previous zoom level: only a zoom change (Z key) snaps both charts
  // back to the left edge, never picks / Enter / file advances.
  const prevZoomRef = useRef(zoomIndex);

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
    // Unknown / out-of-range zoomIndex falls back to 100% (full range).
    const ratio =
      ZOOM_PERCENTAGES[zoomIndex] ?? ZOOM_PERCENTAGES[0];
    const fullSpan = time[time.length - 1] - xMin;

    // Only a zoom-level change (Z key) snaps both charts back to the
    // left edge; picks, Enter, and file advances keep their scroll.
    if (prevZoomRef.current !== zoomIndex) {
      prevZoomRef.current = zoomIndex;
      triggerFracRef.current = 0;
      receiverFracRef.current = 0;
    }
    // Each chart pans independently inside the same full data span.
    const trigWin = windowFor(xMin, fullSpan, ratio, triggerFracRef.current);
    const recvWin = windowFor(xMin, fullSpan, ratio, receiverFracRef.current);

    // Sync the uncontrolled sliders to the refs (e.g. after a Z reset)
    // so thumb positions always match what the plots are showing.
    if (triggerBarRef.current) {
      triggerBarRef.current.value = String(
        Math.round(triggerFracRef.current * SCROLL_STEPS),
      );
    }
    if (receiverBarRef.current) {
      receiverBarRef.current.value = String(
        Math.round(receiverFracRef.current * SCROLL_STEPS),
      );
    }

    // Receiver signals are typically a few mV, so the y axis is shown in
    // mV for readability. Scale the V array into mV once here and pass
    // the same scaled array to both the uPlot data (which drives the
    // rendered trace and the auto-ranged y axis) and buildOptions
    // (which uses it only for an internal y-bounds sanity check).
    // Internal DisplayWaveform.receiverV stays in V so PickPoint.voltage,
    // the CSV exporter, and click snapping keep their V-based semantics.
    const receiverVm = display.receiverV.map((v) => v * 1000);

    // uPlot.AlignedData: first array is the shared x-axis, later arrays
    // are the y values per series.
    const triggerData: UPlot.AlignedData = [time, display.transmitterV];
    const receiverData: UPlot.AlignedData = [time, receiverVm];

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
      trigWin.min,
      trigWin.max,
      display.transmitterV,
      triggerMarkers,
      triggerRef.current?.clientWidth ?? 800,
    );
    const receiverOpts = buildOptions(
      "Receiver",
      "Receiver (mV)",
      recvWin.min,
      recvWin.max,
      receiverVm,
      receiverMarkers,
      receiverRef.current?.clientWidth ?? 800,
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
  }, [display, picker, zoomIndex]);

  // Watch the chart-host elements and call uPlot.setSize whenever the
  // container width changes (window resize, tab switch, settings panel
  // growth, etc). uPlot does not auto-observe its host, so without this
  // the chart would stay at whatever width it was first built with and
  // leave empty space on the right of wide panels. Runs once on mount
  // and disconnects both observers on unmount.
  useEffect(() => {
    const handleResize = (
      plotRef: { current: UPlot | null },
      entries: ResizeObserverEntry[],
    ) => {
      const width = entries[0]?.contentRect.width;
      // Skip the 0-width transition frames some browsers emit before the
      // host is laid out; setSize with 0 would crash uPlot's canvas math.
      if (width && width > 0 && plotRef.current) {
        // Use CHART_HEIGHT instead of plotRef.current.rect.height: the
        // .rect getter returns the .u-over overlay's bounding rect, which
        // uPlot sizes to plotHgtCss (opts.height minus axis / title space,
        // about 50px less than the canvas). Passing that to setSize would
        // shrink the canvas on the very first observer tick.
        plotRef.current.setSize({ width, height: CHART_HEIGHT });
      }
    };
    const triggerObs = new ResizeObserver((entries) =>
      handleResize(triggerPlotRef, entries),
    );
    const receiverObs = new ResizeObserver((entries) =>
      handleResize(receiverPlotRef, entries),
    );
    if (triggerRef.current) triggerObs.observe(triggerRef.current);
    if (receiverRef.current) receiverObs.observe(receiverRef.current);
    return () => {
      triggerObs.disconnect();
      receiverObs.disconnect();
    };
  }, []);

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
   * for the same axis; a right-click forces the PTP to the clicked
   * sample so the user can override the automatic peak detection on
   * noisy data.
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
      // Right-click: force the PTP to the click's nearest sample. This
      // lets the user override the automatic window-peak detection on
      // noisy data where the algorithm's choice is wrong.
      const ptpIdx = findNearestSampleIndex(time, dataX);
      emit(ptpIdx, "ptp");
    }
  }

  // Scrollbars enable only when a zoom level actually hides part of the
  // span; at 100% they stay mounted but disabled for a stable layout.
  const ratioNow = ZOOM_PERCENTAGES[zoomIndex] ?? ZOOM_PERCENTAGES[0];
  const spanPannable =
    !!display &&
    display.timeUs.length >= 2 &&
    display.timeUs[display.timeUs.length - 1] > display.timeUs[0];
  const scrollable = spanPannable && ratioNow < 1;

  /** Slider input: store the fraction and pan that chart only. */
  function handleScrollInput(
    axis: PickAxis,
    e: FormEvent<HTMLInputElement>,
  ) {
    const frac = Number(e.currentTarget.value) / SCROLL_STEPS;
    // Guard malformed events; windowFor clamps again defensively.
    if (!Number.isFinite(frac)) return;
    if (axis === "trigger") triggerFracRef.current = frac;
    else receiverFracRef.current = frac;
    applyScroll(axis);
  }

  /**
   * Pan one chart without rebuilding it: recompute that axis's visible
   * window from the latest refs and hand it to uPlot via setScale,
   * which redraws axes, series, and our marker draw hook in place.
   */
  function applyScroll(axis: PickAxis) {
    const plot =
      axis === "trigger" ? triggerPlotRef.current : receiverPlotRef.current;
    const disp = displayRef.current;
    if (!plot || !disp || disp.timeUs.length === 0) return;
    const t = disp.timeUs;
    const xMin = t[0];
    const fullSpan = t[t.length - 1] - xMin;
    const ratio =
      ZOOM_PERCENTAGES[zoomIndexRef.current] ?? ZOOM_PERCENTAGES[0];
    const frac =
      axis === "trigger" ? triggerFracRef.current : receiverFracRef.current;
    const win = windowFor(xMin, fullSpan, ratio, frac);
    // "time-us" matches the custom numeric scale key used by both plots.
    plot.setScale("time-us", { min: win.min, max: win.max });
  }

  return (
    <div className="chart-stack">
      <div className="chart-block">
        <div className="chart-host" ref={triggerRef} />
        <ChartScrollbar
          axis="trigger"
          barRef={triggerBarRef}
          disabled={!scrollable}
          onInput={handleScrollInput}
        />
      </div>
      <div className="chart-block">
        <div className="chart-host" ref={receiverRef} />
        <ChartScrollbar
          axis="receiver"
          barRef={receiverBarRef}
          disabled={!scrollable}
          onInput={handleScrollInput}
        />
      </div>
    </div>
  );
});

export default WaveformChart;

type ChartMarkers = {
  sts: PickPoint | null;
  ptp: PickPoint | null;
};

type ChartScrollbarProps = {
  axis: PickAxis;
  barRef: RefObject<HTMLInputElement>;
  disabled: boolean;
  onInput: (axis: PickAxis, e: FormEvent<HTMLInputElement>) => void;
};

/** Thin native range input that pans one chart's visible x window. */
function ChartScrollbar({ axis, barRef, disabled, onInput }: ChartScrollbarProps) {
  return (
    <input
      ref={barRef}
      type="range"
      className="chart-scrollbar"
      min={0}
      max={SCROLL_STEPS}
      step={1}
      defaultValue={0}
      disabled={disabled}
      aria-label={`Pan ${axis === "trigger" ? "Trigger" : "Receiver"} chart horizontally`}
      onInput={(e) => onInput(axis, e)}
    />
  );
}

/**
 * Compute the visible x window for a scroll fraction. The window keeps
 * the zoomed width (fullSpan * ratio); its left edge slides across the
 * pannable span [xMin, xMin + fullSpan]. frac is clamped to [0, 1].
 */
function windowFor(
  xMin: number,
  fullSpan: number,
  ratio: number,
  frac: number,
): { min: number; max: number } {
  const winW = fullSpan * ratio;
  const maxOffset = Math.max(0, fullSpan - winW);
  const f = Number.isFinite(frac) ? Math.min(1, Math.max(0, frac)) : 0;
  const offset = f * maxOffset;
  return { min: xMin + offset, max: xMin + offset + winW };
}

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
  winMin: number,
  winMax: number,
  values: number[],
  markers: ChartMarkers,
  width: number,
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
    width,
    height: CHART_HEIGHT,
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
      [timeUsScale]: { min: winMin, max: winMax, time: false },
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
  // Clip to the plot box so markers outside the scrolled window cannot
  // bleed over the axes or gutters.
  ctx.beginPath();
  ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
  ctx.clip();

  // STS marker: red vertical line with a 2-line label (kind on line 1,
  // time value on line 2) anchored near the top axis.
  if (markers.sts) {
    // valToPos(dataValue, scaleKey, canvasPixels=true) → canvas pixel x.
    const x = u.valToPos(markers.sts.timeUs, "time-us", true);
    ctx.strokeStyle = "#d62728";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.fillStyle = "#d62728";
    ctx.fillText("STS", x + 4, top + 4);
    ctx.fillText(`${formatPick(markers.sts)} µs`, x + 4, top + 18);
  }
  // PTP marker: green vertical line, two-line label pushed below STS so
  // the two annotations never visually collide.
  if (markers.ptp) {
    const x = u.valToPos(markers.ptp.timeUs, "time-us", true);
    ctx.strokeStyle = "#2ca02c";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.fillStyle = "#2ca02c";
    ctx.fillText("PTP", x + 4, top + 34);
    ctx.fillText(`${formatPick(markers.ptp)} µs`, x + 4, top + 48);
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