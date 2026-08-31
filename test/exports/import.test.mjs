import assert from 'assert';
import install from 'tsds-install';

describe('exports .mjs', () => {
  it('defaults', () => {
    assert.equal(typeof install, 'function');
  });
});
