import type { CSSProperties, ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';

/**
 * Drag-to-reorder list. Each row gets a `handle` element to place anywhere in its layout; only the
 * handle starts a drag, so scrolling the page with a finger still works. Keyboard users focus the
 * handle, press Space, use the arrow keys and press Space again.
 * `ids` are the stable row ids in display order; `onMove(from, to)` receives indexes.
 */
export function SortableList({ ids, onMove, children }: { ids: string[]; onMove: (from: number, to: number) => void; children: (index: number, handle: ReactNode) => ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onMove(from, to);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map((id, i) => (
          <Row key={id} id={id}>
            {(handle) => children(i, handle)}
          </Row>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function Row({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  // Vertical only: ignore any sideways movement of the pointer.
  const style: CSSProperties = {
    transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };
  const handle = (
    <button
      type="button"
      aria-label="Drag to reorder"
      className="min-h-tap min-w-tap shrink-0 cursor-grab touch-none select-none text-xl leading-none text-muted active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      ⠿
    </button>
  );
  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
}
