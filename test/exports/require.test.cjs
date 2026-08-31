const assert = require('assert');
const install = require('tsds-install');

describe('exports .cjs', () => {
  it('defaults', () => {
    assert.equal(typeof install, 'function');
  });
});
