import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import UPlot from "uplot";
import {
  findNearestSampleIndex,
  findReceiverPtpIndex,
  findTriggerPtpIndex,
} from "../lib/picker";
import { resampleOnto } from "../lib/waveform";
import { ZOOM_PERCENTAGES, type PrevOverlay } from "../types";

/**
 * Fallback CSS-pixel height for both plots, used only when the flex
 * sized host cannot be measured yet. The real height comes from the
 * host's clientHeight at build time and from ResizeObserver updates
 * afterwards, so the charts share the viewport-driven layout height.
 */
const FALLBACK_CHART_HEIGHT = 284;

/** Gap between the cursor crosshair point and the bare readout text. */
const TOOLTIP_GAP_PX = 6;

/** Gap between a pick marker's vertical line and its right-aligned label. */
const MARKER_LABEL_GAP_PX = 7;

/** Compact axis value font shared by both plots (uPlot default is 12px). */
const AXIS_FONT =
  '11px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Axis caption font ("Time (µs)", "Trigger with gain (V)", ...), bold
 * and enlarged so the labels stay readable without the old DOM titles. */
const AXIS_LABEL_FONT = 'bold 14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
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
  /**
   * Last confirmed analysis to draw faded behind both live traces as a
   * reference (traces plus dashed pick guides and Δ labels); null
   * renders nothing. Frozen at its capture-time scaling.
   */
  prevOverlay?: PrevOverlay | null;
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
  { display, picker, onPick, peakWidthUs, dTUs, zoomIndex, prevOverlay },
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
  // Scroll-proxy containers whose native horizontal bar pans the chart;
  // programmatic resets (Z key) write scrollLeft directly.
  const triggerBarRef = useRef<HTMLDivElement>(null);
  const receiverBarRef = useRef<HTMLDivElement>(null);
  // Measured host width drives the scrollbar spacer so the native thumb
  // size reflects the visible-to-total ratio.
  const [trackW, setTrackW] = useState(0);
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

    // Sync the uncontrolled bars' scroll positions from the refs (e.g.
    // after a Z reset); the resulting scroll event recomputes the same
    // fraction, so no pan feedback loop occurs.
    const syncBar = (bar: HTMLDivElement | null, frac: number) => {
      if (!bar) return;
      const maxScroll = bar.scrollWidth - bar.clientWidth;
      if (maxScroll > 0) bar.scrollLeft = frac * maxScroll;
    };
    syncBar(triggerBarRef.current, triggerFracRef.current);
    syncBar(receiverBarRef.current, receiverFracRef.current);

    // Receiver signals are typically a few mV, so the y axis is shown in
    // mV for readability. Scale the V array into mV once here and pass
    // the same scaled array to both the uPlot data (which drives the
    // rendered trace and the auto-ranged y axis) and buildOptions
    // (which uses it only for an internal y-bounds sanity check).
    // Internal DisplayWaveform.receiverV stays in V so PickPoint.voltage,
    // the CSV exporter, and click snapping keep their V-based semantics.
    const receiverVm = display.receiverV.map((v) => v * 1000);

    // Overlay series: resample the stored previous trace onto the
    // current axis; nulls outside its span render as uPlot gaps. The
    // receiver overlay shares the live trace's mV scaling.
    const prevDisp = prevOverlay?.display ?? null;
    const hasPrev = !!prevDisp && prevDisp.timeUs.length > 0;
    const prevTx = hasPrev
      ? resampleOnto(time, prevDisp!.timeUs, prevDisp!.transmitterV)
      : null;
    const prevRxRaw = hasPrev
      ? resampleOnto(time, prevDisp!.timeUs, prevDisp!.receiverV)
      : null;
    const prevRx = prevRxRaw
      ? prevRxRaw.map((v) => (v == null ? null : v * 1000))
      : null;

    // uPlot.AlignedData: first array is the shared x-axis, later arrays
    // are the y values per series (optional faded overlay last).
    const triggerData: UPlot.AlignedData = [
      time,
      display.transmitterV,
      ...(prevTx ? [prevTx] : []),
    ];
    const receiverData: UPlot.AlignedData = [
      time,
      receiverVm,
      ...(prevRx ? [prevRx] : []),
    ];

    const triggerMarkers = {
      sts: picker.triggerSts,
      ptp: picker.triggerPtp,
      // Reference pick times drive dashed guides and Δ label lines.
      prevStsTimeUs:
        hasPrev ? prevOverlay!.picks.triggerSts?.timeUs ?? null : null,
      prevPtpTimeUs:
        hasPrev ? prevOverlay!.picks.triggerPtp?.timeUs ?? null : null,
    };
    const receiverMarkers = {
      sts: picker.receiverSts,
      ptp: picker.receiverPtp,
      prevStsTimeUs:
        hasPrev ? prevOverlay!.picks.receiverSts?.timeUs ?? null : null,
      prevPtpTimeUs:
        hasPrev ? prevOverlay!.picks.receiverPtp?.timeUs ?? null : null,
    };

    // Hosts are flex-sized by CSS; read their real pixel heights so the
    // canvases fill the viewport-driven boxes. Falls back only when a
    // host is not measurable (e.g. display:none on first commit).
    const trigH =
      triggerRef.current?.clientHeight || FALLBACK_CHART_HEIGHT;
    const recvH =
      receiverRef.current?.clientHeight || FALLBACK_CHART_HEIGHT;

    const triggerOpts = buildOptions(
      "Trigger with gain (V)",
      "V",
      trigWin.min,
      trigWin.max,
      trigH,
      display.transmitterV,
      triggerMarkers,
      triggerRef.current?.clientWidth ?? 800,
      prevTx ?? undefined,
    );
    const receiverOpts = buildOptions(
      "Receiver (mV)",
      "mV",
      recvWin.min,
      recvWin.max,
      recvH,
      receiverVm,
      receiverMarkers,
      receiverRef.current?.clientWidth ?? 800,
      prevRx ?? undefined,
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
  }, [display, picker, zoomIndex, prevOverlay]);

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
      // Host box drives BOTH axes: width tracks the column width and
      // height tracks the viewport-fit flex layout. Skip the 0-size
      // transition frames some browsers emit before layout settles;
      // setSize with 0 would crash uPlot's canvas math. Reading the
      // HOST's contentRect is correct here — plot.rect returns the
      // .u-over bbox, which excludes axis/title space and would shrink
      // the canvas every tick.
      const rect = entries[0]?.contentRect;
      const width = rect?.width;
      const height = rect?.height;
      // Publish integer-px width changes for spacer sizing; the
      // functional update skips renders while unchanged.
      if (width != null && width > 0) {
        const px = Math.round(width);
        setTrackW((prev) => (prev === px ? prev : px));
      }
      if (
        plotRef.current &&
        width != null && width > 0 &&
        height != null && height > 0
      ) {
        plotRef.current.setSize({ width, height });
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
  // span; at 100% they stay mounted but inert for a stable layout.
  const ratioNow = ZOOM_PERCENTAGES[zoomIndex] ?? ZOOM_PERCENTAGES[0];
  const spanPannable =
    !!display &&
    display.timeUs.length >= 2 &&
    display.timeUs[display.timeUs.length - 1] > display.timeUs[0];
  const scrollable = spanPannable && ratioNow < 1;
  // Spacer width makes the native thumb proportional to the visible
  // share; at 100% it collapses to the track width (no thumb).
  const spacerWidth =
    scrollable && trackW > 0 ? Math.round(trackW / ratioNow) : "100%";

  /** Native scroll event: derive the window fraction and pan that chart. */
  function handleBarScroll(axis: PickAxis, el: HTMLDivElement) {
    const maxScroll = el.scrollWidth - el.clientWidth;
    // Not actually scrollable (100% zoom): ignore stray events.
    if (maxScroll <= 0) return;
    const frac = el.scrollLeft / maxScroll;
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
        {/* No DOM chart title: the freed height goes straight to the
            plots, and the y-axis captions identify each trace. */}
        <div className="chart-host" ref={triggerRef} />
        <ChartScrollbar
          axis="trigger"
          barRef={triggerBarRef}
          disabled={!scrollable}
          spacerWidth={spacerWidth}
          onScroll={handleBarScroll}
        />
      </div>
      <div className="chart-block">
        <div className="chart-host" ref={receiverRef} />
        <ChartScrollbar
          axis="receiver"
          barRef={receiverBarRef}
          disabled={!scrollable}
          spacerWidth={spacerWidth}
          onScroll={handleBarScroll}
        />
      </div>
    </div>
  );
});

