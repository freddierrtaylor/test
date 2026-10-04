// Loads the AFTERSHIFT data, world and sim scripts into one sandbox for headless tests.
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = () => {
  const ctx = { console, Math, JSON, Object, Array, Map, Set, Float32Array, String, Number };
  vm.createContext(ctx);
  for (const f of ['data.js', 'world.js', 'sim.js']) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8').replace(/^var AS = .*$/m, 'var AS = this.AS || {}; this.AS = AS;');
    vm.runInContext(code, ctx, { filename: f });
  }
  return ctx.AS;
};
