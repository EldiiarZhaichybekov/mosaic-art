'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
// Only algorithm inputs, not UI/version file itself. CI rejects an outdated fingerprint.
const files=['api/contour.py','contour_geometry.py','contour_refinement.py','optimized-contour.js','optimized-worker.js','tile-layout.js','requirements.txt'];
function processingVersion(){const hash=crypto.createHash('sha256');for(const file of files)hash.update(file).update('\0').update(fs.readFileSync(path.join(root,file)));return 'r1-r2-'+hash.digest('hex');}
module.exports={processingVersion,files};
