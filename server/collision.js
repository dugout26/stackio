// Spatial hash grid for efficient collision detection
// Divides the map into cells; entities are bucketed by cell position
// Lookups only check nearby cells instead of all entities O(n^2)

export class SpatialHash {
  constructor(cellSize, mapWidth, mapHeight) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(mapWidth / cellSize);
    this.rows = Math.ceil(mapHeight / cellSize);
    this.grid = new Map();
  }

  clear() {
    this.grid.clear();
  }

  _key(col, row) {
    return col + row * this.cols;
  }

  _cellCoords(x, y) {
    return {
      col: Math.floor(x / this.cellSize),
      row: Math.floor(y / this.cellSize),
    };
  }

  insert(entity) {
    const { col, row } = this._cellCoords(entity.x, entity.y);
    const key = this._key(col, row);
    let cell = this.grid.get(key);
    if (!cell) {
      cell = [];
      this.grid.set(key, cell);
    }
    cell.push(entity);
  }

  /**
   * Query all entities near a point within a search radius.
   * Returns entities in cells that overlap the search area.
   */
  query(x, y, radius) {
    const results = [];
    const seen = new Set();
    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const key = this._key(col, row);
        const cell = this.grid.get(key);
        if (!cell) continue;
        for (const entity of cell) {
          if (!seen.has(entity)) {
            seen.add(entity);
            results.push(entity);
          }
        }
      }
    }
    return results;
  }
}

/** Circle-circle overlap test */
export function circleCollision(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const radSum = r1 + r2;
  return dx * dx + dy * dy < radSum * radSum;
}

/** Euclidean distance */
export function distance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Squared distance (avoids sqrt for fast comparisons) */
export function distanceSq(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}

/** Point to line segment distance (for laser collision) */
export function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return distance(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return distance(px, py, projX, projY);
}

/** Check if a position is inside the safe zone (center of map) */
export function isInSafeZone(x, y, mapWidth, mapHeight, safeRadius) {
  const cx = mapWidth / 2;
  const cy = mapHeight / 2;
  return distanceSq(x, y, cx, cy) < safeRadius * safeRadius;
}
