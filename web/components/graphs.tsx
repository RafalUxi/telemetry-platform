'use client';

import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useEffect, useRef } from 'react';

type Props = {
  data: uPlot.AlignedData;
  label: string;
  stroke: string;
};

export default function Graph({ data, label, stroke }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);

  useEffect(() => {
    if (box.current === null) return;

    const options: uPlot.Options = {
      width: box.current.clientWidth,
      height: box.current.clientHeight,
      padding: [8, 8, 0, 0],
      legend: { show: false },
      cursor: { y: false },
      axes: [
        { stroke: '#a1a1aa', grid: { stroke: '#27272a' }, ticks: { stroke: '#27272a' } },
        { stroke: '#a1a1aa', grid: { stroke: '#27272a' }, ticks: { stroke: '#27272a' } },
      ],
      series: [{}, { label, stroke, width: 2 }],
    };

    chart.current = new uPlot(options, data, box.current);

    const observer = new ResizeObserver(() => {
      if (box.current === null || chart.current === null) return;
      chart.current.setSize({
        width: box.current.clientWidth,
        height: box.current.clientHeight,
      });
    });
    observer.observe(box.current);

    return () => {
      observer.disconnect();
      chart.current?.destroy();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setData(data);
  }, [data]);

  return <div ref={box} className="absolute top-14/100 left-0 rounded-2xl h-82/100 w-full" />;
}
