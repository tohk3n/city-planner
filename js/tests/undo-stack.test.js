import assert from 'node:assert/strict';
import { push, pop, clear, canUndo, beginBatch, commitBatch, batching } from '../core/undo-stack.js';

let pass = 0;
function ok(cond, msg) { assert.ok(cond, msg); pass++; }
function eq(a, b, msg) { assert.deepStrictEqual(a, b, msg); pass++; }

// Fresh state for each group
function reset() { clear(); }

// --- Basic push/pop ---
{
  reset();
  ok(!canUndo(), 'empty stack cannot undo');
  eq(pop(), null, 'pop empty returns null');

  push({ type: 'paint', hexes: [{ q: 0, r: 0, color: '#ff0000' }] });
  ok(canUndo(), 'can undo after push');

  const entry = pop();
  eq(entry.type, 'paint', 'popped entry type');
  ok(!canUndo(), 'empty after pop');
}

// --- Capacity eviction ---
{
  reset();
  // MAX is 100, push 102
  for (let i = 0; i < 102; i++) push({ type: 'x', n: i });
  // oldest 2 evicted, newest is n=101
  eq(pop().n, 101, 'most recent survives');
  // drain and count
  let count = 1;
  while (pop()) count++;
  eq(count, 100, 'capped at 100');
}

// --- Clear ---
{
  reset();
  push({ type: 'x' });
  push({ type: 'y' });
  clear();
  ok(!canUndo(), 'cannot undo after clear');
}

// --- Batch: merges paint entries, deduplicates by earliest snapshot ---
{
  reset();
  beginBatch();
  ok(batching(), 'batching flag is on');

  push({ type: 'paint', hexes: [{ q: 0, r: 0, color: 'red' }] });
  push({ type: 'paint', hexes: [{ q: 1, r: 0, color: 'red' }] });
  push({ type: 'paint', hexes: [{ q: 0, r: 0, color: 'blue' }] }); // revisited

  // Nothing on the real stack yet
  ok(!canUndo(), 'batch entries not on stack until commit');

  commitBatch();
  ok(!batching(), 'batching flag off after commit');
  ok(canUndo(), 'merged entry on stack');

  const entry = pop();
  eq(entry.type, 'paint', 'merged entry is paint');
  eq(entry.hexes.length, 2, 'deduplicated to 2 unique hexes');

  const hex00 = entry.hexes.find(h => h.q === 0 && h.r === 0);
  eq(hex00.color, 'red', 'keeps earliest snapshot per hex');
}

// --- Batch: empty batch pushes nothing ---
{
  reset();
  beginBatch();
  commitBatch();
  ok(!canUndo(), 'empty batch adds nothing');
}

// --- Batch: clear during batch discards it ---
{
  reset();
  beginBatch();
  push({ type: 'paint', hexes: [] });
  clear();
  ok(!batching(), 'clear kills batch');
  commitBatch(); // should not throw
  ok(!canUndo(), 'commit after clear is safe');
}

console.log(`undo-stack: ${pass} assertions passed`);