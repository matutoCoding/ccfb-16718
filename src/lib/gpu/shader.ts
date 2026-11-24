export const lightComputeShader = /* wgsl */ `
struct Params {
  dims: vec4u,   // leafCount, timeCount, nx, ny
  dims1: vec4u,  // nz, diffuseSamples, occlusionEnabled, fruitCount
  geom: vec4f,   // minX, minY, minZ, cell
  geom1: vec4f,  // maxDistance, extinctionG, albedo, unused
  weather: vec4f,// windSpeed, heatingK, unused, unused
  flags: vec4f   // tempThreshold, afternoonStart, daylightMinutes, unused
}

struct Leaf {
  pos: vec3f,
  area: f32,
  normal: vec3f,
  width: f32
}

struct Fruit {
  pos: vec3f,
  radius: f32
}

struct TimePoint {
  sun: vec3f,
  dtHours: f32,
  dniWm2: f32,
  dhiWm2: f32,
  hour: f32,
  airTempC: f32
}

struct FruitResult {
  directMJ: f32,
  diffuseMJ: f32,
  directMinutes: f32,
  afternoonMinutes: f32,
  peakTempC: f32,
  risk: f32,
  exposureRatio: f32,
  pad: f32
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> leaves: array<Leaf>;
@group(0) @binding(2) var<storage, read> voxels: array<f32>;
@group(0) @binding(3) var<storage, read> times: array<TimePoint>;
@group(0) @binding(4) var<storage, read_write> daily: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> series: array<f32>;
@group(0) @binding(6) var<storage, read> fruits: array<Fruit>;
@group(0) @binding(7) var<storage, read_write> fruitResults: array<FruitResult>;

fn density_at(p: vec3f) -> f32 {
  let ix = i32(floor((p.x - params.geom.x) / params.geom.w));
  let iy = i32(floor((p.y - params.geom.y) / params.geom.w));
  let iz = i32(floor((p.z - params.geom.z) / params.geom.w));
  if (ix < 0 || iy < 0 || iz < 0) { return 0.0; }
  if (u32(ix) >= params.dims.z || u32(iy) >= params.dims.w || u32(iz) >= params.dims1.x) { return 0.0; }
  let index = u32(ix) + params.dims.z * (u32(iy) + params.dims.w * u32(iz));
  return voxels[index];
}

fn exit_distance(origin: vec3f, dir: vec3f) -> f32 {
  let cell = params.geom.w;
  let lo = vec3f(params.geom.x, params.geom.y, params.geom.z);
  let hi = lo + vec3f(f32(params.dims.z), f32(params.dims.w), f32(params.dims1.x)) * cell;
  var tMin = 0.0;
  var tMax = params.geom1.x;
  let axes = array<vec2f, 3>(vec2f(origin.x, dir.x), vec2f(origin.y, dir.y), vec2f(origin.z, dir.z));
  let lows = array<f32, 3>(lo.x, lo.y, lo.z);
  let highs = array<f32, 3>(hi.x, hi.y, hi.z);
  for (var i = 0; i < 3; i++) {
    let o = axes[i].x;
    let d = axes[i].y;
    if (abs(d) < 0.00001) {
      if (o < lows[i] || o > highs[i]) { return -1.0; }
    } else {
      var t1 = (lows[i] - o) / d;
      var t2 = (highs[i] - o) / d;
      if (t1 > t2) { let tmp = t1; t1 = t2; t2 = tmp; }
      tMin = max(tMin, t1);
      tMax = min(tMax, t2);
    }
  }
  if (tMax < max(tMin, 0.0)) { return -1.0; }
  return max(tMax, 0.0);
}

fn transmittance(origin: vec3f, dir: vec3f) -> f32 {
  if (params.dims1.z == 0u) { return 1.0; }
  if (length(dir) < 0.5) { return 1.0; }
  let exitD = exit_distance(origin, dir);
  if (exitD <= params.geom.w * 0.8) { return 1.0; }

  let stepLength = params.geom.w * 0.82;
  let initial = params.geom.w * 0.55;
  var p = origin + dir * initial;
  var traveled = initial;
  var tr = 1.0;
  for (var i = 0; i < 220; i++) {
    if (traveled >= exitD) { break; }
    let segment = min(stepLength, exitD - traveled);
    p = p + dir * segment;
    traveled = traveled + segment;
    let density = density_at(p);
    tr = tr * exp(-params.geom1.y * density * segment);
    if (tr < 0.03) { return 0.03; }
  }
  return tr;
}

fn diffuse_occlusion(origin: vec3f) -> f32 {
  let dirs = array<vec3f, 6>(
    vec3f(0.0, 0.0, 1.0),
    vec3f(0.819, 0.0, 0.574),
    vec3f(-0.819, 0.0, 0.574),
    vec3f(0.0, 0.819, 0.574),
    vec3f(0.0, -0.819, 0.574),
    vec3f(0.579, -0.579, 0.574)
  );
  var total = 0.0;
  for (var i = 0; i < 6; i++) {
    total = total + transmittance(origin, normalize(dirs[i]));
  }
  return total / 6.0;
}

@compute @workgroup_size(64)
fn leafMain(@builtin(global_invocation_id) gid: vec3u) {
  let id = gid.x;
  if (id >= params.dims.x) { return; }
  let leaf = leaves[id];
  let diffuseOcclusion = diffuse_occlusion(leaf.pos);
  let skyView = 0.5 + 0.5 * abs(leaf.normal.z);
  var directMJ = 0.0;
  var diffuseMJ = 0.0;

  for (var t = 0u; t < params.dims.y; t++) {
    let tp = times[t];
    let cosine = abs(dot(leaf.normal, tp.sun));
    let shadow = transmittance(leaf.pos, tp.sun);
    let directWm2 = tp.dniWm2 * cosine * shadow;
    let ghiWm2 = max(tp.dniWm2 * max(tp.sun.z, 0.0) + tp.dhiWm2, 0.0);
    let groundWm2 = ghiWm2 * params.geom1.z * (1.0 - skyView);
    let diffuseWm2 = tp.dhiWm2 * skyView * diffuseOcclusion + groundWm2;
    let index = id * params.dims.y + t;
    series[index] = directWm2 + diffuseWm2;
    directMJ = directMJ + directWm2 * tp.dtHours * 0.0036;
    diffuseMJ = diffuseMJ + diffuseWm2 * tp.dtHours * 0.0036;
  }
  daily[id] = vec2f(directMJ, diffuseMJ);
}

@compute @workgroup_size(64)
fn fruitMain(@builtin(global_invocation_id) gid: vec3u) {
  let id = gid.x;
  if (id >= params.dims1.w) { return; }
  let fruit = fruits[id];
  var result: FruitResult;
  result.peakTempC = -100.0;
  var daylightMinutes = 0.0;

  for (var t = 0u; t < params.dims.y; t++) {
    let tp = times[t];
    let shadow = transmittance(fruit.pos, tp.sun);
    let exposed = select(0.0, 1.0, shadow > 0.45 && tp.dniWm2 > 120.0 && tp.sun.z > 0.08);
    let minutes = tp.dtHours * 60.0;
    daylightMinutes = daylightMinutes + minutes;
    result.directMinutes = result.directMinutes + exposed * minutes;
    if (tp.hour >= params.flags.y) {
      result.afternoonMinutes = result.afternoonMinutes + exposed * minutes;
    }
    result.directMJ = result.directMJ + tp.dniWm2 * shadow * tp.dtHours * 0.0036;
    result.diffuseMJ = result.diffuseMJ + tp.dhiWm2 * (0.55 + 0.45 * shadow) * tp.dtHours * 0.0036;

    let windCooling = 1.0 / (1.0 + 0.12 * params.weather.x);
    let absorbed = tp.dniWm2 * shadow * 0.62 + tp.dhiWm2 * (0.55 + 0.45 * shadow);
    let temperature = tp.airTempC + 1.4 * shadow * windCooling + absorbed * params.weather.y * windCooling;
    result.peakTempC = max(result.peakTempC, temperature);
  }

  result.exposureRatio = result.directMinutes / max(daylightMinutes, 1.0);
  result.risk = select(0.0, 1.0, result.peakTempC >= params.flags.x);
  result.pad = 0.0;
  fruitResults[id] = result;
}
`
