import test from 'node:test';
import assert from 'node:assert/strict';
import {numericVersion} from '../src/utils/version.mjs';

test('version labels accept numeric releases and hide legacy commit identifiers', () => {
  assert.equal(numericVersion('1.1.0'),'1.1.0');
  assert.equal(numericVersion('1.10.0'),'1.10.0');
  for (const value of ['a39908b','dev','v1.1.0','1.1.0-a39908b',undefined]) {
    assert.equal(numericVersion(value),'-');
    assert.equal(numericVersion(value,'1.1.0'),'1.1.0');
  }
});