export default WaveformChart;

type ChartMarkers = {
  sts: PickPoint | null;
  ptp: PickPoint | null;
  /** Reference-run pick times driving dashed guides and Δ label lines. */
  prevStsTimeUs: number | null;
  prevPtpTimeUs: number | null;
};

type ChartScrollbarProps = {
  axis: PickAxis;
  barRef: RefObject<HTMLDivElement>;
  disabled: boolean;
  /** Spacer px width; the string "100%" collapses the thumb at 100%. */
  spacerWidth: number | string;
  onScroll: (axis: PickAxis, el: HTMLDivElement) => void;
};

/**
 * Real overflow container whose oversized spacer surfaces the browser's
 * native horizontal scrollbar — the same UI as every other scroll
 * region in the app. Scrolling it pans the chart via onScroll.
 */
function ChartScrollbar({
  axis,
  barRef,
  disabled,
  spacerWidth,
  onScroll,
}: ChartScrollbarProps) {
  return (
    <div
      ref={barRef}
      className={`chart-scrollbar${disabled ? " is-disabled" : ""}`}
      aria-label={`Pan ${axis === "trigger" ? "Trigger" : "Receiver"} chart horizontally`}
      onScroll={(e) => onScroll(axis, e.currentTarget)}
    >
      <div
        className="chart-scrollbar-spacer"
        style={{ width: spacerWidth }}
      />
    </div>
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
  yAxisLabel: string,
  unit: string,
  winMin: number,
  winMax: number,
  height: number,
  values: number[],
  markers: ChartMarkers,
  width: number,
  /** Faded previous-trace series; omitted when the overlay is off. */
  prevValues?: (number | null)[],
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
    width,
    height,
    // Native legend is off: a bare two-line cursor tooltip replaces it.
    // uPlot runs title-less so root height == canvas height and the
    // plot can never spill over the scrollbar below it.
    legend: { show: false },
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
      // Faded copy of the previously confirmed trace, same hue at ~30%
      // alpha so it reads as a reference rather than live data. uPlot
      // skips its null entries, leaving gaps outside the stored span.
      ...(prevValues
        ? [
            {
              label: "Previous",
              scale: "y",
              width: 1,
              stroke: "rgba(31, 119, 180, 0.30)",
              points: { show: false },
            } as UPlot.Series,
          ]
        : []),
    ],
    axes: [
      {
        scale: timeUsScale,
        label: "Time (µs)",
        // uPlot defaults burn ~80 px below the plot (size 50 + label 30).
        // Fixed compact heights for the tick-value row (size) and the
        // caption strip (labelSize) hand that space back to the trace.
        size: 22,
        gap: 2,
        font: AXIS_FONT,
        labelSize: 18,
        labelGap: 1,
        labelFont: AXIS_LABEL_FONT,
        // uPlot's default axis values render as epoch-derived dates.
        // Override values() to format numeric µs ticks ourselves.
        values: (_self, splits) => splits.map((v) => formatMicros(v)),
        grid: { show: true, stroke: "#dddddd", width: 1 },
        ticks: { show: true, stroke: "#cccccc", width: 1, size: 4 },
      },
      {
        scale: "y",
        label: yAxisLabel,
        // Narrow left gutter mirrors the slim bottom axis so the trace
        // area widens; the rotated caption needs a wider strip than the
        // horizontal one or its bold glyphs get clipped mid-letter.
        size: 36,
        gap: 2,
        font: AXIS_FONT,
        labelSize: 24,
        labelGap: 1,
        labelFont: AXIS_LABEL_FONT,
        grid: { show: true, stroke: "#dddddd", width: 1 },
        ticks: { show: true, stroke: "#cccccc", width: 1, size: 4 },
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
      // and remain part of the same canvas (PNG export).
      draw: [(u) => drawMarkers(u, markers)],
      // uPlot fires this on every cursor move (and on leave with
      // left/top = -10); it drives the bare cursor tooltip.
      setCursor: [makeCursorTooltip(unit)],
    },
  };
}

