const table=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(buf){let c=0xffffffff;for(const b of buf)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function dosDateTime(d=new Date()){let year=Math.max(1980,d.getFullYear());return{date:((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(),time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1)}}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(n&0xffff);return b}function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b}
export function zipFiles(files=[]){
  const local=[],central=[];let offset=0;const dt=dosDateTime();
  for(const f of files){
    const name=Buffer.from(String(f.name||'file.txt').replace(/[^a-zA-Z0-9._-]/g,'-'),'utf8');const data=Buffer.from(String(f.content||''),'utf8');const crc=crc32(data);
    const lh=Buffer.concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(dt.time),u16(dt.date),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name]);
    local.push(lh,data);
    const ch=Buffer.concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(dt.time),u16(dt.date),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
    central.push(ch);offset+=lh.length+data.length;
  }
  const centralBuf=Buffer.concat(central),localBuf=Buffer.concat(local);const end=Buffer.concat([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralBuf.length),u32(localBuf.length),u16(0)]);
  return Buffer.concat([localBuf,centralBuf,end]);
}
