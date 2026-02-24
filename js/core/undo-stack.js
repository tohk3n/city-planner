// Undo stack. Stores snapshots of state *before* each mutation so we
// can restore it. The app captures what it's about to change, pushes
// the snapshot here, then mutates. Undo pops and hands it back.
//
// Why snapshots instead of inverse commands: every mutation path in
// app.js would need a custom undo function, and they'd all drift out
// of sync. Snapshots are dumb data - harder to get wrong.

const MAX = 100;
const stack = [];
let batch = null;

export function canUndo() { return stack.length > 0; }

export function push(entry) {
  if (batch) { batch.push(entry); return; }
  if (stack.length >= MAX) stack.shift();
  stack.push(entry);
}

export function pop() { return stack.pop() || null; }

export function clear() {
  stack.length = 0;
  batch = null;
}

// Drag gestures call beginBatch before the first mutation.
// All pushes during the batch accumulate into a temp list.
// commitBatch merges them into a single compound entry.
export function beginBatch() { batch = []; }

export function commitBatch() {
  if (!batch || batch.length === 0) { batch = null; return; }
  const entries = batch;
  batch = null;

  // Merge consecutive paint entries - a drag stroke is one logical action.
  // Deduplicates by hex key, keeping the earliest snapshot (the true "before").
  if (entries.every(e => e.type === 'paint')) {
    const seen = new Map();
    for (const entry of entries) {
      for (const h of entry.hexes) {
        const key = `${h.q},${h.r}`;
        if (!seen.has(key)) seen.set(key, h);
      }
    }
    push({ type: 'paint', hexes: [...seen.values()] });
    return;
  }

  // Merge consecutive depth entries - slider drag is one logical action.
  // Same idea: deduplicate by tile key, keep the earliest depth (pre-drag).
  if (entries.every(e => e.type === 'depth')) {
    const seen = new Map();
    for (const entry of entries) {
      for (const t of entry.tiles) {
        if (!seen.has(t.key)) seen.set(t.key, t);
      }
    }
    push({ type: 'depth', tiles: [...seen.values()] });
    return;
  }

  // Non-paint batches: push each individually (shouldn't happen, but safe)
  for (const entry of entries) push(entry);
}

// Exposed for the drag handler to check if a batch is already open
export function batching() { return batch !== null; }