/**
 * Draw faint dashed vertical guides at the reference run's pick times
 * first (overlay only), then the live STS (red) and PTP (green) marker
 * lines with time labels beside them. When a reference pick exists for
 * a slot, its label gains a third "(Δ x.x µs)" line reporting how far
 * the live pick sits from the reference one — mirroring the Python
 * analyzer's annotation style.
 */
function drawMarkers(u: UPlot, markers: ChartMarkers) {
  const hasAny =
    markers.sts ||
    markers.ptp ||
    markers.prevStsTimeUs != null ||
    markers.prevPtpTimeUs != null;
  if (!hasAny) return;
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

  // Reference guides: each keeps its live pick's hue at low alpha and
  // dotted so it cannot be mistaken for a live pick; drawn before the
  // live elements so they read as background guides.
  ctx.setLineDash([4, 4]);
  if (markers.prevStsTimeUs != null) {
    // Faded red, matching the live STS line (#d62728).
    ctx.strokeStyle = "rgba(214, 39, 40, 0.35)";
    const x = u.valToPos(markers.prevStsTimeUs, "time-us", true);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }
  if (markers.prevPtpTimeUs != null) {
    // Faded green, matching the live PTP line (#2ca02c).
    ctx.strokeStyle = "rgba(44, 160, 44, 0.35)";
    const x = u.valToPos(markers.prevPtpTimeUs, "time-us", true);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const LINE_H = 14;
  const gx = -MARKER_LABEL_GAP_PX;

  /**
   * Draw one pick's label stack beside its vertical marker line. Lines
   * default to right-aligned ending left of the line, but when the
   * widest line would spill past the plot's left edge they flip to
   * left-aligned right of the line so nothing gets clipped.
   */
  function drawLabelStack(x: number, topY: number, lines: string[]) {
    // Widest line decides the clip check; shorter lines fit inside it.
    let widest = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > widest) widest = w;
    }
    // Flip only while the marker line itself is on-screen; fully
    // panned-out picks keep right alignment so the clip hides them.
    const fitsLeft = x < u.bbox.left || x + gx - widest >= u.bbox.left;
    ctx.textAlign = fitsLeft ? "right" : "left";
    // Mirrored gap keeps the same breathing room on either side.
    const lx = fitsLeft ? x + gx : x + MARKER_LABEL_GAP_PX;
    let ly = topY;
    for (const line of lines) {
      ctx.fillText(line, lx, ly);
      ly += LINE_H;
    }
  }

  // STS marker: red vertical line with its label stack pinned near the
  // top of the plot.
  if (markers.sts) {
    const x = u.valToPos(markers.sts.timeUs, "time-us", true);
    ctx.strokeStyle = "#d62728";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.fillStyle = "#d62728";
    const lines = ["STS", `${formatPick(markers.sts)} µs`];
    if (markers.prevStsTimeUs != null) {
      const d = markers.sts.timeUs - markers.prevStsTimeUs;
      lines.push(`(Δ ${fmtDelta(d)} µs)`);
    }
    drawLabelStack(x, top + 4, lines);
  }
  // PTP marker: green vertical line whose label stack is anchored to
  // the plot's bottom edge (6 px inset). A Δ line grows the stack
  // upward, so the bottom edge stays pinned regardless of line count.
  if (markers.ptp) {
    const x = u.valToPos(markers.ptp.timeUs, "time-us", true);
    ctx.strokeStyle = "#2ca02c";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.fillStyle = "#2ca02c";
    const lines = ["PTP", `${formatPick(markers.ptp)} µs`];
    if (markers.prevPtpTimeUs != null) {
      const d = markers.ptp.timeUs - markers.prevPtpTimeUs;
      lines.push(`(Δ ${fmtDelta(d)} µs)`);
    }
    drawLabelStack(x, bottom - 6 - lines.length * LINE_H, lines);
  }
  ctx.restore();
}

