// Loads the simulation core from index.html (or core.draft.js during development) for headless tests.
const fs = require('fs'), path = require('path');
module.exports = (opts = {}) => {
  const draft = path.join(__dirname, '..', 'core.draft.js');
  let code;
  if (fs.existsSync(draft)) code = fs.readFileSync(draft, 'utf8');
  else {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const grab = id => { const m = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>')); return m ? m[1] : ''; };
    code = (opts.noPrecomputed ? '' : grab('precomputed')) + '\n' + grab('core');
  }
  return new Function(code.replace(/if \(typeof module[^\n]*\n?/, '') + '\nreturn Core;')();
};
