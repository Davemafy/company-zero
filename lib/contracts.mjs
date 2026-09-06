export class DomainError extends Error{constructor(message,status=400,details){super(message);this.status=status;this.details=details}}
export function validateSchema(schema,value,path='$'){
  if(!schema)return [];const e=[],t=schema.type;
  if(t==='object'&&(value===null||typeof value!=='object'||Array.isArray(value)))return [`${path} must be object`];
  if(t==='array'&&!Array.isArray(value))return [`${path} must be array`];
  if(t==='string'&&typeof value!=='string')return [`${path} must be string`];
  if(t==='number'&&typeof value!=='number')return [`${path} must be number`];
  if(t==='integer'&&(!Number.isInteger(value)))return [`${path} must be integer`];
  if(t==='boolean'&&typeof value!=='boolean')return [`${path} must be boolean`];
  if(t==='object'&&value&&typeof value==='object'&&!Array.isArray(value)){
    for(const k of schema.required||[])if(value[k]===undefined)e.push(`${path}.${k} required`);
    for(const [k,s] of Object.entries(schema.properties||{}))if(value[k]!==undefined)e.push(...validateSchema(s,value[k],`${path}.${k}`));
    if(schema.additionalProperties===false)for(const k of Object.keys(value))if(!(k in (schema.properties||{})))e.push(`${path}.${k} additional property not allowed`);
  }
  if(t==='array'&&schema.items&&Array.isArray(value))value.forEach((x,i)=>e.push(...validateSchema(schema.items,x,`${path}[${i}]`)));
  if(schema.enum&&!schema.enum.includes(value))e.push(`${path} not in enum`);
  if(typeof value==='string'){if(schema.minLength!=null&&value.length<schema.minLength)e.push(`${path} too short`);if(schema.maxLength!=null&&value.length>schema.maxLength)e.push(`${path} too long`)}
  return e;
}