/** Signed delta text; explicit sign keeps the shift direction obvious. */
function fmtDelta(d: number): string {
  return `${d >= 0 ? "+" : "-"}${Math.abs(d).toFixed(1)}`;
}

/** Format a pick's timeUs to one decimal place; "--" for unset points. */
function formatPick(point: PickPoint | null): string {
  return point ? point.timeUs.toFixed(1) : "--";
}

/**
 * Build the per-chart setCursor handler that shows a bare two-line
 * readout ("12.34 (us)" / "4.56 (V)") hugging the cursor crosshair.
 * uPlot calls this on every mouse move; we only write textContent and
 * transform/opacity, so there is no layout thrash or React involvement.
 * The tooltip div is created lazily once per plot instance; it dies
 * with the root when plots are rebuilt. No box chrome by design.
 */
function makeCursorTooltip(unit: string) {
  let tip: HTMLDivElement | null = null;
  return (u: UPlot) => {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "cursor-tooltip";
      // Anchor inside .u-over: its origin is exactly the plot area, so
      // cursor coords map 1:1 without axis/title offsets.
      u.over.appendChild(tip);
    }
    const { left, top } = u.cursor;
    const idx = u.cursor.idx ?? -1;
    // Off-plot (-10) or no snapped sample: hide instead of freezing.
    if (
      left == null ||
      top == null ||
      left < 0 ||
      top < 0 ||
      idx < 0 ||
      !u.data[1] ||
      idx >= u.data[1].length
    ) {
      tip.style.opacity = "0";
      return;
    }
    const tVal = u.data[0]?.[idx];
    const vVal = u.data[1]?.[idx];
    tip.textContent = "";
    // Two plain lines with units only, e.g. "12.34 (us)" over "4.56 (V)".
    tip.append(
      `${fmtHover(tVal)} (us)`,
      document.createElement("br"),
      `${fmtHover(vVal)} (${unit})`,
    );
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    // Default: hug the crosshair intersection to its upper-right...
    let x = left + TOOLTIP_GAP_PX;
    let y = top - h - TOOLTIP_GAP_PX;
    // ...flip to the upper-left near the right edge of the plot...
    if (x + w > u.bbox.width) {
      x = left - w - TOOLTIP_GAP_PX;
    }
    // ...and clamp vertically inside the plot area (top edge wins).
    y = Math.max(
      TOOLTIP_GAP_PX,
      Math.min(y, u.bbox.height - h - TOOLTIP_GAP_PX),
    );
    tip.style.transform = `translate(${x}px, ${y}px)`;
    tip.style.opacity = "1";
  };
}

/** Compact hover formatting: two decimals covers µs and V/mV ranges. */
function fmtHover(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? v.toFixed(2) : "--";
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