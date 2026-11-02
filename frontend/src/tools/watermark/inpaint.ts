/** Repairs marked pixels by extending nearby image structure inward. */
export function inpaint(source: ImageData, mask: Uint8Array, radius = 28): ImageData {
  const { width, height } = source;
  const total = width * height;
  if (mask.length !== total) throw new Error('蒙版尺寸与图片不符');
  const marked = mask.reduce((sum, value) => sum + (value ? 1 : 0), 0);
  if (!marked) throw new Error('请先涂选需要修复的区域');
  if (marked > 300000 || marked / total > 0.35) throw new Error('选区过大，请缩小范围或分次修复');
  const output = new ImageData(new Uint8ClampedArray(source.data), width, height);
  const pending = new Uint8Array(mask);
  const queued = new Uint8Array(total);
  const queue = new Int32Array(marked);
  let head = 0;
  let tail = 0;
  const directions = [-1, 1, -width, width];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    if (!pending[index]) continue;
    if ((x > 0 && !pending[index - 1]) || (x + 1 < width && !pending[index + 1]) || (y > 0 && !pending[index - width]) || (y + 1 < height && !pending[index + width])) { queue[tail++] = index; queued[index] = 1; }
  }
  while (head < tail) {
    const index = queue[head++];
    if (!pending[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    let bestScore = Infinity;
    let best = -1;
    const search = Math.max(12, Math.min(64, radius));
    const sampleCount = 64;
    for (let sample = 0; sample < sampleCount; sample++) {
      const angle = sample * 2.399963229728653 + (index % 37) * 0.17;
      const distance = 2 + search * Math.sqrt((sample + 0.5) / sampleCount);
      const sx = Math.round(x + Math.cos(angle) * distance);
      const sy = Math.round(y + Math.sin(angle) * distance);
      if (sx < 2 || sy < 2 || sx >= width - 2 || sy >= height - 2) continue;
      const candidate = sy * width + sx;
      if (mask[candidate]) continue;
      let score = 0;
      let compared = 0;
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nx = x + dx; const ny = y + dy;
        const cx = sx + dx; const cy = sy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
        const neighbor = ny * width + nx;
        const sampleNeighbor = cy * width + cx;
        if (pending[neighbor] || mask[sampleNeighbor]) continue;
        const a = neighbor * 4; const b = sampleNeighbor * 4;
        for (let channel = 0; channel < 3; channel++) score += Math.abs(output.data[a + channel] - source.data[b + channel]);
        compared++;
      }
      if (compared === 0) continue;
      score = score / compared + distance * 0.15;
      if (score < bestScore) { bestScore = score; best = candidate; }
    }
    const target = index * 4;
    if (best >= 0) {
      const origin = best * 4;
      for (let channel = 0; channel < 4; channel++) output.data[target + channel] = source.data[origin + channel];
    } else {
      let count = 0;
      const sums = [0, 0, 0, 0];
      for (const offset of directions) {
        const neighbor = index + offset;
        if (neighbor < 0 || neighbor >= total || pending[neighbor]) continue;
        if (Math.abs(neighbor % width - x) > 1) continue;
        for (let channel = 0; channel < 4; channel++) sums[channel] += output.data[neighbor * 4 + channel];
        count++;
      }
      if (count) for (let channel = 0; channel < 4; channel++) output.data[target + channel] = sums[channel] / count;
    }
    pending[index] = 0;
    for (const offset of directions) {
      const neighbor = index + offset;
      if (neighbor < 0 || neighbor >= total || !pending[neighbor] || queued[neighbor]) continue;
      const nx = neighbor % width;
      if (Math.abs(nx - x) > 1) continue;
      queue[tail++] = neighbor;
      queued[neighbor] = 1;
    }
  }
  return output;
}
