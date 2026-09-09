/* Shared, data-only JSON Schema and validator for the Result 3 wire contract. */
(function(root){'use strict';
const str=(maxLength=400)=>({type:'string',maxLength}),list=(items,minItems=0,maxItems=160)=>({type:'array',items,minItems,maxItems});
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const unit={type:'number',minimum:0,maximum:1};
const planSchema=obj({version:{type:'integer',enum:[1]},objectAnalysis:str(),essentialFeatures:list(str(160),0,12),globalIntent:str(),complexityBudget:{type:'integer',minimum:3,maximum:150},routes:list(obj({id:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,40}$'},role:{type:'string',enum:['outer','structural','characteristic']},priority:unit,sourcePathIds:list(str(40),1,12),source:{type:'string',enum:['result2','result1-restored','ai-reconstructed']},strategy:{type:'string',enum:['FOLLOW','FOLLOW_SIMPLIFIED','CUT_CORNER','MERGE_AND_CONTINUE','BRIDGE','REROUTE','SYMMETRY_ASSIST','RESTORE','TERMINATE']},viaAnchors:list(list(unit,2,2),0,24),reason:str()}),1,48),omissions:list(str(40))});
const qaSchema=obj({version:{type:'integer',enum:[1]},accept:{type:'boolean'},recognizabilityScore:unit,silhouetteScore:unit,cleanlinessScore:unit,compositionScore:unit,repairs:list(obj({routeId:str(40),action:{type:'string',enum:['SIMPLIFY','OMIT']},reason:str()}),0,4)});
class ContractError extends Error{constructor(code,issues){super(code);this.code=code;this.issues=issues;}}
// Deliberately small JSON Schema subset: every keyword used above is handled.
// No coercion, stripping, defaults or normalization of model decisions.
function validate(schema,value){const errors=[];function visit(s,v,path){
const type=v===null?'null':Array.isArray(v)?'array':typeof v;
if((s.type==='integer'?!(Number.isInteger(v)):type!==s.type)){errors.push({path,keyword:'type',expected:s.type,actual:type});return;}
if(s.enum&&!s.enum.includes(v))errors.push({path,keyword:'enum',expected:s.enum,actual:typeof v==='string'?v.slice(0,60):v});
if(type==='number'){if(!Number.isFinite(v)||s.minimum!==undefined&&v<s.minimum||s.maximum!==undefined&&v>s.maximum)errors.push({path,keyword:'range',minimum:s.minimum,maximum:s.maximum,actual:v});}
if(type==='string'){if(s.maxLength!==undefined&&v.length>s.maxLength)errors.push({path,keyword:'maxLength',limit:s.maxLength,actualLength:v.length});if(s.pattern&&!new RegExp(s.pattern).test(v))errors.push({path,keyword:'pattern',expected:s.pattern});}
if(type==='array'){if(v.length<s.minItems||v.length>s.maxItems)errors.push({path,keyword:'itemsCount',minimum:s.minItems,maximum:s.maxItems,actualLength:v.length});v.slice(0,200).forEach((x,i)=>visit(s.items,x,path+'/'+i));}
if(type==='object'){for(const k of s.required||[])if(!Object.hasOwn(v,k))errors.push({path:path+'/'+k,keyword:'required'});for(const k of Object.keys(v)){if(!s.properties[k]){errors.push({path:path+'/'+k.slice(0,60),keyword:'additionalProperties'});continue;}visit(s.properties[k],v[k],path+'/'+k);}}
}visit(schema,value,'');return errors.slice(0,40);}
function plan(value,context){const issues=validate(planSchema,value);if(issues.length)throw new ContractError('AI_SCHEMA_INVALID',issues);
const known=new Map(context.paths.map(p=>[p.id,p])),used=new Set();
const error=(code,path,reason)=>{throw new ContractError(code,[{path,keyword:'semantic',reason}]);};
value.omissions.forEach((id,i)=>{if(!known.has(id))error('AI_UNKNOWN_PATH_ID','/omissions/'+i,'ID is not in available source paths');});
value.routes.forEach((r,i)=>{const p='/routes/'+i;
if(used.has(r.id))error('AI_PLAN_SEMANTIC_INVALID',p+'/id','Duplicate route ID');used.add(r.id);
r.sourcePathIds.forEach((id,j)=>{if(!known.has(id))error('AI_UNKNOWN_PATH_ID',p+'/sourcePathIds/'+j,'ID is not in available source paths');if(value.omissions.includes(id))error('AI_PLAN_SEMANTIC_INVALID',p+'/sourcePathIds/'+j,'A selected source path is also omitted');});
if(r.viaAnchors.length<2&&!(r.viaAnchors.length===0&&['FOLLOW','RESTORE'].includes(r.strategy)))error('AI_PLAN_SEMANTIC_INVALID',p+'/viaAnchors','This strategy requires at least two coordinate anchors');
if(r.source==='result1-restored'&&!r.sourcePathIds.some(id=>known.get(id).source==='result1'))error('AI_PLAN_SEMANTIC_INVALID',p+'/sourcePathIds','Restoration requires a Result 1 path');
});if(!value.routes.some(r=>r.role==='outer'))error('AI_PLAN_SEMANTIC_INVALID','/routes','At least one outer route is required');return JSON.parse(JSON.stringify(value));}
function example(context){const p=context.paths.find(p=>p.source==='result2')||context.paths[0];return {version:1,objectAnalysis:'Subject',essentialFeatures:['Main silhouette'],globalIntent:'Preserve identity',complexityBudget:100,routes:[{id:'outer_1',role:'outer',priority:1,sourcePathIds:[p.id],source:p.source==='result1'?'result1-restored':'result2',strategy:'FOLLOW',viaAnchors:[],reason:'Main boundary'}],omissions:[]};}
function shape(value){if(value===null)return 'null';if(Array.isArray(value))return {type:'array',length:value.length};if(typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,24).map(([k,v])=>[k.slice(0,60),shape(v)]));return typeof value;}
const api={planSchema,qaSchema,validate,plan,example,shape,ContractError};if(typeof module!=='undefined')module.exports=api;root.Result3Contract=api;
})(globalThis);
