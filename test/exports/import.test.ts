import assert from 'assert';
import install from 'tsds-install';

describe('exports .ts', () => {
  it('defaults', () => {
    assert.equal(typeof install, 'function');
  });
});
