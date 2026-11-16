// GeoJSON state mesh -> SVG path strings in a fixed 1000-wide box (equirectangular, cos(lat) corrected).
const W = 1000;

const rings = geometry => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).flat();

export function projectMesh(mesh, cityCode) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of mesh.features) for (const ring of rings(f.geometry)) for (const [x, y] of ring) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
  const scale = W / ((maxX - minX) * k);
  const px = ([x, y]) => [(x - minX) * k * scale, (maxY - y) * scale];
  const path = f => rings(f.geometry)
    .map(ring => `M${ring.map(p => px(p).map(n => n.toFixed(1)).join(',')).join('L')}Z`).join('');

  const city = mesh.features.find(f => String(f.properties.codarea) === cityCode);
  if (!city) throw new Error(`municipality ${cityCode} missing from the state mesh`);
  const pts = rings(city.geometry).flat().map(px);
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  return {
    w: W,
    h: Math.round((maxY - minY) * scale),
    others: mesh.features.filter(f => f !== city).map(path).join(''),
    city: path(city),
    // bounding-box centre and size of the city, for the zoom and the marker
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    size: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
  };
}
