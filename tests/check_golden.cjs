'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{metrics}=require('./golden_metrics.cjs');
const source=JSON.parse(fs.readFileSync('/private/tmp/tiles-test_butterfly.json'));
const result=JSON.parse(fs.readFileSync('/private/tmp/physical-test_butterfly.json'));
const baseline=require('./fixtures/golden-baseline.json'),current=metrics(result,source);
assert.ok(current.physicalValid);assert.ok(current.tiles<=150);
assert.ok(current.majorReferenceCoverage6mm>=baseline.before.majorReferenceCoverage6mm+.15);
assert.ok(current.referenceTilesCovered80Percent>baseline.before.referenceTilesCovered80Percent);
console.log('PASS human-reference structural improvement',current);
