import { addMilliseconds, differenceInMilliseconds } from "date-fns";
import type { CSSProperties } from "react";
import { useCallback, useMemo } from "react";

import type {
	GetDateFromScreenX,
	GetRelevanceFromDragEvent,
	GetRelevanceFromResizeEvent,
	MillisecondsToPixels,
	OnPanEnd,
	PixelsToMilliseconds,
	Relevance,
	Timeframe,
	TimelineBag,
	UseTimelineProps,
} from "../types";
import { useWheelStrategy } from "../utils/panStrategies";

import useElementRef from "./useElementRef";

const style: CSSProperties = {
	display: "flex",
	overflow: "hidden",
	position: "relative",
	flexDirection: "column",
};

const DEFAULT_RESIZE_HANDLE_WIDTH = 20;

export default function useTimeline({
	timeframe,
	onResizeEnd,
	onResizeStart,
	onResizeMove,
	overlayed = false,
	onTimeframeChanged,
	timeframeGridSizeDefinition,
	usePanStrategy = useWheelStrategy,
	resizeHandleWidth = DEFAULT_RESIZE_HANDLE_WIDTH,
}: UseTimelineProps): TimelineBag {
	const timeframeStart = timeframe.start.getTime();
	const timeframeEnd = timeframe.end.getTime();

	const {
		ref: timelineRef,
		setRef: setTimelineRef,
		width: timelineWidth,
		direction: timelineDirection,
	} = useElementRef();

	const {
		ref: sidebarRef,
		setRef: setSidebarRef,
		width: sidebarWidth,
	} = useElementRef();

	const timelineViewportWidth = timelineWidth - sidebarWidth;

	const timeframeGridSize = useMemo(() => {
		if (Array.isArray(timeframeGridSizeDefinition)) {
			const gridSizes = timeframeGridSizeDefinition;

			const timeframeSize = timeframeEnd - timeframeStart;

			const sortedTimeframeGridSizes = [...gridSizes];
			sortedTimeframeGridSizes.sort((a, b) => a.value - b.value);

			return sortedTimeframeGridSizes.find(
				(curr) =>
					!curr.maxTimeframeSize || timeframeSize < curr.maxTimeframeSize,
			)?.value;
		}

		return timeframeGridSizeDefinition;
	}, [timeframeStart, timeframeEnd, timeframeGridSizeDefinition]);

	const millisecondsToPixels = useCallback<MillisecondsToPixels>(
		(milliseconds: number, customTimeframe?: Timeframe) => {
			const start = customTimeframe?.start ?? timeframeStart;
			const end = customTimeframe?.end ?? timeframeEnd;

			const msToPixel =
				timelineViewportWidth / differenceInMilliseconds(end, start);
			return milliseconds * msToPixel;
		},
		[timeframeStart, timeframeEnd, timelineViewportWidth],
	);

	const pixelsToMilliseconds = useCallback<PixelsToMilliseconds>(
		(pixels: number, customTimeframe?: Timeframe) => {
			const start = customTimeframe?.start ?? timeframeStart;
			const end = customTimeframe?.end ?? timeframeEnd;

			const pixelToMs =
				differenceInMilliseconds(end, start) / timelineViewportWidth;
			return pixels * pixelToMs;
		},
		[timeframeStart, timeframeEnd, timelineViewportWidth],
	);

	const snapDateToTimeframeGrid = useCallback(
		(date: Date) => {
			if (!timeframeGridSize) return date;

			return new Date(
				Math.round(date.getTime() / timeframeGridSize) * timeframeGridSize,
			);
		},
		[timeframeGridSize],
	);

	const getDateFromScreenX = useCallback<GetDateFromScreenX>(
		(screenX) => {
			const side = timelineDirection === "rtl" ? "right" : "left";

			const timelineSideX =
				(timelineRef.current?.getBoundingClientRect()[side] || 0) +
				sidebarWidth * (timelineDirection === "rtl" ? -1 : 1);

			const deltaX = screenX - timelineSideX;

			const deltaInMilliseconds =
				pixelsToMilliseconds(deltaX) * (timelineDirection === "rtl" ? -1 : 1);

			return snapDateToTimeframeGrid(
				addMilliseconds(timeframeStart, deltaInMilliseconds),
			);
		},
		[
			timelineRef,
			sidebarWidth,
			timeframeStart,
			timelineDirection,
			pixelsToMilliseconds,
			snapDateToTimeframeGrid,
		],
	);

	const getRelevanceFromDragEvent = useCallback<GetRelevanceFromDragEvent>(
		(event) => {
			const side = timelineDirection === "rtl" ? "right" : "left";
			const itemX = event.active.rect.current.translated?.[side] || 0;

			const start = getDateFromScreenX(itemX);

			if (event.active.data.current?.relevance) {
				const { start: prevItemStart, end: prevItemEnd } = event.active.data
					.current.relevance as Relevance;

				const itemDurationInMs = differenceInMilliseconds(
					prevItemEnd,
					prevItemStart,
				);

				const end = snapDateToTimeframeGrid(
					addMilliseconds(start, itemDurationInMs),
				);

				return { start, end };
			} else if (event.active.data.current?.duration) {
				const itemDurationInMs = event.active.data.current.duration as number;

				const end = snapDateToTimeframeGrid(
					addMilliseconds(start, itemDurationInMs),
				);

				return { start, end };
			}

			return null;
		},
		[getDateFromScreenX, snapDateToTimeframeGrid, timelineDirection],
	);

	const getRelevanceFromResizeEvent = useCallback<GetRelevanceFromResizeEvent>(
		(event) => {
			if (event.active.data.current?.relevance) {
				const prevRelevance = event.active.data.current.relevance;
				const deltaInMilliseconds = pixelsToMilliseconds(event.delta.x);

				const updatedRelevance: Relevance = {
					...prevRelevance,
				};

				updatedRelevance[event.direction] = snapDateToTimeframeGrid(
					addMilliseconds(prevRelevance[event.direction], deltaInMilliseconds),
				);

				return updatedRelevance;
			}

			return null;
		},
		[pixelsToMilliseconds, snapDateToTimeframeGrid],
	);

	const onPanEnd = useCallback<OnPanEnd>(
		(event) => {
			const deltaXInMilliseconds =
				pixelsToMilliseconds(event.deltaX) *
				(timelineDirection === "rtl" ? -1 : 1);
			const deltaYInMilliseconds =
				pixelsToMilliseconds(event.deltaY) *
				(timelineDirection === "rtl" ? -1 : 1);

			const timeframeDuration = timeframeEnd - timeframeStart;

			const startBias = event.clientX
				? differenceInMilliseconds(
						timeframeStart,
						getDateFromScreenX(event.clientX),
					) / timeframeDuration
				: 1;
			const endBias = event.clientX
				? differenceInMilliseconds(
						getDateFromScreenX(event.clientX),
						timeframeEnd,
					) / timeframeDuration
				: 1;

			const startDelta =
				deltaYInMilliseconds * startBias + deltaXInMilliseconds;
			const endDelta = -deltaYInMilliseconds * endBias + deltaXInMilliseconds;

			onTimeframeChanged((prev) => ({
				start: addMilliseconds(prev.start, startDelta),
				end: addMilliseconds(prev.end, endDelta),
			}));
		},
		[
			timeframeEnd,
			timeframeStart,
			timelineDirection,
			getDateFromScreenX,
			onTimeframeChanged,
			pixelsToMilliseconds,
		],
	);

	usePanStrategy(timelineRef, onPanEnd);

	const value = useMemo<TimelineBag>(
		() => ({
			style,
			timeframe,
			overlayed,
			onPanEnd,
			onResizeEnd,
			onResizeMove,
			onResizeStart,
			sidebarRef,
			setSidebarRef,
			sidebarWidth,
			resizeHandleWidth,
			pixelsToMilliseconds,
			millisecondsToPixels,
			timelineRef,
			setTimelineRef,
			timelineDirection,
			timeframeGridSize,
			getDateFromScreenX,
			getRelevanceFromDragEvent,
			getRelevanceFromResizeEvent,
		}),
		[
			timeframe,
			overlayed,
			onPanEnd,
			onResizeEnd,
			onResizeMove,
			onResizeStart,
			sidebarRef,
			setSidebarRef,
			sidebarWidth,
			resizeHandleWidth,
			pixelsToMilliseconds,
			millisecondsToPixels,
			timelineRef,
			setTimelineRef,
			timelineDirection,
			timeframeGridSize,
			getDateFromScreenX,
			getRelevanceFromDragEvent,
			getRelevanceFromResizeEvent,
		],
	);

	return value;
}
