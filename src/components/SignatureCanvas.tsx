'use client';

import { useEffect, useRef } from 'react';
import { Box, Button, Group, Modal, Stack } from '@mantine/core';

function dataUrlToFile(dataUrl: string): File {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], 'signature.png', { type: mime });
}

export function SignatureModal({
  opened,
  onClose,
  onSave,
}: {
  opened: boolean;
  onClose: () => void;
  onSave: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (!opened) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [opened]);

  function getPos(e: React.MouseEvent | React.TouchEvent, c: HTMLCanvasElement) {
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width;
    const sy = c.height / r.height;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy };
    }
    return {
      x: ((e as React.MouseEvent).clientX - r.left) * sx,
      y: ((e as React.MouseEvent).clientY - r.top) * sy,
    };
  }

  function start(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    drawing.current = true;
    const p = getPos(e, c);
    c.getContext('2d')!.beginPath();
    c.getContext('2d')!.moveTo(p.x, p.y);
  }

  function move(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!drawing.current) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const p = getPos(e, c);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end() { drawing.current = false; }

  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  }

  function save() {
    const c = canvasRef.current;
    if (!c) return;
    onSave(dataUrlToFile(c.toDataURL('image/png')));
    onClose();
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Add signature" size="sm" centered>
      <Stack>
        <Box
          style={{
            border: '1.5px solid var(--mantine-color-gray-3)',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#fafafa',
          }}
        >
          <canvas
            ref={canvasRef}
            width={480}
            height={200}
            style={{ width: '100%', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={end}
            onMouseLeave={end}
            onTouchStart={start}
            onTouchMove={move}
            onTouchEnd={end}
          />
        </Box>
        <Group justify="space-between">
          <Button variant="subtle" color="gray" size="sm" onClick={clear}>Clear</Button>
          <Button size="sm" onClick={save}>Confirm signature</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
