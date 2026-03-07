'use client'

import * as React from 'react'
import { GripVerticalIcon } from 'lucide-react'
import * as ResizablePrimitive from 'react-resizable-panels'

import { cn } from '@/lib/utils'

type ResizableDirection = 'horizontal' | 'vertical'
type ResizablePrimitiveExports = Record<string, unknown>

type ResizablePanelGroupProps = React.ComponentProps<'div'> & {
  autoSaveId?: string | null
  direction?: ResizableDirection
  id?: string | null
  keyboardResizeBy?: number | null
  onLayout?: ((layout: number[]) => void) | null
  onLayoutChange?: ((layout: Record<string, number>) => void) | undefined
  onLayoutChanged?: ((layout: Record<string, number>) => void) | undefined
  storage?: {
    getItem(name: string): string | null
    setItem(name: string, value: string): void
  }
}

type ResizablePanelProps = React.ComponentProps<'div'> & {
  collapsedSize?: number | string
  collapsible?: boolean
  defaultSize?: number | string
  id?: string | null
  maxSize?: number | string
  minSize?: number | string
  onCollapse?: () => void
  onExpand?: () => void
  onResize?: ((size: number, prevSize?: number) => void) | undefined
  order?: number
}

type ResizableHandleProps = React.ComponentProps<'div'> & {
  disabled?: boolean
  hitAreaMargins?: {
    coarse?: number
    fine?: number
  }
  id?: string | null
  onDragging?: ((isDragging: boolean) => void) | undefined
  withHandle?: boolean
}

const resizablePrimitiveExports = ResizablePrimitive as ResizablePrimitiveExports

const ResizablePanelGroupPrimitive = (
  resizablePrimitiveExports.Group ?? resizablePrimitiveExports.PanelGroup
) as React.ComponentType<Record<string, unknown>>

const ResizablePanelPrimitive = ResizablePrimitive.Panel as React.ComponentType<
  Record<string, unknown>
>

const ResizableHandlePrimitive = (
  resizablePrimitiveExports.Separator ??
  resizablePrimitiveExports.PanelResizeHandle
) as React.ComponentType<Record<string, unknown>>

function ResizablePanelGroup({
  className,
  direction = 'horizontal',
  ...props
}: ResizablePanelGroupProps) {
  const primitiveProps = resizablePrimitiveExports.Group
    ? { orientation: direction, ...props }
    : { direction, ...props }

  return (
    <ResizablePanelGroupPrimitive
      data-slot="resizable-panel-group"
      className={cn(
        'flex h-full w-full',
        direction === 'vertical' && 'flex-col',
        className,
      )}
      {...primitiveProps}
    />
  )
}

function ResizablePanel({
  ...props
}: ResizablePanelProps) {
  return <ResizablePanelPrimitive data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizableHandleProps) {
  return (
    <ResizableHandlePrimitive
      data-slot="resizable-handle"
      className={cn(
        'bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden aria-[orientation=vertical]:h-px aria-[orientation=vertical]:w-full aria-[orientation=vertical]:after:left-0 aria-[orientation=vertical]:after:h-1 aria-[orientation=vertical]:after:w-full aria-[orientation=vertical]:after:translate-x-0 aria-[orientation=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[aria-orientation=vertical]>div]:rotate-90 [&[data-panel-group-direction=vertical]>div]:rotate-90',
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizableHandlePrimitive>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
