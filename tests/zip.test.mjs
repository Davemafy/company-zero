import assert from 'node:assert/strict';
import {zipFiles} from '../lib/zip.mjs';
const z=zipFiles([{name:'index.html',content:'<!doctype html><title>Hi</title>'},{name:'styles.css',content:'body{color:red}'}]);
assert.equal(z.readUInt32LE(0),0x04034b50);
assert.ok(z.includes(Buffer.from('index.html')));
assert.ok(z.includes(Buffer.from('styles.css')));
assert.equal(z.readUInt32LE(z.length-22),0x06054b50);
console.log('zip artifact: PASS');
