import type { DiagramNode, DiagramEdge } from "./types";

/** Anchor points on a node box. */
function anchors(n: DiagramNode) {
  return {
    top:    { x: n.x + n.w / 2, y: n.y },
    bottom: { x: n.x + n.w / 2, y: n.y + n.h },
    left:   { x: n.x,           y: n.y + n.h / 2 },
    right:  { x: n.x + n.w,     y: n.y + n.h / 2 },
    // Offset anchors for multi-path nodes
    bottomLeft:  { x: n.x + n.w * 0.25, y: n.y + n.h },
    bottomRight: { x: n.x + n.w * 0.75, y: n.y + n.h },
    topLeft:     { x: n.x + n.w * 0.35, y: n.y },
    topRight:    { x: n.x + n.w * 0.65, y: n.y },
  };
}

interface PathResult {
  d: string;
  labelX: number;
  labelY: number;
  labelRotate?: number;
}

/**
 * Compute the SVG path `d` attribute and label position for an edge,
 * based on the spatial relationship between the source and target nodes.
 */
export function computeEdgePath(
  edge: DiagramEdge,
  nodeMap: Map<string, DiagramNode>,
): PathResult | null {
  const src = nodeMap.get(edge.from);
  const dst = nodeMap.get(edge.to);
  if (!src || !dst) return null;

  const sa = anchors(src);
  const da = anchors(dst);

  // Determine general direction from source center to dest center
  const srcCx = src.x + src.w / 2;
  const srcCy = src.y + src.h / 2;
  const dstCx = dst.x + dst.w / 2;
  const dstCy = dst.y + dst.h / 2;
  const dx = dstCx - srcCx;
  const dy = dstCy - srcCy;

  // Primarily vertical flow (top to bottom)
  if (Math.abs(dy) > Math.abs(dx)) {
    if (dy > 0) {
      // Source is above destination
      const start = sa.bottom;
      const end = da.top;

      // Check if roughly aligned vertically (same column)
      if (Math.abs(dx) < 40) {
        // Straight vertical line
        const midY = (start.y + end.y) / 2;
        return {
          d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
          labelX: Math.min(start.x, end.x) - 18,
          labelY: midY,
        };
      }

      // Curved path — bezier from top to bottom with horizontal offset
      const cpY1 = start.y + (end.y - start.y) * 0.3;
      const cpY2 = start.y + (end.y - start.y) * 0.7;
      return {
        d: `M ${start.x} ${start.y} C ${start.x} ${cpY1}, ${end.x} ${cpY2}, ${end.x} ${end.y}`,
        labelX: (start.x + end.x) / 2,
        labelY: (start.y + end.y) / 2,
      };
    } else {
      // Source is below destination (unusual — bottom to top)
      const start = sa.top;
      const end = da.bottom;
      const cpY1 = start.y - Math.abs(dy) * 0.3;
      const cpY2 = end.y + Math.abs(dy) * 0.3;
      return {
        d: `M ${start.x} ${start.y} C ${start.x} ${cpY1}, ${end.x} ${cpY2}, ${end.x} ${end.y}`,
        labelX: (start.x + end.x) / 2,
        labelY: (start.y + end.y) / 2,
      };
    }
  }

  // Primarily horizontal flow
  if (dx > 0) {
    // Source is left of destination
    const start = sa.right;
    const end = da.left;
    const cpX = (start.x + end.x) / 2;
    return {
      d: `M ${start.x} ${start.y} C ${cpX} ${start.y}, ${cpX} ${end.y}, ${end.x} ${end.y}`,
      labelX: cpX,
      labelY: Math.min(start.y, end.y) - 8,
    };
  } else {
    // Source is right of destination
    const start = sa.left;
    const end = da.right;
    const cpX = (start.x + end.x) / 2;
    return {
      d: `M ${start.x} ${start.y} C ${cpX} ${start.y}, ${cpX} ${end.y}, ${end.x} ${end.y}`,
      labelX: cpX,
      labelY: Math.min(start.y, end.y) - 8,
    };
  }
}

/**
 * Build a Map<id, DiagramNode> for quick lookups.
 */
export function buildNodeMap(nodes: DiagramNode[]): Map<string, DiagramNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}
