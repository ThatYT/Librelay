import test from 'node:test';
import assert from 'node:assert/strict';
import {isValidBillingPolicy} from '../src/utils/billing.mjs';

test('admin billing policies accept each direction, free traffic and fractional multipliers', () => {
  for (const mode of ['both','upload','download'])
    for (const multiplier of [0,0.0001,0.5,1,2.5,1000])
      assert.equal(isValidBillingPolicy(mode,multiplier),true);
  for (const [mode,multiplier] of [['other',1],['both',-1],['both',1001],['both',0.00001],['both',NaN],['both',Infinity],['both','1']])
    assert.equal(isValidBillingPolicy(mode,multiplier),false);
});
